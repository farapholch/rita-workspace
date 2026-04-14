# Rita Workspace

Multi-drawing workspace feature for Rita (Excalidraw fork based on B310-digital/excalidraw).

## Features

- **Multiple drawings** - Create and manage multiple drawings in one workspace
- **Menu integration** - Seamlessly integrates with Excalidraw's hamburger menu
- **Auto-save** - All drawings saved locally in IndexedDB
- **Rename & delete** - Full drawing management via dialog
- **i18n support** - Swedish and English with automatic Excalidraw language sync

## Installation

```bash
npm install rita-workspace
# or
yarn add rita-workspace
```

## Integration Guide

Two files need to be modified in the B310/Excalidraw fork:

### 1. `excalidraw-app/App.tsx`

**Add import** (at the top with other imports):

```tsx
import { WorkspaceProvider } from "rita-workspace";
```

**Wrap with WorkspaceProvider** (in the `ExcalidrawWrapper` component to access `langCode`):

```tsx
const ExcalidrawWrapper = () => {
  const [langCode] = useAppLangCode();  // Excalidraw's language hook

  // ... existing code ...

  return (
    <WorkspaceProvider lang={langCode}>   {/* <-- Pass langCode here */}
      <div style={{ height: "100%" }}>
        <Excalidraw ... />
      </div>
    </WorkspaceProvider>
  );
};
```

Or if you prefer wrapping at the app level:

```tsx
const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <WorkspaceProvider lang="sv">    {/* <-- Or hardcode language */}
          <ExcalidrawWrapper />
        </WorkspaceProvider>
      </Provider>
    </TopErrorBoundary>
  );
};
```

### 2. `excalidraw-app/components/AppMainMenu.tsx`

**Add imports** (at the top):

```tsx
import React, { useState } from "react";  // Add useState

// Add after other imports:
import { WorkspaceMenuItems, DrawingsDialog } from "rita-workspace";
```

**Add state and menu items** (inside the component):

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
        <MainMenu.Sub.Trigger>📄 Ritningar</MainMenu.Sub.Trigger>
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

## Language Support (i18n)

Rita Workspace supports **Swedish** and **English**, with automatic sync to Excalidraw's language setting.

### Automatic Language Sync

Pass Excalidraw's `langCode` to `WorkspaceProvider` - all child components inherit the language automatically:

```tsx
const [langCode] = useAppLangCode();  // From Excalidraw

<WorkspaceProvider lang={langCode}>
  {/* All components automatically use the same language */}
  <WorkspaceMenuItems ... />
  <DrawingsDialog ... />
</WorkspaceProvider>
```

### Manual Override

You can override the language on individual components if needed:

```tsx
<WorkspaceProvider lang="en">
  {/* This dialog will be in Swedish despite provider being English */}
  <DrawingsDialog lang="sv" ... />
</WorkspaceProvider>
```

### Supported Languages

| Code | Language |
|------|----------|
| `sv`, `sv-SE` | 🇸🇪 Swedish |
| `en`, `en-US` | 🇬🇧 English (default) |

## Result

After integration, a "📄 Ritningar" (or "📄 Drawings") submenu appears in the hamburger menu:

```
┌─────────────────────────┐
│ 📂 Open                 │
│ 💾 Save                 │
│ 📄 Ritningar        ▶  │──┐
│ 📤 Export               │  │  ┌─────────────────────┐
│ ...                     │  └──│ ✓ Current drawing   │
└─────────────────────────┘     │   Sketch 2          │
                                │   Project X         │
                                │ ─────────────────── │
                                │ + Ny ritning        │
                                │ 📄 Hantera...       │
                                └─────────────────────┘
```

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `WorkspaceProvider` | React context provider - wrap your app with this. Accepts `lang` prop. |
| `WorkspaceMenuItems` | Menu items for Excalidraw's MainMenu. Optional `lang` prop for override. |
| `DrawingsDialog` | Modal dialog for managing all drawings. Optional `lang` prop for override. |

### Hooks

| Hook | Description |
|------|-------------|
| `useWorkspace()` | Access workspace state, actions, and current language |
| `useWorkspaceLang()` | Get just the current language and translations |

### useWorkspace() returns

```tsx
const {
  // State
  drawings,           // Drawing[] - all drawings
  activeDrawing,      // Drawing | null - currently active
  isLoading,          // boolean
  error,              // string | null

  // Language
  lang,               // string - current language code
  t,                  // Translations object

  // Actions
  createNewDrawing,   // (name?: string) => Promise<Drawing>
  switchDrawing,      // (id: string) => Promise<void>
  renameDrawing,      // (id: string, name: string) => Promise<void>
  removeDrawing,      // (id: string) => Promise<void>
  saveCurrentDrawing, // (elements, appState) => Promise<void>
} = useWorkspace();
```

## Data Storage

Drawings are stored in IndexedDB with the following structure:

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
