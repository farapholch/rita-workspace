# Rita Workspace - Technical Specification

## Overview

This document describes the technical implementation of the multi-drawing workspace feature for Rita.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Rita Application                        │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│   Workspace     │           Excalidraw Canvas               │
│   Sidebar       │                                           │
│                 │                                           │
│  ┌───────────┐  │                                           │
│  │ Drawing 1 │◄─┼── Active                                  │
│  ├───────────┤  │                                           │
│  │ Drawing 2 │  │                                           │
│  ├───────────┤  │                                           │
│  │ Drawing 3 │  │                                           │
│  ├───────────┤  │                                           │
│  │    [+]    │  │                                           │
│  └───────────┘  │                                           │
│                 │                                           │
└─────────────────┴───────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │       IndexedDB         │
              │  ┌───────────────────┐  │
              │  │ workspace_meta    │  │
              │  │ drawings          │  │
              │  │ files (binary)    │  │
              │  └───────────────────┘  │
              └─────────────────────────┘
```

## IndexedDB Schema

### Database: `rita-workspace`

#### Object Store: `workspaces`
```typescript
{
  id: string;           // UUID
  name: string;         // "My Workspace"
  drawingIds: string[]; // ["drawing-1", "drawing-2"]
  activeDrawingId: string;
  createdAt: number;    // timestamp
  updatedAt: number;    // timestamp
}
```

#### Object Store: `drawings`
```typescript
{
  id: string;           // UUID
  workspaceId: string;  // FK to workspace
  name: string;         // "Flowchart"
  elements: object[];   // Excalidraw elements
  appState: object;     // Excalidraw app state (zoom, scroll, etc)
  createdAt: number;
  updatedAt: number;
}
```

#### Object Store: `files`
```typescript
{
  id: string;           // File ID from Excalidraw
  drawingId: string;    // FK to drawing
  mimeType: string;
  data: ArrayBuffer;    // Binary image data
  createdAt: number;
}
```

## React Components

### WorkspaceProvider
Context provider that manages workspace state.

```typescript
interface WorkspaceContextValue {
  workspace: Workspace | null;
  drawings: Drawing[];
  activeDrawing: Drawing | null;

  // Actions
  createDrawing: (name?: string) => Promise<Drawing>;
  switchDrawing: (id: string) => Promise<void>;
  renameDrawing: (id: string, name: string) => Promise<void>;
  deleteDrawing: (id: string) => Promise<void>;
  duplicateDrawing: (id: string) => Promise<Drawing>;

  // Persistence
  saveCurrentDrawing: () => Promise<void>;
  importDrawing: (file: File) => Promise<Drawing>;
  exportDrawing: (id: string) => Promise<Blob>;
}
```

### WorkspaceSidebar
```typescript
interface WorkspaceSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  width?: number; // default 250px
}
```

Features:
- Collapsible (toggle button or keyboard shortcut)
- Drag-and-drop reordering
- Right-click context menu (rename, duplicate, delete, export)
- Keyboard navigation

### DrawingListItem
```typescript
interface DrawingListItemProps {
  drawing: Drawing;
  isActive: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+N` | New drawing |
| `Ctrl+Tab` | Next drawing |
| `Ctrl+Shift+Tab` | Previous drawing |
| `Ctrl+W` | Close/delete drawing (with confirmation) |
| `F2` | Rename active drawing |
| `Ctrl+B` | Toggle sidebar |

## Auto-save Strategy

1. **Debounced save**: Save 2 seconds after last change
2. **On switch**: Save current drawing before switching
3. **On close**: Save before page unload (beforeunload event)
4. **Periodic**: Background save every 30 seconds

```typescript
const AUTOSAVE_DEBOUNCE_MS = 2000;
const AUTOSAVE_INTERVAL_MS = 30000;
```

## Migration Strategy

For users with existing single drawings:
1. On first load, check for legacy localStorage data
2. If found, create default workspace with single drawing
3. Import legacy data into new IndexedDB structure
4. Clear legacy localStorage (optional, with user consent)

## Performance Considerations

1. **Lazy loading**: Only load active drawing's elements into memory
2. **Thumbnail generation**: Generate thumbnails on save, not on list render
3. **Virtual list**: Use virtualization for workspaces with many drawings
4. **Chunked saves**: For large drawings, save in chunks to avoid blocking

## Testing Strategy

### Unit Tests
- WorkspaceProvider state management
- IndexedDB operations
- Drawing CRUD operations

### Integration Tests
- Create/switch/delete workflow
- Import/export functionality
- Auto-save behavior

### E2E Tests
- Full user flow with Playwright
- Cross-browser testing (Chrome, Firefox, Safari)

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] IndexedDB service
- [ ] WorkspaceProvider context
- [ ] Basic CRUD operations

### Phase 2: UI Components (Week 2-3)
- [ ] WorkspaceSidebar component
- [ ] DrawingListItem component
- [ ] Toggle button integration

### Phase 3: Polish (Week 3-4)
- [ ] Keyboard shortcuts
- [ ] Drag-and-drop reordering
- [ ] Context menus
- [ ] Auto-save improvements

### Phase 4: Migration & Testing (Week 4)
- [ ] Legacy data migration
- [ ] Comprehensive testing
- [ ] Documentation
