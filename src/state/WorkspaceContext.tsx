import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  Drawing,
  Workspace,
  getOrCreateDefaultWorkspace,
  getDrawing,
  getAllDrawings,
  createDrawing,
  updateDrawing,
  deleteDrawing,
  duplicateDrawing,
  addDrawingToWorkspace,
  removeDrawingFromWorkspace,
  setActiveDrawing as setActiveDrawingInStore,
} from '../storage';
import { getTranslations, type Translations } from '../i18n';

export interface WorkspaceContextValue {
  // State
  workspace: Workspace | null;
  drawings: Drawing[];
  activeDrawing: Drawing | null;
  isLoading: boolean;
  error: string | null;
  isTabLocked: boolean; // true = this tab owns the workspace, false = another tab owns it

  // Language
  lang: string;
  t: Translations;

  // Actions
  createNewDrawing: (name?: string) => Promise<Drawing | null>;
  switchDrawing: (id: string) => Promise<void>;
  renameDrawing: (id: string, name: string) => Promise<void>;
  removeDrawing: (id: string) => Promise<void>;
  duplicateCurrentDrawing: () => Promise<Drawing | null>;

  // For Excalidraw integration
  saveCurrentDrawing: (elements: unknown[], appState: Record<string, unknown>, files?: Record<string, unknown>) => Promise<void>;
  saveDrawingById: (id: string, elements: unknown[], appState: Record<string, unknown>, files?: Record<string, unknown>) => Promise<void>;

  // Refresh
  refreshDrawings: () => Promise<void>;

  // Export/Import
  exportWorkspace: () => Promise<void>;
  importWorkspace: () => Promise<void>;
  exportDrawingAsExcalidraw: (id: string) => Promise<void>;
  importExcalidrawFile: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

/**
 * Hook to get current language and translations
 * Can be used by any component within WorkspaceProvider
 */
export function useWorkspaceLang(): { lang: string; t: Translations } {
  const context = useContext(WorkspaceContext);
  if (!context) {
    // Return English as fallback if used outside provider
    return { lang: 'en', t: getTranslations('en') };
  }
  return { lang: context.lang, t: context.t };
}

interface WorkspaceProviderProps {
  children: ReactNode;
  /**
   * Language code (e.g., 'sv', 'en', 'sv-SE')
   * Pass Excalidraw's langCode here to sync languages
   * Falls back to English if not supported
   */
  lang?: string;
}

// Generate unique tab ID
const TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const LOCK_KEY = 'rita-workspace-active-tab';
const LOCK_CHANNEL = 'rita-workspace-lock';

export function WorkspaceProvider({ children, lang = 'en' }: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTabLocked, setIsTabLocked] = useState(true);

  // Tab locking: only one tab can auto-save at a time
  useEffect(() => {
    // Claim the lock
    localStorage.setItem(LOCK_KEY, TAB_ID);
    setIsTabLocked(true);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(LOCK_CHANNEL);

      // Notify other tabs
      channel.postMessage({ type: 'tab-activated', tabId: TAB_ID });

      // Listen for other tabs claiming the lock
      channel.onmessage = (event) => {
        if (event.data?.type === 'tab-activated' && event.data.tabId !== TAB_ID) {
          setIsTabLocked(false);
        }
      };
    } catch {
      // BroadcastChannel not supported, fallback to storage events
    }

    // Also listen for storage changes (fallback for older browsers)
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_KEY && e.newValue !== TAB_ID) {
        setIsTabLocked(false);
      }
    };
    window.addEventListener('storage', onStorage);

    // Re-claim on focus
    const onFocus = () => {
      localStorage.setItem(LOCK_KEY, TAB_ID);
      setIsTabLocked(true);
      channel?.postMessage({ type: 'tab-activated', tabId: TAB_ID });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      channel?.close();
      // Release lock if we own it
      if (localStorage.getItem(LOCK_KEY) === TAB_ID) {
        localStorage.removeItem(LOCK_KEY);
      }
    };
  }, []);

  // Get translations based on lang prop
  const t = getTranslations(lang);

  // Initialize workspace on mount
  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);
        const ws = await getOrCreateDefaultWorkspace();
        setWorkspace(ws);

        const allDrawings = await getAllDrawings();
        const wsDrawings = allDrawings.filter((d) => ws.drawingIds.includes(d.id));
        setDrawings(wsDrawings);

        if (ws.activeDrawingId) {
          const active = await getDrawing(ws.activeDrawingId);
          setActiveDrawing(active || null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspace');
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  const refreshDrawings = useCallback(async (): Promise<void> => {
    if (!workspace) return;
    try {
      const allDrawings = await getAllDrawings();
      const wsDrawings = allDrawings.filter((d) => workspace.drawingIds.includes(d.id));
      setDrawings(wsDrawings);
      if (workspace.activeDrawingId) {
        const active = await getDrawing(workspace.activeDrawingId);
        if (active) setActiveDrawing(active);
      }
    } catch (err) {
      // silent refresh
    }
  }, [workspace]);

  const createNewDrawing = useCallback(async (name?: string): Promise<Drawing | null> => {
    if (!workspace) return null;

    try {
      // Use translated default name
      const defaultName = `${t.newDrawing} ${drawings.length + 1}`;
      const drawing = await createDrawing(name || defaultName);
      await addDrawingToWorkspace(workspace.id, drawing.id);
      await setActiveDrawingInStore(workspace.id, drawing.id);

      setDrawings((prev) => [...prev, drawing]);
      setActiveDrawing(drawing);
      setWorkspace((prev) => prev ? {
        ...prev,
        drawingIds: [...prev.drawingIds, drawing.id],
        activeDrawingId: drawing.id,
      } : null);

      return drawing;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create drawing');
      return null;
    }
  }, [workspace, drawings.length, t]);

  const switchDrawing = useCallback(async (id: string): Promise<void> => {
    if (!workspace) return;

    try {
      const drawing = await getDrawing(id);
      if (drawing) {
        await setActiveDrawingInStore(workspace.id, id);
        setActiveDrawing(drawing);
        setWorkspace((prev) => prev ? { ...prev, activeDrawingId: id } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch drawing');
    }
  }, [workspace]);

  const renameDrawing = useCallback(async (id: string, name: string): Promise<void> => {
    try {
      const updated = await updateDrawing(id, { name });
      if (updated) {
        setDrawings((prev) => prev.map((d) => (d.id === id ? updated : d)));
        if (activeDrawing?.id === id) {
          setActiveDrawing(updated);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename drawing');
    }
  }, [activeDrawing]);

  const removeDrawing = useCallback(async (id: string): Promise<void> => {
    if (!workspace || drawings.length <= 1) return;

    try {
      await deleteDrawing(id);
      const updatedWorkspace = await removeDrawingFromWorkspace(workspace.id, id);

      setDrawings((prev) => prev.filter((d) => d.id !== id));

      if (updatedWorkspace) {
        setWorkspace(updatedWorkspace);
        if (activeDrawing?.id === id && updatedWorkspace.activeDrawingId) {
          const newActive = await getDrawing(updatedWorkspace.activeDrawingId);
          setActiveDrawing(newActive || null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete drawing');
    }
  }, [workspace, drawings.length, activeDrawing]);

  const duplicateCurrentDrawing = useCallback(async (): Promise<Drawing | null> => {
    if (!activeDrawing || !workspace) return null;

    try {
      const duplicate = await duplicateDrawing(activeDrawing.id);
      if (duplicate) {
        await addDrawingToWorkspace(workspace.id, duplicate.id);
        setDrawings((prev) => [...prev, duplicate]);
        setWorkspace((prev) => prev ? {
          ...prev,
          drawingIds: [...prev.drawingIds, duplicate.id],
        } : null);
        return duplicate;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate drawing');
      return null;
    }
  }, [activeDrawing, workspace]);

  const saveCurrentDrawing = useCallback(async (
    elements: unknown[],
    appState: Record<string, unknown>,
    files?: Record<string, unknown>
  ): Promise<void> => {
    if (!activeDrawing) return;

    try {
      const updateData: { elements: unknown[]; appState: Record<string, unknown>; files?: Record<string, unknown> } = {
        elements,
        appState,
      };
      if (files) {
        updateData.files = files;
      }
      await updateDrawing(activeDrawing.id, updateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save drawing');
    }
  }, [activeDrawing]);

  const saveDrawingById = useCallback(async (
    id: string,
    elements: unknown[],
    appState: Record<string, unknown>,
    files?: Record<string, unknown>
  ): Promise<void> => {
    try {
      const updateData: { elements: unknown[]; appState: Record<string, unknown>; files?: Record<string, unknown> } = {
        elements,
        appState,
      };
      if (files) {
        updateData.files = files;
      }
      await updateDrawing(id, updateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save drawing');
    }
  }, []);

  const exportWorkspace = useCallback(async (): Promise<void> => {
    try {
      const exportData = {
        version: 1,
        name: workspace?.name || 'Min Arbetsyta',
        exportedAt: new Date().toISOString(),
        drawings: drawings.map((d) => ({
          name: d.name,
          elements: d.elements,
          appState: d.appState,
          files: d.files,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arbetsyta-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export workspace');
    }
  }, [workspace, drawings]);

  const importWorkspace = useCallback(async (): Promise<void> => {
    if (!workspace) return;

    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      const file = await new Promise<File | null>((resolve) => {
        input.onchange = () => resolve(input.files?.[0] || null);
        input.click();
      });

      if (!file) return;

      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !Array.isArray(data.drawings)) {
        throw new Error('Invalid workspace file');
      }

      for (const d of data.drawings) {
        const drawing = await createDrawing(d.name || t.newDrawing);
        await updateDrawing(drawing.id, {
          elements: d.elements || [],
          appState: d.appState || {},
          files: d.files || {},
        });
        await addDrawingToWorkspace(workspace.id, drawing.id);
      }

      // Refresh state
      const allDrawings = await getAllDrawings();
      const ws = await getOrCreateDefaultWorkspace();
      const wsDrawings = allDrawings.filter((dr) => ws.drawingIds.includes(dr.id));
      setWorkspace(ws);
      setDrawings(wsDrawings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import workspace');
    }
  }, [workspace, t]);

  const exportDrawingAsExcalidraw = useCallback(async (id: string): Promise<void> => {
    try {
      const drawing = drawings.find((d) => d.id === id) || await getDrawing(id);
      if (!drawing) return;

      const excalidrawData = {
        type: 'excalidraw',
        version: 2,
        source: 'rita-workspace',
        elements: drawing.elements || [],
        appState: {
          viewBackgroundColor: '#ffffff',
          ...(drawing.appState || {}),
        },
        files: drawing.files || {},
      };

      const blob = new Blob([JSON.stringify(excalidrawData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${drawing.name || 'ritning'}.excalidraw`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export drawing');
    }
  }, [drawings]);

  const importExcalidrawFile = useCallback(async (): Promise<void> => {
    if (!workspace) return;

    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.excalidraw,.excalidraw.json,.json';
      input.multiple = true;

      const files = await new Promise<FileList | null>((resolve) => {
        input.onchange = () => resolve(input.files);
        input.click();
      });

      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate it looks like an Excalidraw file
        if (!data.elements && !data.type) {
          continue;
        }

        const name = file.name.replace(/\.(excalidraw|json)$/gi, '') || t.newDrawing;
        const drawing = await createDrawing(name);
        await updateDrawing(drawing.id, {
          elements: data.elements || [],
          appState: data.appState || {},
          files: data.files || {},
        });
        await addDrawingToWorkspace(workspace.id, drawing.id);
      }

      // Refresh state
      const allDrawings = await getAllDrawings();
      const ws = await getOrCreateDefaultWorkspace();
      const wsDrawings = allDrawings.filter((dr) => ws.drawingIds.includes(dr.id));
      setWorkspace(ws);
      setDrawings(wsDrawings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import drawing');
    }
  }, [workspace, t]);

  const value: WorkspaceContextValue = {
    workspace,
    drawings,
    activeDrawing,
    isLoading,
    error,
    isTabLocked,
    lang,
    t,
    createNewDrawing,
    switchDrawing,
    renameDrawing,
    removeDrawing,
    duplicateCurrentDrawing,
    saveCurrentDrawing,
    saveDrawingById,
    refreshDrawings,
    exportWorkspace,
    importWorkspace,
    exportDrawingAsExcalidraw,
    importExcalidrawFile,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
