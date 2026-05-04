/**
 * WorkspaceBridge - Automatic sync between Workspace and Excalidraw
 *
 * This component handles:
 * 1. Loading drawings into Excalidraw when activeDrawing changes
 * 2. Auto-saving Excalidraw changes back to the workspace
 * 3. Saving current drawing before switching to another
 */

import { useEffect, useRef, useCallback } from 'react';
import { useWorkspace } from '../state';

export interface ExcalidrawImperativeAPI {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    commitToStore?: boolean;
  }) => void;
  resetScene: () => void;
  scrollToContent: () => void;
}

export interface WorkspaceBridgeProps {
  /**
   * The Excalidraw imperative API
   */
  excalidrawAPI: ExcalidrawImperativeAPI | null;

  /**
   * Auto-save interval in milliseconds (default: 2000)
   * Set to 0 to disable auto-save
   */
  autoSaveInterval?: number;

  /**
   * Called when a drawing is loaded into Excalidraw
   */
  onDrawingLoad?: (drawingId: string) => void;

  /**
   * Called when a drawing is saved
   */
  onDrawingSave?: (drawingId: string) => void;
}

/**
 * WorkspaceBridge component - place this inside your Excalidraw wrapper
 *
 * @example
 * ```tsx
 * const ExcalidrawWrapper = () => {
 *   const [excalidrawAPI, setExcalidrawAPI] = useState(null);
 *
 *   return (
 *     <>
 *       <WorkspaceBridge excalidrawAPI={excalidrawAPI} />
 *       <Excalidraw excalidrawAPI={setExcalidrawAPI} />
 *     </>
 *   );
 * };
 * ```
 */
export function WorkspaceBridge({
  excalidrawAPI,
  autoSaveInterval = 2000,
  onDrawingLoad,
  onDrawingSave,
}: WorkspaceBridgeProps): null {
  const { activeDrawing, saveCurrentDrawing } = useWorkspace();

  const lastDrawingIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);

  // Save current drawing to workspace
  const saveDrawing = useCallback(async () => {
    if (!excalidrawAPI || !activeDrawing || isLoadingRef.current) return;

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      // Filter out volatile appState properties
      const persistentAppState = {
        viewBackgroundColor: appState.viewBackgroundColor,
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        // Add other persistent properties as needed
      };

      await saveCurrentDrawing(activeDrawing.id, elements as unknown[], persistentAppState, files);
      onDrawingSave?.(activeDrawing.id);
    } catch (error) {
      console.error('[WorkspaceBridge] Failed to save drawing:', error);
    }
  }, [excalidrawAPI, activeDrawing, saveCurrentDrawing, onDrawingSave]);

  // Schedule auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (autoSaveInterval <= 0) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(saveDrawing, autoSaveInterval);
  }, [saveDrawing, autoSaveInterval]);

  // Load drawing into Excalidraw when activeDrawing changes
  useEffect(() => {
    if (!excalidrawAPI || !activeDrawing) return;

    // Skip if same drawing
    if (lastDrawingIdRef.current === activeDrawing.id) return;

    // Save previous drawing before switching
    if (lastDrawingIdRef.current !== null) {
      // Cancel pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // Save immediately (fire and forget)
      saveDrawing();
    }

    // Mark as loading to prevent saving during load
    isLoadingRef.current = true;
    lastDrawingIdRef.current = activeDrawing.id;

    // Load new drawing
    try {
      excalidrawAPI.updateScene({
        elements: (activeDrawing.elements as unknown[]) || [],
        appState: activeDrawing.appState || {},
        commitToStore: true,
      });

      onDrawingLoad?.(activeDrawing.id);
    } catch (error) {
      console.error('[WorkspaceBridge] Failed to load drawing:', error);
    } finally {
      // Small delay before allowing saves again
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 100);
    }
  }, [excalidrawAPI, activeDrawing, saveDrawing, onDrawingLoad]);

  // Listen for Excalidraw changes via polling (since we can't hook into onChange directly)
  useEffect(() => {
    if (!excalidrawAPI || autoSaveInterval <= 0) return;

    // Set up a mutation observer on scene changes via periodic check
    let lastElementCount = 0;
    let lastChecksum = '';

    const checkForChanges = () => {
      if (isLoadingRef.current || !excalidrawAPI) return;

      try {
        const elements = excalidrawAPI.getSceneElements();
        const currentCount = elements.length;
        const currentChecksum = JSON.stringify(elements.slice(-1)); // Quick checksum of last element

        if (currentCount !== lastElementCount || currentChecksum !== lastChecksum) {
          lastElementCount = currentCount;
          lastChecksum = currentChecksum;
          scheduleSave();
        }
      } catch {
        // Ignore errors during check
      }
    };

    const intervalId = setInterval(checkForChanges, 1000);

    return () => {
      clearInterval(intervalId);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [excalidrawAPI, autoSaveInterval, scheduleSave]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Final save
      saveDrawing();
    };
  }, [saveDrawing]);

  // This component renders nothing
  return null;
}

export default WorkspaceBridge;
