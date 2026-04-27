import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import {
  Drawing,
  Folder,
  Workspace,
  getOrCreateDefaultWorkspace,
  getWorkspace,
  getDrawing,
  getAllDrawings,
  createDrawing,
  updateDrawing,
  deleteDrawing,
  duplicateDrawing,
  moveDrawingToFolder as moveDrawingToFolderStore,
  reorderDrawings as reorderDrawingsStore,
  addDrawingToWorkspace,
  removeDrawingFromWorkspace,
  getAllFolders,
  createFolder as createFolderStore,
  renameFolder as renameFolderStore,
  deleteFolder as deleteFolderStore,
  warmDB,
} from '../storage';
import { getTranslations, type Translations } from '../i18n';

// Pre-warm IndexedDB connection at module load time (before React renders)
warmDB();

export interface WorkspaceContextValue {
  // State
  workspace: Workspace | null;
  drawings: Drawing[];
  folders: Folder[];
  activeDrawing: Drawing | null;
  isLoading: boolean;
  error: string | null;
  isDrawingConflict: boolean; // true = another tab has the same drawing open

  // Language
  lang: string;
  t: Translations;

  // Actions
  createNewDrawing: (name?: string, folderId?: string | null, activate?: boolean) => Promise<Drawing | null>;
  switchDrawing: (id: string) => Promise<void>;
  renameDrawing: (id: string, name: string) => Promise<void>;
  removeDrawing: (id: string) => Promise<void>;
  duplicateCurrentDrawing: () => Promise<Drawing | null>;

  // Folder actions
  createFolder: (name: string) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveDrawingToFolder: (drawingId: string, folderId: string | null) => Promise<void>;
  /** Re-numbers `position` for the given drawing IDs in order. Use the full ordered slice
   *  the user reordered (e.g. all root drawings, or all drawings in a folder). */
  reorderDrawings: (orderedIds: string[]) => Promise<void>;

  // For Excalidraw integration
  saveCurrentDrawing: (elements: unknown[], appState: Record<string, unknown>, files?: Record<string, unknown>) => Promise<void>;
  saveDrawingById: (id: string, elements: unknown[], appState: Record<string, unknown>, files?: Record<string, unknown>) => Promise<void>;

  // Refresh
  refreshDrawings: () => Promise<void>;

  // Export/Import
  exportWorkspace: () => Promise<void>;
  importWorkspace: () => Promise<void>;
  exportDrawingAsExcalidraw: (id: string) => Promise<void>;
  exportAllDrawingsAsExcalidraw: () => Promise<void>;
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

// Generate unique tab ID — persist in sessionStorage so F5 keeps the same ID.
// This preserves write-ownership of drawings across page refresh.
// Mutable: may be regenerated if we detect a collision with another tab
// (Chrome/Firefox "Duplicate tab" copies sessionStorage, giving two tabs the same ID).
const TAB_ID_KEY = 'rita-workspace-tab-id';
const TAB_ENTRY_KEY = 'rita-workspace-tab-entry'; // sessionStorage — survives F5

function generateFreshTabId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

let TAB_ID = (() => {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
  } catch {}
  const fresh = generateFreshTabId();
  try { sessionStorage.setItem(TAB_ID_KEY, fresh); } catch {}
  return fresh;
})();

function regenerateTabId(): void {
  TAB_ID = generateFreshTabId();
  try { sessionStorage.setItem(TAB_ID_KEY, TAB_ID); } catch {}
  // The sessionStorage entry was copied from the original tab — discard it
  // so the duplicated tab gets a fresh openedAt (and thus becomes read-only).
  try { sessionStorage.removeItem(TAB_ENTRY_KEY); } catch {}
}

const TABS_KEY = 'rita-workspace-tabs'; // JSON: { tabId: { drawingId, openedAt }, ... }
const TAB_CHANNEL = 'rita-workspace-tabs';

interface TabEntry {
  drawingId: string;
  openedAt: number; // timestamp when this tab opened the drawing
}

// Broadcast a workspace change to other tabs so they can refresh their drawings list
function broadcastWorkspaceChange(): void {
  try {
    const channel = new BroadcastChannel(TAB_CHANNEL);
    channel.postMessage({ type: 'workspace-changed', tabId: TAB_ID });
    channel.close();
  } catch {
    // BroadcastChannel not supported
  }
}

// Cache for parsed tabs map — invalidated on every write
let tabsMapCache: Record<string, TabEntry> | null = null;
let tabsMapRaw: string | null = null;

function getTabsMap(): Record<string, TabEntry> {
  try {
    const raw = localStorage.getItem(TABS_KEY) || '{}';
    // Return cached result if localStorage hasn't changed
    if (raw === tabsMapRaw && tabsMapCache) return tabsMapCache;
    tabsMapRaw = raw;

    const parsed = JSON.parse(raw);
    // Migrate old format: { tabId: drawingId } → { tabId: { drawingId, openedAt } }
    const result: Record<string, TabEntry> = {};
    for (const [tabId, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[tabId] = { drawingId: value, openedAt: 0 };
      } else if (value && typeof value === 'object' && 'drawingId' in (value as TabEntry)) {
        result[tabId] = value as TabEntry;
      }
    }
    tabsMapCache = result;
    return result;
  } catch {
    return {};
  }
}

function setTabDrawing(drawingId: string | null) {
  const tabs = getTabsMap();
  if (drawingId) {
    // Reuse openedAt from:
    // 1. localStorage entry (same session, continuing work)
    // 2. sessionStorage entry (surviving an F5) — preserves write ownership
    // 3. fallback: new timestamp
    const existing = tabs[TAB_ID];
    let openedAt: number;
    if (existing && existing.drawingId === drawingId) {
      openedAt = existing.openedAt;
    } else {
      let sessionEntry: TabEntry | null = null;
      try {
        const raw = sessionStorage.getItem(TAB_ENTRY_KEY);
        if (raw) sessionEntry = JSON.parse(raw) as TabEntry;
      } catch {}
      openedAt = sessionEntry && sessionEntry.drawingId === drawingId
        ? sessionEntry.openedAt
        : Date.now();
    }
    tabs[TAB_ID] = { drawingId, openedAt };
    try {
      sessionStorage.setItem(TAB_ENTRY_KEY, JSON.stringify(tabs[TAB_ID]));
    } catch {}
  } else {
    delete tabs[TAB_ID];
    // IMPORTANT: do NOT clear sessionStorage TAB_ENTRY_KEY here.
    // Initial render briefly has activeDrawing=null before init completes;
    // clearing the sessionStorage entry would lose the old openedAt after F5.
    // The entry will be overwritten by the next setTabDrawing call with a drawingId.
  }
  const json = JSON.stringify(tabs);
  localStorage.setItem(TABS_KEY, json);
  // Invalidate cache since we wrote
  tabsMapCache = tabs;
  tabsMapRaw = json;
}

/**
 * Check if another tab opened the same drawing BEFORE this tab.
 * Only the tab that opened the drawing later is considered in conflict.
 */
export function isDrawingOpenedEarlierInOtherTab(drawingId: string): boolean {
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

// Probe IDs we've sent ourselves — so our own ping-listener (different BroadcastChannel
// instance but same tab) can skip responding to our own id-claim. BroadcastChannel delivers
// to every listener with the same name EXCEPT the exact channel instance that posted, so
// a second channel in the same tab will still receive the message.
const ownProbeIds = new Set<string>();

/**
 * Detect whether another live tab claims the same TAB_ID as this one.
 * Happens when the user duplicates a tab: Chrome/Firefox copy sessionStorage,
 * so both tabs read the same persisted TAB_ID.
 * Resolves true if collision detected within the probe window.
 */
function detectTabIdCollision(): Promise<boolean> {
  return new Promise((resolve) => {
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(TAB_CHANNEL);
    } catch {
      resolve(false);
      return;
    }

    const probeId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    ownProbeIds.add(probeId);

    let collided = false;
    channel.onmessage = (event) => {
      if (event.data?.type === 'id-collision' && event.data?.tabId === TAB_ID) {
        collided = true;
      }
    };
    channel.postMessage({ type: 'id-claim', tabId: TAB_ID, probeId });

    setTimeout(() => {
      channel.close();
      ownProbeIds.delete(probeId);
      resolve(collided);
    }, 300);
  });
}

// Clean up stale tab entries on load by pinging other tabs
function cleanupStaleTabs() {
  const tabs = getTabsMap();
  const otherTabIds = Object.keys(tabs).filter((id) => id !== TAB_ID);
  if (otherTabIds.length === 0) return;

  const alive = new Set<string>();

  try {
    const channel = new BroadcastChannel(TAB_CHANNEL);

    channel.onmessage = (event) => {
      if (event.data?.type === 'pong' && event.data?.tabId) {
        alive.add(event.data.tabId);
      }
    };

    channel.postMessage({ type: 'ping', tabId: TAB_ID });

    // After a short wait, remove tabs that didn't respond
    setTimeout(() => {
      const currentTabs = getTabsMap();
      let changed = false;
      for (const tabId of otherTabIds) {
        if (!alive.has(tabId) && tabId in currentTabs) {
          delete currentTabs[tabId];
          changed = true;
        }
      }
      if (changed) {
        const json = JSON.stringify(currentTabs);
        localStorage.setItem(TABS_KEY, json);
        tabsMapCache = currentTabs;
        tabsMapRaw = json;
      }
      channel.close();
    }, 500);
  } catch {
    // BroadcastChannel not supported — fall back to time-based cleanup
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let changed = false;
    for (const [tabId, entry] of Object.entries(tabs)) {
      if (tabId !== TAB_ID && entry.openedAt < now - maxAge) {
        delete tabs[tabId];
        changed = true;
      }
    }
    if (changed) {
      const json = JSON.stringify(tabs);
      localStorage.setItem(TABS_KEY, json);
      tabsMapCache = tabs;
      tabsMapRaw = json;
    }
  }
}

export function WorkspaceProvider({ children, lang = 'en' }: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawingConflict, setIsDrawingConflict] = useState(false);
  const prevConflictRef = useRef(false);

  // When conflict resolves (true → false), reload drawing from DB
  // so we don't keep stale data from when the tab was read-only
  // IMPORTANT: Never set activeDrawing to null here — that would cause
  // App.tsx to lose track of the drawing and reload from DB, overwriting canvas
  useEffect(() => {
    const wasConflict = prevConflictRef.current;
    prevConflictRef.current = isDrawingConflict;
    // Only reload if THIS tab was in conflict and it resolved
    if (wasConflict && !isDrawingConflict) {
      const id = activeDrawingIdRef.current;
      if (id) {
        getDrawing(id).then((fresh) => {
          // Only update if still the same drawing AND still no conflict
          if (fresh && activeDrawingIdRef.current === id && !prevConflictRef.current) {
            // Update metadata only (name, folderId, etc.) — don't replace elements
            // to avoid overwriting unsaved canvas changes
            setActiveDrawing((prev) => {
              if (!prev || prev.id !== id) return prev;
              return { ...prev, name: fresh.name, folderId: fresh.folderId };
            });
          }
        });
      }
    }
  }, [isDrawingConflict]);

  // Always respond to pings from other tabs (must be mounted before cleanupStaleTabs runs)
  // Also listen for workspace-changed events to auto-refresh the drawings list,
  // and for id-claim probes so duplicated tabs can detect the collision.
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TAB_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === 'ping') {
          channel?.postMessage({ type: 'pong', tabId: TAB_ID });
        } else if (event.data?.type === 'id-claim' && event.data?.tabId === TAB_ID) {
          // Skip echoes of our own probe — same tab, different BroadcastChannel instance
          if (event.data?.probeId && ownProbeIds.has(event.data.probeId)) return;
          // Another tab is claiming our TAB_ID — signal the collision so it regenerates
          channel?.postMessage({ type: 'id-collision', tabId: TAB_ID });
        } else if (event.data?.type === 'workspace-changed' && event.data?.tabId !== TAB_ID) {
          // Another tab created/renamed/deleted a drawing — refresh our list.
          // Read-only: does not touch activeDrawing or write to DB.
          refreshDrawingsRef.current();
        }
      };
    } catch {
      // BroadcastChannel not supported
    }
    return () => { channel?.close(); };
  }, []);

  const hasCleanedUpRef = useRef(false);
  // Gates setTabDrawing until we've confirmed our TAB_ID is unique.
  // Writing to localStorage with a colliding TAB_ID would overwrite the original tab's entry.
  const [tabIdReady, setTabIdReady] = useState(false);

  // Resolve TAB_ID collision (duplicate-tab), then clean up stale tabs and do first conflict check
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      if (await detectTabIdCollision()) {
        regenerateTabId();
      }
      if (cancelled) return;
      setTabIdReady(true);
      cleanupStaleTabs();
      timer = setTimeout(() => {
        hasCleanedUpRef.current = true;
        const drawingId = activeDrawingIdRef.current;
        if (drawingId) {
          setIsDrawingConflict(isDrawingOpenedEarlierInOtherTab(drawingId));
        }
      }, 600);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track active drawing per tab
  useEffect(() => {
    if (!tabIdReady) return; // Don't write to localStorage until TAB_ID is confirmed unique

    const drawingId = activeDrawing?.id || null;
    // Only write when we have a drawing. A null transition during loading (e.g., F5 before
    // workspace init finishes) would delete our localStorage entry; stale-tab cleanup in
    // OTHER tabs is the right place to reap closed tabs, not this effect.
    if (drawingId) setTabDrawing(drawingId);

    // Don't check conflict until stale tabs have been cleaned up (600ms after mount)
    // This prevents false positives from dead tab entries
    if (hasCleanedUpRef.current) {
      if (drawingId) {
        setIsDrawingConflict(isDrawingOpenedEarlierInOtherTab(drawingId));
      } else {
        setIsDrawingConflict(false);
      }
    }

    const recheckConflict = () => {
      if (drawingId) {
        setIsDrawingConflict(isDrawingOpenedEarlierInOtherTab(drawingId));
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TAB_CHANNEL);
      channel.postMessage({ type: 'drawing-changed', tabId: TAB_ID, drawingId });

      channel.onmessage = (event) => {
        if (event.data?.tabId !== TAB_ID) {
          recheckConflict();
        }
      };
    } catch {
      // BroadcastChannel not supported
    }

    // Also listen for localStorage changes (fires when another tab modifies it)
    // This serves as a backup for BroadcastChannel, especially during tab close
    const onStorage = (e: StorageEvent) => {
      if (e.key === TABS_KEY) {
        recheckConflict();
      }
    };
    window.addEventListener('storage', onStorage);

    // Periodic recheck — catches cases where beforeunload didn't fire
    // (e.g., browser crash, force close, or Playwright page.close())
    // Only polls when tab is visible to save battery
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!intervalId && drawingId) {
        intervalId = setInterval(recheckConflict, 5000);
      }
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        recheckConflict(); // Immediate check when tab becomes visible
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      channel?.close();
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopPolling();
    };
  }, [activeDrawing?.id, tabIdReady]);

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

        // Phase 1: Load active drawing ASAP (single DB read) while list loads in parallel
        const lastDrawingId = sessionStorage.getItem('rita-workspace-tab-drawing');
        const activeDrawingPromise = lastDrawingId
          ? getDrawing(lastDrawingId)
          : Promise.resolve(undefined);

        // Phase 2: Load drawing list + folders in parallel with active drawing
        const [allDrawings, allFolders, eagarActive] = await Promise.all([
          getAllDrawings(),
          getAllFolders(),
          activeDrawingPromise,
        ]);

        const wsDrawings = allDrawings.filter((d) => ws.drawingIds.includes(d.id));
        setDrawings(wsDrawings);
        setFolders(allFolders);

        // Determine active drawing:
        // 1. Eagerly loaded from sessionStorage (fastest path)
        // 2. Found in the list
        // 3. First drawing as fallback
        let active: Drawing | null = null;

        if (eagarActive && ws.drawingIds.includes(eagarActive.id)) {
          active = eagarActive;
        } else if (lastDrawingId) {
          active = wsDrawings.find((d) => d.id === lastDrawingId) || null;
        }

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
      // Re-read workspace from DB to pick up drawingIds added by other tabs
      // Don't change activeDrawing here — each tab manages its own active drawing
      // Never write to DB here — refresh is strictly read-only to avoid overwrites
      const [freshWorkspace, allDrawings, allFolders] = await Promise.all([
        getWorkspace(workspace.id),
        getAllDrawings(),
        getAllFolders(),
      ]);
      const drawingIds = freshWorkspace?.drawingIds || workspace.drawingIds;
      const wsDrawings = allDrawings.filter((d) => drawingIds.includes(d.id));
      if (freshWorkspace) {
        // Only update workspace state if drawingIds or name actually changed.
        // Unconditional updates create new object refs and cause infinite loops
        // in consumers whose effects depend on refreshDrawings (dependency changes).
        setWorkspace((prev) => {
          if (!prev) return freshWorkspace;
          const idsEqual =
            prev.drawingIds.length === freshWorkspace.drawingIds.length &&
            prev.drawingIds.every((id, i) => id === freshWorkspace.drawingIds[i]);
          if (idsEqual && prev.name === freshWorkspace.name) {
            return prev;
          }
          return { ...freshWorkspace, activeDrawingId: prev.activeDrawingId };
        });
      }
      setDrawings(wsDrawings);
      setFolders(allFolders);
    } catch (err) {
      // silent refresh
    }
  }, [workspace]);

  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const activeDrawingIdRef = useRef(activeDrawing?.id ?? null);
  activeDrawingIdRef.current = activeDrawing?.id ?? null;
  const refreshDrawingsRef = useRef(refreshDrawings);
  refreshDrawingsRef.current = refreshDrawings;

  const createNewDrawing = useCallback(async (name?: string, folderId?: string | null, activate: boolean = true): Promise<Drawing | null> => {
    if (!workspace) return null;

    // Optimistic: create temp drawing immediately
    const now = Date.now();
    const tempId = `temp-${now}`;
    // Pick the next suffix based on the highest existing "<prefix> N",
    // so deletions/duplicates/imports don't produce gaps or collisions.
    const allDrawings = await getAllDrawings();
    const prefix = t.newDrawing;
    const suffixRegex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
    let maxSuffix = 0;
    for (const d of allDrawings) {
      const m = d.name.match(suffixRegex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxSuffix) maxSuffix = n;
      }
    }
    const defaultName = `${prefix} ${maxSuffix + 1}`;
    const tempDrawing: Drawing = {
      id: tempId, name: name || defaultName, folderId: folderId || null,
      elements: [], appState: {}, files: {}, createdAt: now, updatedAt: now,
    };
    setDrawings((prev) => [...prev, tempDrawing]);
    if (activate) {
      setActiveDrawing(tempDrawing);
      sessionStorage.setItem('rita-workspace-tab-drawing', tempId);
    }

    try {
      const drawing = await createDrawing(name || defaultName, [], {}, folderId);
      await addDrawingToWorkspace(workspace.id, drawing.id);

      // Replace temp with real drawing
      setDrawings((prev) => prev.map((d) => (d.id === tempId ? drawing : d)));
      if (activate) {
        setActiveDrawing(drawing);
        sessionStorage.setItem('rita-workspace-tab-drawing', drawing.id);
      }
      setWorkspace((prev) => prev ? {
        ...prev,
        drawingIds: [...prev.drawingIds, drawing.id],
        ...(activate ? { activeDrawingId: drawing.id } : {}),
      } : null);

      broadcastWorkspaceChange();
      return drawing;
    } catch (err) {
      // Revert
      setDrawings((prev) => prev.filter((d) => d.id !== tempId));
      setError(err instanceof Error ? err.message : 'Failed to create drawing');
      return null;
    }
  }, [workspace, t]);

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
    // Optimistic update
    setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, name, updatedAt: Date.now() } : d)));
    if (activeDrawingIdRef.current === id) {
      setActiveDrawing((prev) => prev ? { ...prev, name, updatedAt: Date.now() } : prev);
    }
    try {
      await updateDrawing(id, { name });
      broadcastWorkspaceChange();
    } catch (err) {
      // Revert — refresh from DB
      refreshDrawings();
      setError(err instanceof Error ? err.message : 'Failed to rename drawing');
    }
  }, [refreshDrawings]);

  const removeDrawing = useCallback(async (id: string): Promise<void> => {
    if (!workspace) return;

    // Optimistic: remove immediately, switch active if needed
    const removedDrawing = drawingsRef.current.find((d) => d.id === id);
    const wasActive = activeDrawingIdRef.current === id;
    const remaining = drawingsRef.current.filter((d) => d.id !== id);

    setDrawings(remaining);
    if (wasActive && remaining.length > 0) {
      setActiveDrawing(remaining[0]);
      sessionStorage.setItem('rita-workspace-tab-drawing', remaining[0].id);
    }

    try {
      await deleteDrawing(id);
      const updatedWorkspace = await removeDrawingFromWorkspace(workspace.id, id);
      if (updatedWorkspace) {
        setWorkspace(updatedWorkspace);
      }
      // If that was the last drawing, create a fresh empty one so the workspace is never empty
      if (remaining.length === 0) {
        await createNewDrawing();
      }
      broadcastWorkspaceChange();
    } catch (err) {
      // Revert
      if (removedDrawing) {
        setDrawings((prev) => [...prev, removedDrawing]);
      }
      setError(err instanceof Error ? err.message : 'Failed to delete drawing');
    }
  }, [workspace, createNewDrawing]);

  const duplicateCurrentDrawing = useCallback(async (): Promise<Drawing | null> => {
    if (!activeDrawingIdRef.current || !workspace) return null;

    // Optimistic: create temp duplicate immediately
    const source = drawingsRef.current.find((d) => d.id === activeDrawingIdRef.current);
    if (!source) return null;

    const now = Date.now();
    const tempId = `temp-dup-${now}`;
    const tempDuplicate: Drawing = {
      ...source, id: tempId, name: `${source.name} (copy)`,
      createdAt: now, updatedAt: now,
    };
    setDrawings((prev) => [...prev, tempDuplicate]);

    try {
      const duplicate = await duplicateDrawing(activeDrawingIdRef.current);
      if (duplicate) {
        await addDrawingToWorkspace(workspace.id, duplicate.id);
        // Replace temp with real
        setDrawings((prev) => prev.map((d) => (d.id === tempId ? duplicate : d)));
        setWorkspace((prev) => prev ? {
          ...prev,
          drawingIds: [...prev.drawingIds, duplicate.id],
        } : null);
        broadcastWorkspaceChange();
        return duplicate;
      }
      // No duplicate returned — remove temp
      setDrawings((prev) => prev.filter((d) => d.id !== tempId));
      return null;
    } catch (err) {
      // Revert
      setDrawings((prev) => prev.filter((d) => d.id !== tempId));
      setError(err instanceof Error ? err.message : 'Failed to duplicate drawing');
      return null;
    }
  }, [workspace]);

  const saveCurrentDrawing = useCallback(async (
    elements: unknown[],
    appState: Record<string, unknown>,
    files?: Record<string, unknown>
  ): Promise<void> => {
    if (!activeDrawing) return;
    // Safety: never save if this drawing is open in another tab (conflict)
    if (isDrawingOpenedEarlierInOtherTab(activeDrawing.id)) return;

    try {
      // Skip if DB has newer data than our in-memory copy — means something
      // external wrote to the drawing and our save would clobber it.
      const fresh = await getDrawing(activeDrawing.id);
      if (fresh && fresh.updatedAt > (activeDrawing.updatedAt ?? 0)) return;
      // Guard: never overwrite non-empty DB content with an empty save.
      // Canvas may report [] briefly during mount / before a reload completes rendering,
      // and beforeunload-triggered saves in that window would erase the drawing.
      if (Array.isArray(elements) && elements.length === 0
          && fresh && Array.isArray(fresh.elements) && fresh.elements.length > 0) {
        return;
      }

      const updateData: { elements: unknown[]; appState: Record<string, unknown>; files?: Record<string, unknown> } = {
        elements,
        appState,
      };
      if (files) {
        updateData.files = files;
      }
      await updateDrawing(activeDrawing.id, updateData);
      // Update in-memory drawings so thumbnails & dialog reflect the latest canvas.
      // Saves are debounced (3s) at the caller, so the cost is bounded.
      const now = Date.now();
      const patch = {
        elements: elements as Drawing['elements'],
        appState: appState as Drawing['appState'],
        ...(files ? { files: files as Drawing['files'] } : {}),
        updatedAt: now,
      };
      setDrawings((prev) => prev.map((d) => (d.id === activeDrawing.id ? { ...d, ...patch } : d)));
      setActiveDrawing((prev) => (prev && prev.id === activeDrawing.id ? { ...prev, ...patch } : prev));
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
    // Safety: never save if this drawing is open in another tab (conflict)
    if (isDrawingOpenedEarlierInOtherTab(id)) return;

    try {
      // Skip if DB has newer data than our in-memory copy for this drawing.
      const inMem = drawingsRef.current.find((d) => d.id === id);
      const fresh = await getDrawing(id);
      if (fresh && inMem && fresh.updatedAt > (inMem.updatedAt ?? 0)) return;
      // Guard: never overwrite non-empty DB content with an empty save (see saveCurrentDrawing).
      if (Array.isArray(elements) && elements.length === 0
          && fresh && Array.isArray(fresh.elements) && fresh.elements.length > 0) {
        return;
      }

      const updateData: { elements: unknown[]; appState: Record<string, unknown>; files?: Record<string, unknown> } = {
        elements,
        appState,
      };
      if (files) {
        updateData.files = files;
      }
      await updateDrawing(id, updateData);
      const now = Date.now();
      const patch = {
        elements: elements as Drawing['elements'],
        appState: appState as Drawing['appState'],
        ...(files ? { files: files as Drawing['files'] } : {}),
        updatedAt: now,
      };
      setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
      setActiveDrawing((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save drawing');
    }
  }, []);

  const exportWorkspace = useCallback(async (): Promise<void> => {
    try {
      const exportData = {
        version: 2,
        name: workspace?.name || 'Min Arbetsyta',
        exportedAt: new Date().toISOString(),
        folders: folders.map((f) => ({
          id: f.id,
          name: f.name,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        })),
        drawings: drawings.map((d) => ({
          name: d.name,
          folderId: d.folderId ?? null,
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
  }, [workspace, drawings, folders]);

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

      // Re-create folders first (v2+) and build old-id → new-id map
      const folderIdMap = new Map<string, string>();
      if (Array.isArray(data.folders)) {
        for (const f of data.folders) {
          if (!f?.name || !f?.id) continue;
          const created = await createFolderStore(f.name);
          folderIdMap.set(f.id, created.id);
        }
      }

      for (const d of data.drawings) {
        const mappedFolderId = d.folderId ? folderIdMap.get(d.folderId) ?? null : null;
        const drawing = await createDrawing(d.name || t.newDrawing, [], {}, mappedFolderId);
        await updateDrawing(drawing.id, {
          elements: d.elements || [],
          appState: d.appState || {},
          files: d.files || {},
        });
        await addDrawingToWorkspace(workspace.id, drawing.id);
      }

      // Refresh state
      const [allDrawings, allFolders, ws] = await Promise.all([
        getAllDrawings(),
        getAllFolders(),
        getOrCreateDefaultWorkspace(),
      ]);
      const wsDrawings = allDrawings.filter((dr) => ws.drawingIds.includes(dr.id));
      setWorkspace(ws);
      setDrawings(wsDrawings);
      setFolders(allFolders);
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

  const exportAllDrawingsAsExcalidraw = useCallback(async (): Promise<void> => {
    try {
      // Ladda alltid senaste data från DB för att garantera att eventuella osparade
      // ändringar i andra flikar kommer med (denna funktion är read-only)
      const all = await getAllDrawings();
      const wsDrawings = workspace
        ? all.filter((d) => workspace.drawingIds.includes(d.id))
        : all;

      for (let i = 0; i < wsDrawings.length; i++) {
        const drawing = wsDrawings[i];
        const excalidrawData = {
          type: 'excalidraw',
          version: 2,
          source: 'rita-workspace',
          elements: drawing.elements || [],
          appState: { viewBackgroundColor: '#ffffff', ...(drawing.appState || {}) },
          files: drawing.files || {},
        };
        const blob = new Blob([JSON.stringify(excalidrawData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Sanera filnamn och lägg till index för att undvika kollisioner
        const safeName = (drawing.name || 'ritning').replace(/[\\/:*?"<>|]/g, '_');
        a.download = `${String(i + 1).padStart(2, '0')}_${safeName}.excalidraw`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // Liten fördröjning så browsern hinner hantera varje nedladdning
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export all drawings');
    }
  }, [workspace]);

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

  const createFolder = useCallback(async (name: string): Promise<Folder | null> => {
    // Optimistic: create a temporary folder immediately
    const now = Date.now();
    const tempId = `temp-${now}`;
    const tempFolder: Folder = { id: tempId, name, createdAt: now, updatedAt: now };
    setFolders((prev) => [...prev, tempFolder]);
    try {
      const folder = await createFolderStore(name);
      // Replace temp with real folder
      setFolders((prev) => prev.map((f) => (f.id === tempId ? folder : f)));
      return folder;
    } catch (err) {
      // Revert
      setFolders((prev) => prev.filter((f) => f.id !== tempId));
      setError(err instanceof Error ? err.message : 'Failed to create folder');
      return null;
    }
  }, []);

  const renameFolder = useCallback(async (id: string, name: string): Promise<void> => {
    // Optimistic update
    const prevName = foldersRef.current.find((f) => f.id === id)?.name;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name, updatedAt: Date.now() } : f)));
    try {
      await renameFolderStore(id, name);
    } catch (err) {
      // Revert
      if (prevName !== undefined) {
        setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: prevName } : f)));
      }
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    }
  }, []);

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    // Optimistic update
    const removedFolder = foldersRef.current.find((f) => f.id === id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setDrawings((prev) => prev.map((d) => d.folderId === id ? { ...d, folderId: null } : d));
    try {
      await deleteFolderStore(id);
    } catch (err) {
      // Revert
      if (removedFolder) {
        setFolders((prev) => [...prev, removedFolder]);
        refreshDrawings();
      }
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  }, [refreshDrawings]);

  const moveDrawingToFolder = useCallback(async (drawingId: string, folderId: string | null): Promise<void> => {
    // Optimistic update — move immediately in UI, persist in background
    setDrawings((prev) => prev.map((d) => (d.id === drawingId ? { ...d, folderId } : d)));
    if (activeDrawingIdRef.current === drawingId) {
      setActiveDrawing((prev) => prev ? { ...prev, folderId } : prev);
    }
    try {
      await moveDrawingToFolderStore(drawingId, folderId);
    } catch (err) {
      // Revert on failure
      setDrawings((prev) => prev.map((d) => (d.id === drawingId ? { ...d, folderId: d.folderId } : d)));
      setError(err instanceof Error ? err.message : 'Failed to move drawing');
    }
  }, []);

  const reorderDrawings = useCallback(async (orderedIds: string[]): Promise<void> => {
    // Optimistic: assign positions immediately so the UI re-sorts before DB writes settle.
    const positionMap = new Map(orderedIds.map((id, idx) => [id, idx]));
    setDrawings((prev) => prev.map((d) =>
      positionMap.has(d.id) ? { ...d, position: positionMap.get(d.id) } : d
    ));
    try {
      await reorderDrawingsStore(orderedIds);
      broadcastWorkspaceChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder drawings');
      // Refresh from DB on failure to get back to a consistent state
      refreshDrawingsRef.current();
    }
  }, []);

  const value: WorkspaceContextValue = {
    workspace,
    drawings,
    folders,
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
    createFolder,
    renameFolder,
    deleteFolder,
    moveDrawingToFolder,
    reorderDrawings,
    saveCurrentDrawing,
    saveDrawingById,
    refreshDrawings,
    exportWorkspace,
    importWorkspace,
    exportDrawingAsExcalidraw,
    exportAllDrawingsAsExcalidraw,
    importExcalidrawFile,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
