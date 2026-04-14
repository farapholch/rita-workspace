// src/storage/db.ts
import { openDB } from "idb";
var DB_NAME = "rita-workspace";
var DB_VERSION = 1;
var dbInstance = null;
async function getDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("workspaces")) {
        const workspaceStore = db.createObjectStore("workspaces", { keyPath: "id" });
        workspaceStore.createIndex("by-updated", "updatedAt");
      }
      if (!db.objectStoreNames.contains("drawings")) {
        const drawingStore = db.createObjectStore("drawings", { keyPath: "id" });
        drawingStore.createIndex("by-updated", "updatedAt");
      }
    }
  });
  return dbInstance;
}
async function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// src/storage/drawingStore.ts
import { nanoid } from "nanoid";
async function createDrawing(name = "Untitled", elements = [], appState = {}) {
  const db = await getDB();
  const now = Date.now();
  const drawing = {
    id: nanoid(),
    name,
    elements,
    appState,
    files: {},
    createdAt: now,
    updatedAt: now
  };
  await db.put("drawings", drawing);
  return drawing;
}
async function getDrawing(id) {
  const db = await getDB();
  return db.get("drawings", id);
}
async function getAllDrawings() {
  const db = await getDB();
  return db.getAllFromIndex("drawings", "by-updated");
}
async function updateDrawing(id, updates) {
  const db = await getDB();
  const existing = await db.get("drawings", id);
  if (!existing) return void 0;
  const updated = {
    ...existing,
    ...updates,
    updatedAt: Date.now()
  };
  await db.put("drawings", updated);
  return updated;
}
async function deleteDrawing(id) {
  const db = await getDB();
  const existing = await db.get("drawings", id);
  if (!existing) return false;
  await db.delete("drawings", id);
  return true;
}
async function duplicateDrawing(id, newName) {
  const existing = await getDrawing(id);
  if (!existing) return void 0;
  return createDrawing(
    newName || `${existing.name} (copy)`,
    existing.elements,
    existing.appState
  );
}

// src/storage/workspaceStore.ts
var DEFAULT_WORKSPACE_ID = "default";
async function getOrCreateDefaultWorkspace() {
  const db = await getDB();
  let workspace = await db.get("workspaces", DEFAULT_WORKSPACE_ID);
  if (!workspace) {
    const firstDrawing = await createDrawing("Ritning 1");
    const now = Date.now();
    workspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: "My Workspace",
      drawingIds: [firstDrawing.id],
      activeDrawingId: firstDrawing.id,
      createdAt: now,
      updatedAt: now
    };
    await db.put("workspaces", workspace);
  }
  return workspace;
}
async function getWorkspace(id) {
  const db = await getDB();
  return db.get("workspaces", id);
}
async function updateWorkspace(id, updates) {
  const db = await getDB();
  const existing = await db.get("workspaces", id);
  if (!existing) return void 0;
  const updated = {
    ...existing,
    ...updates,
    updatedAt: Date.now()
  };
  await db.put("workspaces", updated);
  return updated;
}
async function addDrawingToWorkspace(workspaceId, drawingId) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return void 0;
  if (!workspace.drawingIds.includes(drawingId)) {
    workspace.drawingIds.push(drawingId);
    return updateWorkspace(workspaceId, {
      drawingIds: workspace.drawingIds
    });
  }
  return workspace;
}
async function removeDrawingFromWorkspace(workspaceId, drawingId) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return void 0;
  const newDrawingIds = workspace.drawingIds.filter((id) => id !== drawingId);
  if (newDrawingIds.length === 0) {
    return workspace;
  }
  const newActiveId = workspace.activeDrawingId === drawingId ? newDrawingIds[0] : workspace.activeDrawingId;
  return updateWorkspace(workspaceId, {
    drawingIds: newDrawingIds,
    activeDrawingId: newActiveId
  });
}
async function setActiveDrawing(workspaceId, drawingId) {
  return updateWorkspace(workspaceId, { activeDrawingId: drawingId });
}

// src/state/WorkspaceContext.tsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { jsx } from "react/jsx-runtime";
var WorkspaceContext = createContext(null);
function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
function WorkspaceProvider({ children }) {
  const [workspace, setWorkspace] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [activeDrawing, setActiveDrawing2] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
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
          setActiveDrawing2(active || null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workspace");
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);
  const createNewDrawing = useCallback(async (name) => {
    if (!workspace) return null;
    try {
      const drawing = await createDrawing(name || `Ritning ${drawings.length + 1}`);
      await addDrawingToWorkspace(workspace.id, drawing.id);
      await setActiveDrawing(workspace.id, drawing.id);
      setDrawings((prev) => [...prev, drawing]);
      setActiveDrawing2(drawing);
      setWorkspace((prev) => prev ? {
        ...prev,
        drawingIds: [...prev.drawingIds, drawing.id],
        activeDrawingId: drawing.id
      } : null);
      return drawing;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create drawing");
      return null;
    }
  }, [workspace, drawings.length]);
  const switchDrawing = useCallback(async (id) => {
    if (!workspace) return;
    try {
      const drawing = await getDrawing(id);
      if (drawing) {
        await setActiveDrawing(workspace.id, id);
        setActiveDrawing2(drawing);
        setWorkspace((prev) => prev ? { ...prev, activeDrawingId: id } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch drawing");
    }
  }, [workspace]);
  const renameDrawing = useCallback(async (id, name) => {
    try {
      const updated = await updateDrawing(id, { name });
      if (updated) {
        setDrawings((prev) => prev.map((d) => d.id === id ? updated : d));
        if (activeDrawing?.id === id) {
          setActiveDrawing2(updated);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename drawing");
    }
  }, [activeDrawing]);
  const removeDrawing = useCallback(async (id) => {
    if (!workspace || drawings.length <= 1) return;
    try {
      await deleteDrawing(id);
      const updatedWorkspace = await removeDrawingFromWorkspace(workspace.id, id);
      setDrawings((prev) => prev.filter((d) => d.id !== id));
      if (updatedWorkspace) {
        setWorkspace(updatedWorkspace);
        if (activeDrawing?.id === id && updatedWorkspace.activeDrawingId) {
          const newActive = await getDrawing(updatedWorkspace.activeDrawingId);
          setActiveDrawing2(newActive || null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete drawing");
    }
  }, [workspace, drawings.length, activeDrawing]);
  const duplicateCurrentDrawing = useCallback(async () => {
    if (!activeDrawing || !workspace) return null;
    try {
      const duplicate = await duplicateDrawing(activeDrawing.id);
      if (duplicate) {
        await addDrawingToWorkspace(workspace.id, duplicate.id);
        setDrawings((prev) => [...prev, duplicate]);
        setWorkspace((prev) => prev ? {
          ...prev,
          drawingIds: [...prev.drawingIds, duplicate.id]
        } : null);
        return duplicate;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate drawing");
      return null;
    }
  }, [activeDrawing, workspace]);
  const saveCurrentDrawing = useCallback(async (elements, appState) => {
    if (!activeDrawing) return;
    try {
      const updated = await updateDrawing(activeDrawing.id, { elements, appState });
      if (updated) {
        setActiveDrawing2(updated);
        setDrawings((prev) => prev.map((d) => d.id === updated.id ? updated : d));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save drawing");
    }
  }, [activeDrawing]);
  const value = {
    workspace,
    drawings,
    activeDrawing,
    isLoading,
    error,
    createNewDrawing,
    switchDrawing,
    renameDrawing,
    removeDrawing,
    duplicateCurrentDrawing,
    saveCurrentDrawing
  };
  return /* @__PURE__ */ jsx(WorkspaceContext.Provider, { value, children });
}

// src/ui/Sidebar/Sidebar.tsx
import { useState as useState3 } from "react";

// src/ui/DrawingList/DrawingListItem.tsx
import { useState as useState2, useRef, useEffect as useEffect2 } from "react";

// src/ui/DrawingList/DrawingList.module.css
var DrawingList_default = {};

// src/ui/DrawingList/DrawingListItem.tsx
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
function DrawingListItem({
  drawing,
  isActive,
  onSelect,
  onRename,
  onDelete,
  canDelete
}) {
  const [isEditing, setIsEditing] = useState2(false);
  const [editName, setEditName] = useState2(drawing.name);
  const inputRef = useRef(null);
  useEffect2(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  const handleSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== drawing.name) {
      onRename(trimmed);
    } else {
      setEditName(drawing.name);
    }
    setIsEditing(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      setEditName(drawing.name);
      setIsEditing(false);
    }
  };
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (window.confirm(`Ta bort "${drawing.name}"?`)) {
      onDelete();
    }
  };
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("sv-SE", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  return /* @__PURE__ */ jsxs(
    "li",
    {
      className: `${DrawingList_default.item} ${isActive ? DrawingList_default.active : ""}`,
      onClick: onSelect,
      children: [
        /* @__PURE__ */ jsx2("div", { className: DrawingList_default.itemContent, children: isEditing ? /* @__PURE__ */ jsx2(
          "input",
          {
            ref: inputRef,
            type: "text",
            value: editName,
            onChange: (e) => setEditName(e.target.value),
            onBlur: handleSubmit,
            onKeyDown: handleKeyDown,
            className: DrawingList_default.editInput,
            onClick: (e) => e.stopPropagation()
          }
        ) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx2(
            "span",
            {
              className: DrawingList_default.name,
              onDoubleClick: handleDoubleClick,
              title: "Dubbelklicka f\xF6r att byta namn",
              children: drawing.name
            }
          ),
          /* @__PURE__ */ jsx2("span", { className: DrawingList_default.date, children: formatDate(drawing.updatedAt) })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: DrawingList_default.actions, children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: DrawingList_default.actionButton,
              onClick: handleDoubleClick,
              title: "Byt namn (F2)",
              children: "\u270F\uFE0F"
            }
          ),
          canDelete && /* @__PURE__ */ jsx2(
            "button",
            {
              className: DrawingList_default.actionButton,
              onClick: handleDeleteClick,
              title: "Ta bort",
              children: "\u{1F5D1}\uFE0F"
            }
          )
        ] })
      ]
    }
  );
}

// src/ui/DrawingList/DrawingList.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function DrawingList() {
  const { drawings, activeDrawing, switchDrawing, renameDrawing, removeDrawing } = useWorkspace();
  if (drawings.length === 0) {
    return /* @__PURE__ */ jsx3("div", { className: DrawingList_default.empty, children: "Inga ritningar" });
  }
  return /* @__PURE__ */ jsx3("ul", { className: DrawingList_default.list, children: drawings.map((drawing) => /* @__PURE__ */ jsx3(
    DrawingListItem,
    {
      drawing,
      isActive: drawing.id === activeDrawing?.id,
      onSelect: () => switchDrawing(drawing.id),
      onRename: (name) => renameDrawing(drawing.id, name),
      onDelete: () => removeDrawing(drawing.id),
      canDelete: drawings.length > 1
    },
    drawing.id
  )) });
}

// src/ui/Sidebar/Sidebar.module.css
var Sidebar_default = {};

// src/ui/Sidebar/Sidebar.tsx
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
function Sidebar({ isOpen = true, onToggle, width = 250 }) {
  const { createNewDrawing, isLoading } = useWorkspace();
  const [isCreating, setIsCreating] = useState3(false);
  const handleCreateNew = async () => {
    setIsCreating(true);
    await createNewDrawing();
    setIsCreating(false);
  };
  if (!isOpen) {
    return /* @__PURE__ */ jsx4(
      "button",
      {
        className: Sidebar_default.toggleButton,
        onClick: onToggle,
        title: "Open sidebar (Ctrl+B)",
        "aria-label": "Open sidebar",
        children: "\u2630"
      }
    );
  }
  return /* @__PURE__ */ jsxs2("aside", { className: Sidebar_default.sidebar, style: { width }, children: [
    /* @__PURE__ */ jsxs2("header", { className: Sidebar_default.header, children: [
      /* @__PURE__ */ jsx4("h2", { className: Sidebar_default.title, children: "Ritningar" }),
      /* @__PURE__ */ jsx4(
        "button",
        {
          className: Sidebar_default.closeButton,
          onClick: onToggle,
          title: "Close sidebar (Ctrl+B)",
          "aria-label": "Close sidebar",
          children: "\u2715"
        }
      )
    ] }),
    /* @__PURE__ */ jsx4("div", { className: Sidebar_default.content, children: isLoading ? /* @__PURE__ */ jsx4("div", { className: Sidebar_default.loading, children: "Laddar..." }) : /* @__PURE__ */ jsx4(DrawingList, {}) }),
    /* @__PURE__ */ jsx4("footer", { className: Sidebar_default.footer, children: /* @__PURE__ */ jsx4(
      "button",
      {
        className: Sidebar_default.newButton,
        onClick: handleCreateNew,
        disabled: isCreating,
        children: isCreating ? "Skapar..." : "+ Ny ritning"
      }
    ) })
  ] });
}

// src/integration/useExcalidrawBridge.ts
import { useEffect as useEffect3, useRef as useRef2, useCallback as useCallback2 } from "react";
function useExcalidrawBridge({
  excalidrawAPI,
  autoSaveInterval = 2e3
}) {
  const { activeDrawing, saveCurrentDrawing } = useWorkspace();
  const saveTimeoutRef = useRef2(null);
  const lastDrawingIdRef = useRef2(null);
  useEffect3(() => {
    if (!excalidrawAPI || !activeDrawing) return;
    if (lastDrawingIdRef.current === activeDrawing.id) return;
    lastDrawingIdRef.current = activeDrawing.id;
    excalidrawAPI.updateScene({
      elements: activeDrawing.elements,
      appState: activeDrawing.appState
    });
  }, [excalidrawAPI, activeDrawing]);
  const scheduleSave = useCallback2(() => {
    if (!excalidrawAPI) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      await saveCurrentDrawing(elements, appState);
    }, autoSaveInterval);
  }, [excalidrawAPI, saveCurrentDrawing, autoSaveInterval]);
  useEffect3(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  return {
    scheduleSave
  };
}

// src/WorkspacePlugin.tsx
import { useState as useState4, useEffect as useEffect4, useCallback as useCallback3 } from "react";
import { jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
function WorkspacePluginInner({
  children,
  defaultSidebarOpen = true,
  sidebarWidth = 250
}) {
  const [sidebarOpen, setSidebarOpen] = useState4(defaultSidebarOpen);
  const { activeDrawing } = useWorkspace();
  useEffect4(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const handleToggleSidebar = useCallback3(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      style: {
        display: "flex",
        height: "100%",
        width: "100%"
      },
      children: [
        /* @__PURE__ */ jsx5(
          Sidebar,
          {
            isOpen: sidebarOpen,
            onToggle: handleToggleSidebar,
            width: sidebarWidth
          }
        ),
        /* @__PURE__ */ jsx5(
          "main",
          {
            style: {
              flex: 1,
              height: "100%",
              overflow: "hidden"
            },
            children
          }
        )
      ]
    }
  );
}
function WorkspacePlugin(props) {
  return /* @__PURE__ */ jsx5(WorkspaceProvider, { children: /* @__PURE__ */ jsx5(WorkspacePluginInner, { ...props }) });
}
export {
  DrawingList,
  DrawingListItem,
  Sidebar,
  WorkspacePlugin,
  WorkspaceProvider,
  addDrawingToWorkspace,
  closeDB,
  createDrawing,
  deleteDrawing,
  duplicateDrawing,
  getAllDrawings,
  getDB,
  getDrawing,
  getOrCreateDefaultWorkspace,
  getWorkspace,
  removeDrawingFromWorkspace,
  setActiveDrawing,
  updateDrawing,
  updateWorkspace,
  useExcalidrawBridge,
  useWorkspace
};
