"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  DrawingList: () => DrawingList,
  DrawingListItem: () => DrawingListItem,
  Sidebar: () => Sidebar,
  WorkspacePlugin: () => WorkspacePlugin,
  WorkspaceProvider: () => WorkspaceProvider,
  addDrawingToWorkspace: () => addDrawingToWorkspace,
  closeDB: () => closeDB,
  createDrawing: () => createDrawing,
  deleteDrawing: () => deleteDrawing,
  duplicateDrawing: () => duplicateDrawing,
  getAllDrawings: () => getAllDrawings,
  getDB: () => getDB,
  getDrawing: () => getDrawing,
  getOrCreateDefaultWorkspace: () => getOrCreateDefaultWorkspace,
  getWorkspace: () => getWorkspace,
  removeDrawingFromWorkspace: () => removeDrawingFromWorkspace,
  setActiveDrawing: () => setActiveDrawing,
  updateDrawing: () => updateDrawing,
  updateWorkspace: () => updateWorkspace,
  useExcalidrawBridge: () => useExcalidrawBridge,
  useWorkspace: () => useWorkspace
});
module.exports = __toCommonJS(index_exports);

// src/storage/db.ts
var import_idb = require("idb");
var DB_NAME = "rita-workspace";
var DB_VERSION = 1;
var dbInstance = null;
async function getDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await (0, import_idb.openDB)(DB_NAME, DB_VERSION, {
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
var import_nanoid = require("nanoid");
async function createDrawing(name = "Untitled", elements = [], appState = {}) {
  const db = await getDB();
  const now = Date.now();
  const drawing = {
    id: (0, import_nanoid.nanoid)(),
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
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var WorkspaceContext = (0, import_react.createContext)(null);
function useWorkspace() {
  const context = (0, import_react.useContext)(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
function WorkspaceProvider({ children }) {
  const [workspace, setWorkspace] = (0, import_react.useState)(null);
  const [drawings, setDrawings] = (0, import_react.useState)([]);
  const [activeDrawing, setActiveDrawing2] = (0, import_react.useState)(null);
  const [isLoading, setIsLoading] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
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
  const createNewDrawing = (0, import_react.useCallback)(async (name) => {
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
  const switchDrawing = (0, import_react.useCallback)(async (id) => {
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
  const renameDrawing = (0, import_react.useCallback)(async (id, name) => {
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
  const removeDrawing = (0, import_react.useCallback)(async (id) => {
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
  const duplicateCurrentDrawing = (0, import_react.useCallback)(async () => {
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
  const saveCurrentDrawing = (0, import_react.useCallback)(async (elements, appState) => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkspaceContext.Provider, { value, children });
}

// src/ui/Sidebar/Sidebar.tsx
var import_react3 = require("react");

// src/ui/DrawingList/DrawingListItem.tsx
var import_react2 = require("react");

// src/ui/DrawingList/DrawingList.module.css
var DrawingList_default = {};

// src/ui/DrawingList/DrawingListItem.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function DrawingListItem({
  drawing,
  isActive,
  onSelect,
  onRename,
  onDelete,
  canDelete
}) {
  const [isEditing, setIsEditing] = (0, import_react2.useState)(false);
  const [editName, setEditName] = (0, import_react2.useState)(drawing.name);
  const inputRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "li",
    {
      className: `${DrawingList_default.item} ${isActive ? DrawingList_default.active : ""}`,
      onClick: onSelect,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: DrawingList_default.itemContent, children: isEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
        ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "span",
            {
              className: DrawingList_default.name,
              onDoubleClick: handleDoubleClick,
              title: "Dubbelklicka f\xF6r att byta namn",
              children: drawing.name
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: DrawingList_default.date, children: formatDate(drawing.updatedAt) })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: DrawingList_default.actions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              className: DrawingList_default.actionButton,
              onClick: handleDoubleClick,
              title: "Byt namn (F2)",
              children: "\u270F\uFE0F"
            }
          ),
          canDelete && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
var import_jsx_runtime3 = require("react/jsx-runtime");
function DrawingList() {
  const { drawings, activeDrawing, switchDrawing, renameDrawing, removeDrawing } = useWorkspace();
  if (drawings.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: DrawingList_default.empty, children: "Inga ritningar" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: DrawingList_default.list, children: drawings.map((drawing) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
var import_jsx_runtime4 = require("react/jsx-runtime");
function Sidebar({ isOpen = true, onToggle, width = 250 }) {
  const { createNewDrawing, isLoading } = useWorkspace();
  const [isCreating, setIsCreating] = (0, import_react3.useState)(false);
  const handleCreateNew = async () => {
    setIsCreating(true);
    await createNewDrawing();
    setIsCreating(false);
  };
  if (!isOpen) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("aside", { className: Sidebar_default.sidebar, style: { width }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("header", { className: Sidebar_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { className: Sidebar_default.title, children: "Ritningar" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: Sidebar_default.content, children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: Sidebar_default.loading, children: "Laddar..." }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DrawingList, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("footer", { className: Sidebar_default.footer, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
var import_react4 = require("react");
function useExcalidrawBridge({
  excalidrawAPI,
  autoSaveInterval = 2e3
}) {
  const { activeDrawing, saveCurrentDrawing } = useWorkspace();
  const saveTimeoutRef = (0, import_react4.useRef)(null);
  const lastDrawingIdRef = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    if (!excalidrawAPI || !activeDrawing) return;
    if (lastDrawingIdRef.current === activeDrawing.id) return;
    lastDrawingIdRef.current = activeDrawing.id;
    excalidrawAPI.updateScene({
      elements: activeDrawing.elements,
      appState: activeDrawing.appState
    });
  }, [excalidrawAPI, activeDrawing]);
  const scheduleSave = (0, import_react4.useCallback)(() => {
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
  (0, import_react4.useEffect)(() => {
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
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function WorkspacePluginInner({
  children,
  defaultSidebarOpen = true,
  sidebarWidth = 250
}) {
  const [sidebarOpen, setSidebarOpen] = (0, import_react5.useState)(defaultSidebarOpen);
  const { activeDrawing } = useWorkspace();
  (0, import_react5.useEffect)(() => {
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
  const handleToggleSidebar = (0, import_react5.useCallback)(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      style: {
        display: "flex",
        height: "100%",
        width: "100%"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Sidebar,
          {
            isOpen: sidebarOpen,
            onToggle: handleToggleSidebar,
            width: sidebarWidth
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(WorkspaceProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(WorkspacePluginInner, { ...props }) });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
});
