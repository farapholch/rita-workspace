import { useEffect, useRef, useCallback } from 'react';
import { useWorkspace } from '../state';

interface ExcalidrawAPI {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  updateScene: (scene: { elements?: unknown[]; appState?: Record<string, unknown> }) => void;
  resetScene: () => void;
}

interface UseExcalidrawBridgeOptions {
  excalidrawAPI: ExcalidrawAPI | null;
  autoSaveInterval?: number; // ms, default 2000
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
export function useExcalidrawBridge({
  excalidrawAPI,
  autoSaveInterval = 2000,
}: UseExcalidrawBridgeOptions) {
  const { activeDrawing, saveCurrentDrawing } = useWorkspace();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDrawingIdRef = useRef<string | null>(null);

  // Load drawing when activeDrawing changes
  useEffect(() => {
    if (!excalidrawAPI || !activeDrawing) return;

    // Only update if drawing actually changed
    if (lastDrawingIdRef.current === activeDrawing.id) return;
    lastDrawingIdRef.current = activeDrawing.id;

    excalidrawAPI.updateScene({
      elements: activeDrawing.elements as unknown[],
      appState: activeDrawing.appState,
    });
  }, [excalidrawAPI, activeDrawing]);

  // Auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (!excalidrawAPI) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Capture the active drawing id NOW so the deferred save can verify
    // we're still on the same drawing when it fires.
    const expectedId = activeDrawing?.id;
    if (!expectedId) return;

    saveTimeoutRef.current = setTimeout(async () => {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      await saveCurrentDrawing(expectedId, elements, appState);
    }, autoSaveInterval);
  }, [excalidrawAPI, saveCurrentDrawing, autoSaveInterval, activeDrawing]);

  // Save on unmount or before switching
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    scheduleSave,
  };
}
