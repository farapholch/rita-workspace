import { IDBPDatabase, DBSchema } from 'idb';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

interface Drawing {
    id: string;
    name: string;
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}
interface Workspace {
    id: string;
    name: string;
    drawingIds: string[];
    activeDrawingId: string | null;
    createdAt: number;
    updatedAt: number;
}
interface RitaWorkspaceDB extends DBSchema {
    workspaces: {
        key: string;
        value: Workspace;
        indexes: {
            'by-updated': number;
        };
    };
    drawings: {
        key: string;
        value: Drawing;
        indexes: {
            'by-updated': number;
        };
    };
}
declare function getDB(): Promise<IDBPDatabase<RitaWorkspaceDB>>;
declare function closeDB(): Promise<void>;

declare function createDrawing(name?: string, elements?: unknown[], appState?: Record<string, unknown>): Promise<Drawing>;
declare function getDrawing(id: string): Promise<Drawing | undefined>;
declare function getAllDrawings(): Promise<Drawing[]>;
declare function updateDrawing(id: string, updates: Partial<Omit<Drawing, 'id' | 'createdAt'>>): Promise<Drawing | undefined>;
declare function deleteDrawing(id: string): Promise<boolean>;
declare function duplicateDrawing(id: string, newName?: string): Promise<Drawing | undefined>;

declare function getOrCreateDefaultWorkspace(): Promise<Workspace>;
declare function getWorkspace(id: string): Promise<Workspace | undefined>;
declare function updateWorkspace(id: string, updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>): Promise<Workspace | undefined>;
declare function addDrawingToWorkspace(workspaceId: string, drawingId: string): Promise<Workspace | undefined>;
declare function removeDrawingFromWorkspace(workspaceId: string, drawingId: string): Promise<Workspace | undefined>;
declare function setActiveDrawing(workspaceId: string, drawingId: string): Promise<Workspace | undefined>;

interface WorkspaceContextValue {
    workspace: Workspace | null;
    drawings: Drawing[];
    activeDrawing: Drawing | null;
    isLoading: boolean;
    error: string | null;
    createNewDrawing: (name?: string) => Promise<Drawing | null>;
    switchDrawing: (id: string) => Promise<void>;
    renameDrawing: (id: string, name: string) => Promise<void>;
    removeDrawing: (id: string) => Promise<void>;
    duplicateCurrentDrawing: () => Promise<Drawing | null>;
    saveCurrentDrawing: (elements: unknown[], appState: Record<string, unknown>) => Promise<void>;
}
declare function useWorkspace(): WorkspaceContextValue;
interface WorkspaceProviderProps {
    children: ReactNode;
}
declare function WorkspaceProvider({ children }: WorkspaceProviderProps): react_jsx_runtime.JSX.Element;

interface SidebarProps {
    isOpen?: boolean;
    onToggle?: () => void;
    width?: number;
}
declare function Sidebar({ isOpen, onToggle, width }: SidebarProps): react_jsx_runtime.JSX.Element;

declare function DrawingList(): react_jsx_runtime.JSX.Element;

interface DrawingListItemProps {
    drawing: Drawing;
    isActive: boolean;
    onSelect: () => void;
    onRename: (name: string) => void;
    onDelete: () => void;
    canDelete: boolean;
}
declare function DrawingListItem({ drawing, isActive, onSelect, onRename, onDelete, canDelete, }: DrawingListItemProps): react_jsx_runtime.JSX.Element;

interface ExcalidrawAPI {
    getSceneElements: () => unknown[];
    getAppState: () => Record<string, unknown>;
    updateScene: (scene: {
        elements?: unknown[];
        appState?: Record<string, unknown>;
    }) => void;
    resetScene: () => void;
}
interface UseExcalidrawBridgeOptions {
    excalidrawAPI: ExcalidrawAPI | null;
    autoSaveInterval?: number;
}
/**
 * Hook to bridge workspace state with Excalidraw API
 *
 * @example
 * ```tsx
 * const [excalidrawAPI, setExcalidrawAPI] = useState(null);
 *
 * useExcalidrawBridge({ excalidrawAPI });
 *
 * return <Excalidraw excalidrawAPI={setExcalidrawAPI} />;
 * ```
 */
declare function useExcalidrawBridge({ excalidrawAPI, autoSaveInterval, }: UseExcalidrawBridgeOptions): {
    scheduleSave: () => void;
};

interface WorkspacePluginProps {
    children: ReactNode;
    defaultSidebarOpen?: boolean;
    sidebarWidth?: number;
}
/**
 * WorkspacePlugin - Wraps Excalidraw to add multi-drawing workspace support
 *
 * @example
 * ```tsx
 * import { WorkspacePlugin } from '@rita/workspace';
 *
 * function App() {
 *   return (
 *     <WorkspacePlugin>
 *       <Excalidraw />
 *     </WorkspacePlugin>
 *   );
 * }
 * ```
 */
declare function WorkspacePlugin(props: WorkspacePluginProps): react_jsx_runtime.JSX.Element;

export { type Drawing, DrawingList, DrawingListItem, Sidebar, type Workspace, type WorkspaceContextValue, WorkspacePlugin, WorkspaceProvider, addDrawingToWorkspace, closeDB, createDrawing, deleteDrawing, duplicateDrawing, getAllDrawings, getDB, getDrawing, getOrCreateDefaultWorkspace, getWorkspace, removeDrawingFromWorkspace, setActiveDrawing, updateDrawing, updateWorkspace, useExcalidrawBridge, useWorkspace };
