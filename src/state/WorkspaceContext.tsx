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

export function WorkspaceProvider({ children, lang = 'en' }: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const updated = await updateDrawing(activeDrawing.id, updateData);
      if (updated) {
        setActiveDrawing(updated);
        setDrawings((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save drawing');
    }
  }, [activeDrawing]);

  const value: WorkspaceContextValue = {
    workspace,
    drawings,
    activeDrawing,
    isLoading,
    error,
    lang,
    t,
    createNewDrawing,
    switchDrawing,
    renameDrawing,
    removeDrawing,
    duplicateCurrentDrawing,
    saveCurrentDrawing,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
