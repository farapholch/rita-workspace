# Host App Integration

This guide describes how to integrate `rita-workspace` into an Excalidraw-based host app. The reference implementation is the [B310-digital Excalidraw fork](https://github.com/farapholch/Excalidraw-1) (`excalidraw-app/`).

## What you need to add

The package ships **storage, state, dialog, and translations**. The host app is responsible for the **canvas bridge**: feeding scene elements into the workspace's save methods and loading workspace drawings into Excalidraw on switch.

## 1. Wrap your app in `WorkspaceProvider`

```tsx
// App.tsx (root)
import { WorkspaceProvider } from "rita-workspace";

export const App = () => (
  <WorkspaceProvider lang="sv">
    <ExcalidrawWrapper />
  </WorkspaceProvider>
);
```

`lang` accepts `"sv"`, `"en"`, or any BCP-47 code (falls back to English). Drawings and folders load asynchronously from IndexedDB after mount.

## 2. Per-tab toggle state

Workspace mode is opt-in per browser tab. The host app owns the toggle state in `sessionStorage`, with `localStorage` as auto-start fallback:

```tsx
const [workspaceEnabled, setWorkspaceEnabled] = useState(() => {
  const sessionVal = sessionStorage.getItem("rita-workspace-enabled");
  if (sessionVal === "true") return true;
  if (sessionVal === "false") return false;
  // Auto-start preference (set via DrawingsDialog checkbox)
  return localStorage.getItem("rita-workspace-auto-start") === "true";
});

const toggleWorkspace = () => {
  setWorkspaceEnabled((prev) => {
    const next = !prev;
    sessionStorage.setItem("rita-workspace-enabled", String(next));
    return next;
  });
};
```

When disabled: skip workspace saves and don't load workspace drawings into the canvas.

When **enabled**, on mount the library resolves the active drawing in this order: `sessionStorage['rita-workspace-tab-drawing']` (same tab) → `localStorage['rita-workspace-last-active-drawing']` (cross-tab, last edited drawing) → first drawing in the list. So a user who closes Rita and re-opens it (or opens it via auto-start in a fresh tab) lands on the drawing they last edited, not an arbitrary one.

## 3. Read state with `useWorkspace()`

```tsx
const {
  activeDrawing,        // currently loaded drawing (or null)
  drawings,             // all drawings in this workspace
  saveCurrentDrawing,   // save active drawing's elements/appState/files
  saveDrawingById,      // save by id (e.g. for canvas-import on toggle on)
  createNewDrawing,     // (name?, folderId?, activate=true) => Drawing
  switchDrawing,        // load drawing into the canvas (host renders it)
  isDrawingConflict,    // true if this drawing is open in another tab (read-only)
  refreshDrawings,      // re-pull drawings from DB into React state
} = useWorkspace();
```

## 4. Auto-save canvas changes

On Excalidraw `onChange`, debounce a save to the workspace (3 s recommended):

```tsx
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleChange = (elements, appState, files) => {
  if (!workspaceEnabled || isCollaborating || isDrawingConflict) return;
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    saveCurrentDrawing(elements, appState, files);
  }, 3000);
};
```

Flush the timer when the dialog opens (so thumbnails reflect the latest canvas) and on `beforeunload`.

## 5. Load drawings into Excalidraw on switch

When `activeDrawing` changes, push its elements into Excalidraw via the API:

```tsx
useEffect(() => {
  if (!workspaceEnabled || !excalidrawAPI || !activeDrawing) return;
  excalidrawAPI.updateScene({
    elements: activeDrawing.elements,
    appState: activeDrawing.appState,
  });
  if (activeDrawing.files) {
    excalidrawAPI.addFiles(Object.values(activeDrawing.files));
  }
}, [activeDrawing?.id, workspaceEnabled, excalidrawAPI]);
```

## 6. Refresh on toggle on / dialog open

After toggle on, in-memory `drawings` may be stale (other tabs may have edited while this tab was off). Call `refreshDrawings()` to re-pull from DB so thumbnail cache keys (`id-count-updatedAt`) regenerate:

```tsx
// After toggling workspace on
await refreshDrawings();

// When opening DrawingsDialog
useEffect(() => {
  if (!showDrawingsDialog) return;
  // ...flush pending save...
  void refreshDrawings();
}, [showDrawingsDialog]);
```

Without this, thumbnails may lag behind the actual drawing content until the user reloads (F5).

## 7. Render the dialog

```tsx
import { DrawingsDialog } from "rita-workspace";

<DrawingsDialog
  open={showDrawingsDialog}
  onClose={() => setShowDrawingsDialog(false)}
  onDrawingSelect={() => setShowDrawingsDialog(false)}  // also fires on "Skapa ny ritning"
  renderThumbnail={(drawing) => <YourThumbnailComponent drawing={drawing} />}
/>
```

`onDrawingSelect` fires when the user **switches** drawing **or** clicks **Skapa ny ritning** — close the dialog in both cases.

`renderThumbnail` is optional. The reference implementation uses Excalidraw's `exportToCanvas` with a small cache map keyed by `${id}-${elementCount}-${updatedAt}`.

## 8. Conflict / read-only handling

When two tabs open the same drawing, the second is read-only. Use `isDrawingConflict` to disable saves and `isDrawingOpenedEarlierInOtherTab(id)` for cross-cutting checks (e.g. before a programmatic save):

```tsx
import { isDrawingOpenedEarlierInOtherTab } from "rita-workspace";

if (isDrawingOpenedEarlierInOtherTab(drawingId)) {
  // skip save — another tab owns this drawing
  return;
}
```

Also pass `viewModeEnabled={isDrawingConflict}` to `<Excalidraw>` to lock the canvas visually.

## 9. Optional: handle toggle on based on canvas state

The reference implementation branches on canvas content when the user toggles workspace **on**:

| Canvas state | Existing drawings | Behavior |
|--------------|-------------------|----------|
| Has content | (any) | Import as a new drawing called *"Importerad ritning"* and switch to it (so the user doesn't lose work) |
| Empty | ≥ 2 | Open `DrawingsDialog` so the user picks which drawing to open (or `+ Skapa ny ritning`) |
| Empty | 0 or 1 | Just activate — nothing meaningful to choose between |

Pseudocode for the import path:

```tsx
const onToggleOn = async () => {
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const hasContent = elements.some(e => !e.isDeleted);

  if (!hasContent) {
    if (drawings.length > 1) setShowDrawingsDialog(true);
    return;
  }

  // Skip if a workspace drawing already has identical content (fingerprint match)
  const fingerprint = (els) => els.filter(e => !e.isDeleted).map(e => `${e.id}:${e.version}`).sort().join(",");
  if (drawings.some(d => fingerprint(d.elements ?? []) === fingerprint(elements))) return;

  const drawing = await createNewDrawing("Importerad ritning", null, false);
  await saveDrawingById(drawing.id, elements, appState, files);
  await switchDrawing(drawing.id);
  await refreshDrawings();
};
```

## 10. Optional: replace Excalidraw's "Open from file"

When workspace is on, Excalidraw's default `MainMenu.DefaultItems.LoadScene` would replace the canvas. Most apps prefer to import the file as a new workspace drawing instead:

```tsx
import { useWorkspace } from "rita-workspace";

const { importExcalidrawFile } = useWorkspace();

{workspaceEnabled ? (
  <MainMenu.Item icon={LoadIcon} onSelect={() => importExcalidrawFile()}>
    Öppna från fil
  </MainMenu.Item>
) : (
  <MainMenu.DefaultItems.LoadScene />
)}
```

`importExcalidrawFile()` opens a file picker, accepts multiple `.excalidraw` files, and switches to the last imported drawing.

## Reference implementation files

In the [B310 fork](https://github.com/farapholch/Excalidraw-1):

| File | Role |
|------|------|
| `excalidraw-app/App.tsx` | Provider wrap, toggle state, useWorkspace, save effects, switch effect, conflict detection, dialog rendering, top-right toggle button |
| `excalidraw-app/components/AppMainMenu.tsx` | "Öppna från fil" replacement, dialog open trigger |
| `excalidraw-app/components/AppFooter.tsx` | Drawing/folder picker in the footer |
| `excalidraw-app/package.json` | `"rita-workspace": "X.Y.Z"` dependency |

## Storage notes

- IndexedDB DB name: `rita-workspace`
- Schema migrations are automatic at first import
- Tab coordination via `BroadcastChannel("rita-workspace-tabs")` + `localStorage["rita-workspace-tabs"]` registry
- Stale tabs (closed without cleanup) are pruned on next mount
