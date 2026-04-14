# Rita Workspace

Multi-drawing workspace feature for Rita (Excalidraw fork based on B310-digital/excalidraw).

## Features

- **Multiple drawings** - Create and manage multiple drawings in one workspace
- **Menu integration** - Seamlessly integrates with Excalidraw's hamburger menu
- **Auto-save** - All drawings saved locally in IndexedDB
- **Auto-sync** - Automatic sync between workspace and Excalidraw canvas
- **Rename & delete** - Full drawing management via dialog
- **i18n support** - Swedish and English with automatic Excalidraw language sync

## Installation

```bash
npm install rita-workspace
# or
yarn add rita-workspace
```

## Integration Guide

Three files need to be modified in the B310/Excalidraw fork:

### 1. `excalidraw-app/App.tsx` - Add Provider and Bridge

**Add imports:**

```tsx
import { WorkspaceProvider, WorkspaceBridge } from "rita-workspace";
```

**Wrap ExcalidrawApp with WorkspaceProvider:**

```tsx
const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <WorkspaceProvider lang="sv">    {/* <-- Add this */}
          <ExcalidrawWrapper />
        </WorkspaceProvider>               {/* <-- And this */}
      </Provider>
    </TopErrorBoundary>
  );
};
```

**Add WorkspaceBridge inside ExcalidrawWrapper** (this syncs the canvas automatically):

```tsx
const ExcalidrawWrapper = () => {
  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  // ... existing code ...

  return (
    <div style={{ height: "100%" }}>
      {/* === ADD THIS - Auto-syncs workspace with Excalidraw === */}
      <WorkspaceBridge excalidrawAPI={excalidrawAPI} />

      <Excalidraw
        excalidrawAPI={excalidrawRefCallback}
        // ... rest of props ...
      />
    </div>
  );
};
```

### 2. `excalidraw-app/components/AppMainMenu.tsx` - Add Menu Items

**Add imports:**

```tsx
import React, { useState } from "react";

import { WorkspaceMenuItems, DrawingsDialog } from "rita-workspace";
import { LoadIcon } from "../components/icons";  // Excalidraw's folder icon
```

**Add state and menu items:**

```tsx
export const AppMainMenu: React.FC<{...}> = React.memo((props) => {
  const [showDrawingsDialog, setShowDrawingsDialog] = useState(false);

  return (
    <>
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />

      {/* === RITA WORKSPACE === */}
      <MainMenu.Sub>
        <MainMenu.Sub.Trigger>{LoadIcon} Arbetsyta</MainMenu.Sub.Trigger>
        <MainMenu.Sub.Content>
          <WorkspaceMenuItems
            onManageDrawings={() => setShowDrawingsDialog(true)}
          />
        </MainMenu.Sub.Content>
      </MainMenu.Sub>

      <MainMenu.DefaultItems.Export />
      {/* ... rest of menu items ... */}
    </MainMenu>

    <DrawingsDialog
      open={showDrawingsDialog}
      onClose={() => setShowDrawingsDialog(false)}
    />
    </>
  );
});
```

## How It Works

1. **WorkspaceProvider** - Manages workspace state (drawings list, active drawing)
2. **WorkspaceBridge** - Automatically syncs between workspace and Excalidraw:
   - Loads drawing into canvas when you switch drawings
   - Auto-saves canvas changes back to workspace
   - Saves current drawing before switching to another
3. **WorkspaceMenuItems** - Provides the menu UI for switching drawings
4. **DrawingsDialog** - Full management UI (rename, delete, create)

## Language Support (i18n)

Pass Excalidraw's `langCode` to `WorkspaceProvider`:

```tsx
const [langCode] = useAppLangCode();

<WorkspaceProvider lang={langCode}>
  {/* All components automatically use the same language */}
</WorkspaceProvider>
```

| Code | Language |
|------|----------|
| `sv`, `sv-SE` | 🇸🇪 Swedish |
| `en`, `en-US` | 🇬🇧 English (default) |

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `WorkspaceProvider` | React context provider. Props: `lang` |
| `WorkspaceBridge` | Auto-syncs workspace ↔ Excalidraw. Props: `excalidrawAPI`, `autoSaveInterval` |
| `WorkspaceMenuItems` | Menu items for MainMenu. Props: `onManageDrawings`, `lang` |
| `DrawingsDialog` | Management dialog. Props: `open`, `onClose`, `lang` |

### Hooks

| Hook | Description |
|------|-------------|
| `useWorkspace()` | Access workspace state and actions |
| `useWorkspaceLang()` | Get current language and translations |

### useWorkspace() returns

```tsx
const {
  // State
  drawings,           // Drawing[] - all drawings
  activeDrawing,      // Drawing | null - currently active
  isLoading,          // boolean
  error,              // string | null
  lang,               // string - current language code
  t,                  // Translations object

  // Actions
  createNewDrawing,   // (name?: string) => Promise<Drawing>
  switchDrawing,      // (id: string) => Promise<void>
  renameDrawing,      // (id: string, name: string) => Promise<void>
  removeDrawing,      // (id: string) => Promise<void>
  saveCurrentDrawing, // (elements, appState, files?) => Promise<void>
} = useWorkspace();
```

### WorkspaceBridge Props

```tsx
<WorkspaceBridge
  excalidrawAPI={excalidrawAPI}     // Required - from Excalidraw
  autoSaveInterval={2000}            // Optional - ms between saves (default: 2000)
  onDrawingLoad={(id) => {}}         // Optional - called when drawing loads
  onDrawingSave={(id) => {}}         // Optional - called when drawing saves
/>
```

## Data Storage

Drawings are stored in IndexedDB:

```typescript
interface Drawing {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

## Links

- **npm:** https://www.npmjs.com/package/rita-workspace
- **B310 Excalidraw Fork:** https://github.com/b310-digital/excalidraw
- **Original Excalidraw:** https://github.com/excalidraw/excalidraw

## License

MIT
