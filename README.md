# Rita Workspace

Multi-drawing workspace feature for Rita (Trafikverket's Excalidraw fork based on B310-digital/excalidraw).

## Problem

Currently Rita only supports one active drawing at a time. Users need to manually export/import drawings to switch between them.

## Solution

Add a workspace feature that allows users to:
- Create multiple drawings within a single workspace
- Switch between drawings with a simple sidebar/tab GUI
- Store all drawings locally in the browser (IndexedDB/localStorage)
- Name and organize drawings

## Features

### MVP (v1.0)
- [ ] Sidebar with list of drawings
- [ ] Create new drawing button
- [ ] Switch between drawings (preserves state)
- [ ] Rename drawings
- [ ] Delete drawings
- [ ] Auto-save to browser storage (IndexedDB)
- [ ] Import existing .excalidraw files into workspace

### Future (v2.0+)
- [ ] Folders/categories for drawings
- [ ] Search drawings
- [ ] Thumbnail previews
- [ ] Export entire workspace
- [ ] Cloud sync (optional)
- [ ] Link/reference between drawings

## Technical Approach

### Storage
- Use IndexedDB for persistent storage (better than localStorage for binary data)
- Each drawing stored as separate entry with metadata
- Workspace metadata stored separately

### Data Structure
```typescript
interface Drawing {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

interface Workspace {
  id: string;
  name: string;
  drawings: string[]; // Drawing IDs
  activeDrawingId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### UI Components
- `WorkspaceSidebar` - Collapsible sidebar showing drawing list
- `DrawingListItem` - Individual drawing entry with actions
- `NewDrawingButton` - Creates new blank drawing
- `WorkspaceProvider` - React context for workspace state

## Integration with B310 Fork

This feature will be implemented as a modular addition that can be:
1. Merged into the main B310 fork as a PR
2. Maintained as a separate layer/plugin for Rita

## Development

### Prerequisites
- Node.js 18+
- Yarn
- B310 Excalidraw fork cloned locally

### Setup
```bash
# Clone B310 fork
git clone https://github.com/b310-digital/excalidraw.git rita
cd rita

# Apply workspace patches
git remote add workspace https://github.com/farapholch/rita-workspace.git
git fetch workspace
git merge workspace/main
```

## Links

- **B310 Excalidraw Fork:** https://github.com/b310-digital/excalidraw
- **Original Excalidraw:** https://github.com/excalidraw/excalidraw
- **Rita (TRV):** Internal deployment at Trafikverket

## License

MIT (same as Excalidraw)
