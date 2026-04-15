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
} from '../storage';
import { getTranslations, type Translations } from '../i18n';

export interface WorkspaceContextValue {
  // State
  workspace: Workspace | null;
  drawings: Drawing[];
  activeDrawing: Drawing | null;
  isLoading: boolean;
  error: string | null;
  isDrawingConflict: boolean; // true = another tab has the same drawing open

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

const TABS_KEY = 'rita-workspace-tabs'; // JSON: { tabId: { drawingId, openedAt }, ... }
const TAB_CHANNEL = 'rita-workspace-tabs';

interface TabEntry {
  drawingId: string;
  openedAt: number; // timestamp when this tab opened the drawing
}

function getTabsMap(): Record<string, TabEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || '{}');
    // Migrate old format: { tabId: drawingId } → { tabId: { drawingId, openedAt } }
    const result: Record<string, TabEntry> = {};
    for (const [tabId, value] of Object.entries(raw)) {
      if (typeof value === 'string') {
        result[tabId] = { drawingId: value, openedAt: 0 };
      } else if (value && typeof value === 'object' && 'drawingId' in (value as TabEntry)) {
        result[tabId] = value as TabEntry;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function setTabDrawing(drawingId: string | null) {
  const tabs = getTabsMap();
  if (drawingId) {
    // Only update openedAt if this is a different drawing than before
    const existing = tabs[TAB_ID];
    if (existing && existing.drawingId === drawingId) {
      // Keep existing timestamp
    } else {
      tabs[TAB_ID] = { drawingId, openedAt: Date.now() };
    }
  } else {
    delete tabs[TAB_ID];
  }
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}

/**
 * Check if another tab opened the same drawing BEFORE this tab.
 * Only the tab that opened the drawing later is considered in conflict.
 */
function isDrawingOpenedEarlierInOtherTab(drawingId: string): boolean {
  const tabs = getTabsMap();
  const myEntry = tabs[TAB_ID];
  if (!myEntry) return false;
  const myOpenedAt = myEntry.openedAt;

  return Object.entries(tabs).some(
    ([tabId, entry]) =>
      tabId !== TAB_ID &&
      entry.drawingId === drawingId &&
      entry.openedAt <= myOpenedAt
  );
}

export function WorkspaceProvider({ children, lang = 'en' }: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawingConflict, setIsDrawingConflict] = useState(false);

  // Track active drawing per tab
  useEffect(() => {
    const drawingId = activeDrawing?.id || null;
    setTabDrawing(drawingId);

    if (drawingId) {
      setIsDrawingConflict(isDrawingOpenedEarlierInOtherTab(drawingId));
    } else {
      setIsDrawingConflict(false);
    }

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TAB_CHANNEL);
      channel.postMessage({ type: 'drawing-changed', tabId: TAB_ID, drawingId });

      channel.onmessage = (event) => {
        if (event.data?.tabId !== TAB_ID && drawingId) {
          // Another tab changed or closed — recheck conflict
          setIsDrawingConflict(isDrawingOpenedEarlierInOtherTab(drawingId));
        }
      };
    } catch {
      // BroadcastChannel not supported
    }

    // Also listen for localStorage changes (fires when another tab modifies it)
    // This serves as a backup for BroadcastChannel, especially during tab close
    const onStorage = (e: StorageEvent) => {
      if (e.key === TABS_KEY && drawingId) {
        setIsDrawingConflict(isDrawingOpenedEarlierInOtherTab(drawingId));
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [activeDrawing?.id]);

  // Cleanup on tab close — notify other tabs so they can recheck conflict
  useEffect(() => {
    const onUnload = () => {
      const tabs = getTabsMap();
      delete tabs[TAB_ID];
      localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
      try {
        const channel = new BroadcastChannel(TAB_CHANNEL);
        channel.postMessage({ type: 'tab-closed', tabId: TAB_ID });
        channel.close();
      } catch {
        // BroadcastChannel not supported
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
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

        // Determine which drawing to open in this tab:
        // 1. This tab's last drawing (survives page refresh via sessionStorage)
        // 2. First drawing in the list (fallback)
        const lastDrawingId = sessionStorage.getItem('rita-workspace-tab-drawing');
        let active: Drawing | null = null;

        if (lastDrawingId) {
          active = wsDrawings.find((d) => d.id === lastDrawingId) || null;
          if (!active) {
            // Drawing was deleted, try to load from DB
            const fromDb = await getDrawing(lastDrawingId);
            if (fromDb && ws.drawingIds.includes(fromDb.id)) {
              active = fromDb;
            }
          }
        }

        // Fallback: first drawing in list
        if (!active && wsDrawings.length > 0) {
          active = wsDrawings[0];
        }

        if (active) {
          setActiveDrawing(active);
          sessionStorage.setItem('rita-workspace-tab-drawing', active.id);
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
      // Don't change activeDrawing here — each tab manages its own active drawing
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

      setDrawings((prev) => [...prev, drawing]);
      setActiveDrawing(drawing);
      setWorkspace((prev) => prev ? {
        ...prev,
        drawingIds: [...prev.drawingIds, drawing.id],
        activeDrawingId: drawing.id,
      } : null);
      sessionStorage.setItem('rita-workspace-tab-drawing', drawing.id);

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
        setActiveDrawing(drawing);
        setWorkspace((prev) => prev ? { ...prev, activeDrawingId: id } : null);
        sessionStorage.setItem('rita-workspace-tab-drawing', id);
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
    isDrawingConflict,
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
