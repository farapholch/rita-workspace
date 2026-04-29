# Rita Workspace - Modular Architecture

## Design Principles

1. **Minimal coupling** - Workspace-koden ska vara oberoende av Excalidraw internals
2. **Plugin-arkitektur** - Kan aktiveras/inaktiveras utan att påverka kärnfunktionalitet
3. **Självständiga moduler** - Varje modul har ett tydligt ansvar
4. **Enkel uppgradering** - Ska kunna följa B310 upstream utan merge-konflikter

## Modular Structure

```
rita-workspace/
├── src/
│   ├── index.ts                 # Public API export
│   ├── WorkspacePlugin.tsx      # Main plugin wrapper
│   │
│   ├── storage/                 # 🗄️ Data layer (standalone)
│   │   ├── index.ts
│   │   ├── db.ts                # IndexedDB setup
│   │   ├── workspaceStore.ts    # Workspace CRUD
│   │   ├── drawingStore.ts      # Drawing CRUD
│   │   └── migrator.ts          # Legacy data migration
│   │
│   ├── state/                   # 🔄 State management (standalone)
│   │   ├── index.ts
│   │   ├── WorkspaceContext.tsx # React context
│   │   ├── useWorkspace.ts      # Main hook
│   │   ├── useDrawings.ts       # Drawings hook
│   │   └── useAutosave.ts       # Autosave hook
│   │
│   ├── ui/                      # 🎨 UI components (standalone)
│   │   ├── index.ts
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Sidebar.module.css
│   │   │   └── index.ts
│   │   ├── DrawingList/
│   │   │   ├── DrawingList.tsx
│   │   │   ├── DrawingListItem.tsx
│   │   │   └── index.ts
│   │   └── Toolbar/
│   │       ├── WorkspaceToolbar.tsx
│   │       └── index.ts
│   │
│   └── integration/             # 🔌 Excalidraw integration (minimal)
│       ├── index.ts
│       ├── useExcalidrawBridge.ts  # Bridge to Excalidraw API
│       └── types.ts                # Shared types
│
├── package.json                 # Separate npm package
└── tsconfig.json
```

## Module Responsibilities

### Storage Module (`/storage`)
- **Owns:** IndexedDB operations, data persistence
- **Exports:** `workspaceStore`, `drawingStore`, `migrate()`
- **Dependencies:** None (pure data layer)
- **Testable:** Yes, with mock IndexedDB

### State Module (`/state`)
- **Owns:** React state, business logic
- **Exports:** `WorkspaceProvider`, `useWorkspace`, `useDrawings`
- **Dependencies:** Storage module only
- **Testable:** Yes, with mock storage

### UI Module (`/ui`)
- **Owns:** Visual components, styling
- **Exports:** `Sidebar`, `DrawingList`, `WorkspaceToolbar`
- **Dependencies:** State module (via hooks)
- **Testable:** Yes, with Storybook

### Integration Module (`/integration`)
- **Owns:** Excalidraw-specific code
- **Exports:** `useExcalidrawBridge`
- **Dependencies:** Excalidraw types only
- **Testable:** Yes, with mock Excalidraw API

## Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                     Excalidraw (B310 fork)                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    WorkspacePlugin                        │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │  │
│  │  │ Sidebar │──│  State  │──│ Storage │  │ Integration │  │  │
│  │  │   UI    │  │ Context │  │ IndexDB │  │   Bridge    │──┼──┼── getElements()
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘  │  │   setElements()
│  └──────────────────────────────────────────────────────────┘  │   getAppState()
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Excalidraw Host App Integration

The package ships storage, state, dialog, and translations. The host app owns the canvas bridge (feeding Excalidraw's `onChange` into `saveCurrentDrawing` and pushing `activeDrawing.elements` back via `excalidrawAPI.updateScene` on switch).

See [INTEGRATION.md](./INTEGRATION.md) for the full guide with the 10 integration steps used in the reference Excalidraw fork. The minimum is:

```tsx
// 1. Wrap your app
import { WorkspaceProvider } from "rita-workspace";
<WorkspaceProvider lang="sv"><App /></WorkspaceProvider>

// 2. Read state + save on Excalidraw onChange
const { activeDrawing, saveCurrentDrawing } = useWorkspace();

// 3. Push activeDrawing.elements into Excalidraw on switch
useEffect(() => excalidrawAPI?.updateScene({ elements: activeDrawing.elements }), [activeDrawing?.id]);
```

## NPM Package Approach

Published as separate package for easy updates:

```json
{
  "name": "@rita/workspace",
  "version": "1.0.0",
  "main": "dist/index.js",
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

**Benefits:**
- Version independently from Excalidraw
- Easy rollback if issues
- Can test in isolation
- Clear API boundary

## Upgrade Strategy

When B310 releases new version:

1. **Pull upstream changes** to Rita fork
2. **Workspace plugin unchanged** (separate package)
3. **Test integration** with new Excalidraw version
4. **Update peerDependencies** if needed

No merge conflicts expected since workspace code lives in separate directory/package.

## Feature Flags

```typescript
// Easy to disable without removing code
const WORKSPACE_ENABLED = process.env.RITA_WORKSPACE_ENABLED !== 'false';

// In App.tsx
{WORKSPACE_ENABLED ? (
  <WorkspacePlugin>
    <Excalidraw />
  </WorkspacePlugin>
) : (
  <Excalidraw />
)}
```

## Testing Strategy

Each module testable in isolation:

```bash
# Unit tests per module
npm test -- --scope=storage
npm test -- --scope=state
npm test -- --scope=ui

# Integration tests
npm run test:integration

# E2E with real Excalidraw
npm run test:e2e
```
