# Rita Workspace

Multi-drawing workspace feature for Rita (Excalidraw fork based on B310-digital/excalidraw).

## Features

- **Multiple drawings** - Create and manage multiple drawings in one workspace
- **Folders** - Organize drawings in folders
- **Auto-save** - All drawings saved locally in IndexedDB
- **Multi-tab conflict detection** - Prevents data loss when same drawing is open in multiple tabs
- **F5 preserves write ownership** - TAB_ID and openedAt persist in sessionStorage across page refresh
- **Cross-tab refresh** - Creating/renaming/deleting drawings in one tab auto-refreshes other tabs via BroadcastChannel
- **Workspace toggle** - Preview feature that can be enabled/disabled per browser tab
- **Export/Import** - Export workspace as JSON, export all drawings as individual .excalidraw files, import .excalidraw files
- **i18n support** - Swedish and English with automatic Excalidraw language sync
- **Optimized loading** - DB pre-warming and parallel initialization
- **Smart drawing naming** - counts drawings from IndexedDB to avoid duplicate names across tabs

## Installation

```bash
npm install rita-workspace
# or
yarn add rita-workspace
```

## Integration Guide

### 1. `App.tsx` - Add Provider

```tsx
import { WorkspaceProvider, useWorkspace, DrawingsDialog } from "rita-workspace";

const ExcalidrawApp = () => (
  <WorkspaceProvider lang="sv">
    <ExcalidrawWrapper />
  </WorkspaceProvider>
);
```

### 2. Use workspace in your component

```tsx
const ExcalidrawWrapper = () => {
  const {
    activeDrawing,
    saveCurrentDrawing,
    saveDrawingById,
    isDrawingConflict,
  } = useWorkspace();

  // Load drawing into canvas when activeDrawing changes
  useEffect(() => {
    if (!excalidrawAPI || !activeDrawing) return;
    excalidrawAPI.updateScene({
      elements: activeDrawing.elements || [],
      appState: activeDrawing.appState || {},
    });
  }, [activeDrawing?.id]);

  // Auto-save on canvas changes (debounced)
  const onChange = (elements, appState, files) => {
    if (activeDrawing && !isDrawingConflict) {
      saveCurrentDrawing(elements, { viewBackgroundColor: appState.viewBackgroundColor }, files);
    }
  };
};
```

### 3. Add DrawingsDialog for management UI

```tsx
const [showDialog, setShowDialog] = useState(false);

<DrawingsDialog
  open={showDialog}
  onClose={() => setShowDialog(false)}
  onDrawingSelect={() => setShowDialog(false)}
  renderThumbnail={(drawing) => <DrawingThumbnail drawing={drawing} />}
/>
```

## Multi-Tab Conflict Detection

When the same drawing is open in multiple browser tabs, the workspace automatically detects this and makes the later tab **read-only** to prevent data loss.

### How it works

1. Each tab registers itself with a unique `TAB_ID` in `localStorage`
2. When a drawing is opened, the tab records which drawing it has and when it opened it
3. If another tab already has the same drawing open (opened earlier), `isDrawingConflict` becomes `true`
4. The conflicted tab is read-only — `saveCurrentDrawing` and `saveDrawingById` silently skip saves
5. When the first tab closes or switches to another drawing, the conflict resolves automatically

### External conflict check

```tsx
import { isDrawingOpenedEarlierInOtherTab } from "rita-workspace";

// Returns true if another tab opened this drawing before the current tab
if (isDrawingOpenedEarlierInOtherTab(drawingId)) {
  // Don't save — another tab owns this drawing
}
```

### Communication between tabs

- **BroadcastChannel** (`rita-workspace-tabs`) — instant notification when tabs open/close/switch drawings
- **localStorage** (`rita-workspace-tabs`) — persistent tab registry, backup for BroadcastChannel
- **Stale tab cleanup** — on mount, pings other tabs via BroadcastChannel and removes entries that don't respond

## Workspace Toggle (Preview Feature)

The workspace can be enabled/disabled per browser tab using `sessionStorage`:

```tsx
// Each tab reads its own toggle state
const [workspaceEnabled] = useState(() =>
  sessionStorage.getItem("rita-workspace-enabled") === "true"
);
```

- Default: **off** (each new tab starts without workspace)
- State stored in `sessionStorage` (not shared between tabs)
- When disabled: auto-save to workspace skipped, drawing-switch disabled, footer hidden

### Auto-start preference

Users can opt into starting every new tab in workspace mode via a checkbox in `DrawingsDialog`. The preference is stored in `localStorage['rita-workspace-auto-start']` (`"true"` to enable, removed when disabled). The host app reads this flag at init time as a fallback when `sessionStorage` has no explicit value:

```tsx
const [workspaceEnabled] = useState(() => {
  const sessionVal = sessionStorage.getItem("rita-workspace-enabled");
  if (sessionVal === "true") return true;
  if (sessionVal === "false") return false;
  return localStorage.getItem("rita-workspace-auto-start") === "true";
});
```

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `WorkspaceProvider` | React context provider. Props: `lang`, `children` |
| `DrawingsDialog` | Management dialog. Props: `open`, `onClose`, `onDrawingSelect` (called on both switch and create), `renderThumbnail` |

### Hooks

| Hook | Returns |
|------|---------|
| `useWorkspace()` | Full workspace state and actions |
| `useWorkspaceLang()` | `{ lang, t }` — current language and translations |

### Exported functions

| Function | Description |
|----------|-------------|
| `isDrawingOpenedEarlierInOtherTab(id)` | Check if another tab has this drawing open |
| `warmDB()` | Pre-warm IndexedDB connection (called automatically at import) |

### useWorkspace() returns

```tsx
const {
  // State
  workspace,          // Workspace | null
  drawings,           // Drawing[]
  folders,            // Folder[]
  activeDrawing,      // Drawing | null
  isLoading,          // boolean
  error,              // string | null
  isDrawingConflict,  // boolean — true if read-only (another tab has this drawing)
  lang,               // string
  t,                  // Translations

  // Drawing actions
  createNewDrawing,       // (name?, folderId?, activate=true) => Promise<Drawing | null>
  switchDrawing,          // (id) => Promise<void>
  renameDrawing,          // (id, name) => Promise<void>
  removeDrawing,          // (id) => Promise<void>
  duplicateCurrentDrawing, // () => Promise<Drawing | null>

  // Folder actions
  createFolder,       // (name) => Promise<Folder | null>
  renameFolder,       // (id, name) => Promise<void>
  deleteFolder,       // (id) => Promise<void>
  moveDrawingToFolder, // (drawingId, folderId) => Promise<void>

  // Save (blocked if drawing is in conflict)
  saveCurrentDrawing, // (elements, appState, files?) => Promise<void>
  saveDrawingById,    // (id, elements, appState, files?) => Promise<void>

  // Utilities
  refreshDrawings,    // () => Promise<void>
  exportWorkspace,    // () => Promise<void>
  importWorkspace,    // () => Promise<void>
  exportDrawingAsExcalidraw, // (id) => Promise<void>
  exportAllDrawingsAsExcalidraw, // () => Promise<void> — downloads all as .excalidraw files
  importExcalidrawFile,      // () => Promise<void> — imports .excalidraw files; switches to the last imported drawing
} = useWorkspace();
```

## Data Storage

Drawings are stored in **IndexedDB** (`rita-workspace` database, version 2):

```typescript
interface Drawing {
  id: string;           // nanoid
  name: string;
  folderId: string | null;
  elements: unknown[];  // Excalidraw elements
  appState: Record<string, unknown>;
  files: Record<string, unknown>;  // Image files
  createdAt: number;
  updatedAt: number;
}
```

## Language Support

| Code | Language |
|------|----------|
| `sv`, `sv-SE` | Swedish |
| `en`, `en-US` | English (default) |

## Development

```bash
yarn build    # Build with tsup (cjs + esm + dts)
yarn dev      # Watch mode
yarn test     # Run tests with vitest
yarn typecheck # TypeScript check
```

## License

MIT
