/**
 * Drawings Dialog
 *
 * A draggable modal dialog for managing all drawings in the workspace.
 * Design by Johan.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useWorkspace } from '../../state/WorkspaceContext';
import { getTranslations } from '../../i18n';
import type { Drawing, Folder } from '../../storage/db';
import './Dialog.css';

export interface DrawingsDialogProps {
  open: boolean;
  onClose: () => void;
  onDrawingSelect?: (drawing: Drawing) => void;
  lang?: string;
  renderThumbnail?: (drawing: Drawing) => React.ReactNode;
}

const ActionButton: React.FC<{
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}> = ({ icon, label, description, onClick, primary }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
      padding: '12px 16px',
      backgroundColor: primary ? 'var(--color-primary-light, rgba(108, 99, 255, 0.08))' : 'transparent',
      border: '1px solid var(--default-border-color, #e0e0e0)',
      borderRadius: '8px',
      cursor: 'pointer',
      textAlign: 'left',
      color: 'inherit',
      fontSize: '14px',
      outline: 'none',
    }}
  >
    <span style={{ fontSize: '20px', flexShrink: 0 }}>{icon}</span>
    <div>
      <div style={{ fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary-color, #888)', marginTop: '2px' }}>
        {description}
      </div>
    </div>
  </button>
);

export const DrawingsDialog: React.FC<DrawingsDialogProps> = ({
  open,
  onClose,
  onDrawingSelect,
  lang,
  renderThumbnail,
}) => {
  const {
    drawings,
    folders,
    activeDrawing,
    switchDrawing,
    createNewDrawing,
    renameDrawing,
    removeDrawing,
    createFolder,
    renameFolder,
    deleteFolder,
    moveDrawingToFolder,
    reorderDrawings,
    exportWorkspace,
    importWorkspace,
    exportDrawingAsExcalidraw,
    exportAllDrawingsAsExcalidraw,
    importExcalidrawFile,
    refreshDrawings,
    t: contextT,
    lang: contextLang,
  } = useWorkspace();

  const t = lang ? getTranslations(lang) : contextT;
  const effectiveLang = lang || contextLang;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Folder UI state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [movingDrawingId, setMovingDrawingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // busyFolderId removed — all folder operations are now optimistic
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-start preference (persisted in localStorage; read by Excalidraw-1 on app boot
  // to enable workspace mode without an explicit toggle in the menu).
  const [autoStart, setAutoStart] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rita-workspace-auto-start') === 'true';
    } catch {
      return false;
    }
  });
  const handleToggleAutoStart = useCallback(() => {
    setAutoStart((prev) => {
      const next = !prev;
      try {
        if (next) {
          localStorage.setItem('rita-workspace-auto-start', 'true');
        } else {
          localStorage.removeItem('rita-workspace-auto-start');
        }
      } catch { /* ignore quota / private mode */ }
      return next;
    });
  }, []);

  // Drag-and-drop state (for moving drawings to folders)
  const [draggingDrawingId, setDraggingDrawingId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null); // null = root, '__none__' = no target
  // Reorder drop indicator: drawing-id of the row we're hovering, plus 'before' or 'after' to show line position
  const [dropTargetDrawingId, setDropTargetDrawingId] = useState<string | null>(null);
  const [dropTargetPosition, setDropTargetPosition] = useState<'before' | 'after' | null>(null);

  // Dialog dragging state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const prevOpenRef = useRef(false);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  useEffect(() => {
    if (open) {
      const isFirstOpen = !prevOpenRef.current;
      if (isFirstOpen) {
        setPosition(null);
        setSearchQuery('');
        setSelectedId(null);
      }
      setIsRefreshing(true);
      refreshDrawings().then(() => {
        // Expand folders AFTER refresh so we have the latest folder list
        if (isFirstOpen) {
          setExpandedFolders(new Set(foldersRef.current.map((f) => f.id)));
        }
      }).finally(() => setIsRefreshing(false));
    }
    prevOpenRef.current = open;
  }, [open, refreshDrawings]);

  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [creatingFolder]);

  // Close on Escape — but skip if user is typing in an input/textarea
  // (those have their own Escape handlers for cancel-edit).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement)?.isContentEditable) {
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('input')) return;
    if (!dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    const currentX = position?.x ?? rect.left;
    const currentY = position?.y ?? rect.top;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position]);

  const handleSelect = useCallback(async (drawing: Drawing) => {
    setSwitchingId(drawing.id);
    setSelectedId(null);
    await switchDrawing(drawing.id);
    onDrawingSelect?.(drawing);
    setSwitchingId(null);
  }, [switchDrawing, onDrawingSelect]);

  const handleCreate = useCallback(async (folderId?: string | null) => {
    const created = await createNewDrawing(undefined, folderId);
    if (created) {
      onDrawingSelect?.(created);
    }
  }, [createNewDrawing, onDrawingSelect]);

  const handleStartEdit = useCallback((drawing: Drawing) => {
    setEditingId(drawing.id);
    setEditName(drawing.name);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingId && editName.trim()) {
      renameDrawing(editingId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  }, [editingId, editName, renameDrawing]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  const handleDelete = useCallback((id: string) => {
    removeDrawing(id);
    setConfirmDeleteId(null);
  }, [removeDrawing]);

  const handleCreateFolder = useCallback(() => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim()).then((folder) => {
        if (folder) {
          setExpandedFolders((prev) => new Set([...prev, folder.id]));
        }
      });
    }
    setCreatingFolder(false);
    setNewFolderName('');
  }, [newFolderName, createFolder]);

  const handleSaveFolderEdit = useCallback(() => {
    if (editingFolderId && editFolderName.trim()) {
      renameFolder(editingFolderId, editFolderName.trim());
    }
    setEditingFolderId(null);
    setEditFolderName('');
  }, [editingFolderId, editFolderName, renameFolder]);

  const handleDeleteFolder = useCallback((id: string) => {
    deleteFolder(id);
    setConfirmDeleteFolderId(null);
  }, [deleteFolder]);

  const handleMoveToFolder = useCallback((drawingId: string, folderId: string | null) => {
    setMovingDrawingId(null);
    setSelectedId(null);
    moveDrawingToFolder(drawingId, folderId);
  }, [moveDrawingToFolder]);

  // Reorder: dropping `draggedId` before/after `targetId` within the targetId's scope
  // (root drawings if targetId has no folder, otherwise drawings in that folder).
  const handleReorderDrop = useCallback((
    draggedId: string,
    targetId: string,
    pos: 'before' | 'after',
  ) => {
    if (draggedId === targetId) return;
    const target = drawings.find((d) => d.id === targetId);
    if (!target) return;
    // Build the ordered slice the user is reordering within.
    const scopeFolderId = target.folderId ?? null;
    const scope = drawings
      .filter((d) => (d.folderId ?? null) === scopeFolderId)
      .sort((a, b) => (a.position ?? a.createdAt) - (b.position ?? b.createdAt));
    const withoutDragged = scope.filter((d) => d.id !== draggedId);
    const targetIdx = withoutDragged.findIndex((d) => d.id === targetId);
    if (targetIdx === -1) return;
    const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
    const dragged = drawings.find((d) => d.id === draggedId);
    if (!dragged) return;
    // If the dragged drawing was in a different folder, also move it into the new folder
    // — drag-reorder across folders implies "move into this folder + place here".
    if ((dragged.folderId ?? null) !== scopeFolderId) {
      moveDrawingToFolder(draggedId, scopeFolderId);
    }
    const ordered = [
      ...withoutDragged.slice(0, insertIdx),
      dragged,
      ...withoutDragged.slice(insertIdx),
    ].map((d) => d.id);
    reorderDrawings(ordered);
  }, [drawings, reorderDrawings, moveDrawingToFolder]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const getLocale = () => {
    if (!effectiveLang) return 'en-US';
    const baseLang = effectiveLang.split('-')[0].toLowerCase();
    return baseLang === 'sv' ? 'sv-SE' : 'en-US';
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(getLocale(), {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  // Check days since last backup + raw timestamp
  const { daysSinceBackup, lastBackupTimestamp } = useMemo(() => {
    const lastBackup = localStorage.getItem('rita-workspace-last-backup');
    if (!lastBackup) {
      return {
        daysSinceBackup: drawings.length > 0 ? 999 : null,
        lastBackupTimestamp: null as number | null,
      };
    }
    const ts = parseInt(lastBackup, 10);
    return {
      daysSinceBackup: Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)),
      lastBackupTimestamp: ts,
    };
  }, [drawings.length, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter and group drawings by folder (memoized — must be before early return)
  const { rootDrawings, drawingsByFolder, filteredFolders } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? drawings.filter((d) => d.name.toLowerCase().includes(query))
      : drawings;
    // Sort by manual `position` (set via drag-reorder), falling back to createdAt for unset.
    const sorted = [...filtered].sort((a, b) =>
      (a.position ?? a.createdAt) - (b.position ?? b.createdAt)
    );
    const root = sorted.filter((d) => !d.folderId);
    const byFolder: Record<string, Drawing[]> = {};
    for (const folder of folders) {
      byFolder[folder.id] = sorted.filter((d) => d.folderId === folder.id);
    }
    const foldersFiltered = query
      ? folders.filter((f) => f.name.toLowerCase().includes(query) || (byFolder[f.id] || []).length > 0)
      : folders;
    return { rootDrawings: root, drawingsByFolder: byFolder, filteredFolders: foldersFiltered };
  }, [drawings, folders, searchQuery]);

  if (!open) return null;

  const dialogStyle: React.CSSProperties = position
    ? {
        position: 'fixed', left: position.x, top: position.y,
        backgroundColor: 'var(--island-bg-color, #fff)', borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)', width: '90%', maxWidth: '520px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        color: 'var(--text-primary-color, #1b1b1f)', zIndex: 10000,
      }
    : {
        backgroundColor: 'var(--island-bg-color, #fff)', borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)', width: '90%', maxWidth: '520px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        color: 'var(--text-primary-color, #1b1b1f)',
      };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary-color, #888)',
    padding: '16px 20px 8px',
  };

  // Render a single drawing row
  const renderDrawingRow = (drawing: Drawing) => (
    <div
      key={drawing.id}
      draggable={!editingId && !confirmDeleteId}
      onDragStart={(e) => {
        setDraggingDrawingId(drawing.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', drawing.id);
      }}
      onDragEnd={() => {
        setDraggingDrawingId(null);
        setDropTargetFolderId(null);
        setDropTargetDrawingId(null);
        setDropTargetPosition(null);
      }}
      onDragOver={(e) => {
        // Only show reorder indicator when another drawing is being dragged.
        if (!draggingDrawingId || draggingDrawingId === drawing.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const isBefore = e.clientY < rect.top + rect.height / 2;
        setDropTargetDrawingId(drawing.id);
        setDropTargetPosition(isBefore ? 'before' : 'after');
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the row entirely (not entering a child element)
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (dropTargetDrawingId === drawing.id) {
          setDropTargetDrawingId(null);
          setDropTargetPosition(null);
        }
      }}
      onDrop={(e) => {
        if (!draggingDrawingId || !dropTargetPosition || draggingDrawingId === drawing.id) return;
        e.preventDefault();
        e.stopPropagation();
        handleReorderDrop(draggingDrawingId, drawing.id, dropTargetPosition);
        setDraggingDrawingId(null);
        setDropTargetDrawingId(null);
        setDropTargetPosition(null);
        setDropTargetFolderId(null);
      }}
      onMouseEnter={() => setHoveredId(drawing.id)}
      onMouseLeave={() => setHoveredId(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (editingId || confirmDeleteId || movingDrawingId) return;
        setSelectedId(drawing.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (editingId || confirmDeleteId || movingDrawingId) return;
        if (activeDrawing?.id === drawing.id) return; // already active
        handleSelect(drawing);
      }}
      style={{
        position: 'relative',
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px',
        borderRadius: '8px', marginBottom: '4px',
        userSelect: 'none',
        cursor: draggingDrawingId ? 'grabbing' : 'grab',
        backgroundColor: activeDrawing?.id === drawing.id
          ? 'var(--color-primary-light, rgba(108, 99, 255, 0.1))'
          : selectedId === drawing.id
          ? 'var(--color-primary-light, rgba(108, 99, 255, 0.06))'
          : 'transparent',
        border: selectedId === drawing.id && activeDrawing?.id !== drawing.id
          ? '1px solid var(--color-primary, #6c63ff)' : '1px solid transparent',
        transition: 'background-color 0.15s, border-color 0.15s',
        opacity: draggingDrawingId === drawing.id ? 0.4 : switchingId && switchingId !== drawing.id ? 0.5 : 1,
      }}
    >
      {/* Reorder drop indicator — thin line above or below the row */}
      {dropTargetDrawingId === drawing.id && dropTargetPosition && (
        <div style={{
          position: 'absolute',
          left: 4, right: 4,
          [dropTargetPosition === 'before' ? 'top' : 'bottom']: -2,
          height: '3px',
          backgroundColor: 'var(--color-primary, #6c63ff)',
          borderRadius: '2px',
          pointerEvents: 'none',
        }} />
      )}
      {renderThumbnail && (
        <div
          className="rita-thumbnail-wrapper"
          style={{
            width: '64px', height: '48px', flexShrink: 0, borderRadius: '4px',
            overflow: 'hidden', border: '1px solid var(--default-border-color, #e0e0e0)',
            backgroundColor: 'var(--island-bg-color, #fff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {renderThumbnail(drawing)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingId === drawing.id ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text" value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              style={{
                flex: 1, padding: '4px 8px', fontSize: '14px',
                border: '1px solid var(--color-primary, #6c63ff)', borderRadius: '4px', outline: 'none',
              }}
            />
            <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
              style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: 'var(--color-primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {t.save}
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
              style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid var(--default-border-color, #ccc)', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>
              {t.cancel}
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                onClick={(e) => { e.stopPropagation(); handleStartEdit(drawing); }}
                style={{
                  fontWeight: activeDrawing?.id === drawing.id ? 600 : 400,
                  fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', cursor: 'pointer',
                }}
                title={t.rename}
              >
                {switchingId === drawing.id
                  ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: '4px' }}>⏳</span>
                  : activeDrawing?.id === drawing.id ? '✓ ' : ''
                }
                {drawing.name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleStartEdit(drawing); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '12px', opacity: 0.4, flexShrink: 0 }}
                title={t.rename}
              >✏️</button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary-color, #888)', marginTop: '1px' }}>
              {t.modified}: {formatDate(drawing.updatedAt)}
            </div>
          </>
        )}
      </div>
      {/* Row actions — visible on hover, selection, or active */}
      <div style={{
        display: 'flex', gap: '2px', alignItems: 'center',
        visibility: (hoveredId === drawing.id || selectedId === drawing.id || activeDrawing?.id === drawing.id || confirmDeleteId === drawing.id || movingDrawingId === drawing.id || editingId === drawing.id) ? 'visible' : 'hidden',
      }}>
        {movingDrawingId === drawing.id ? (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px' }}>
            <button onClick={() => handleMoveToFolder(drawing.id, null)}
              style={{ padding: '3px 8px', border: '1px solid var(--default-border-color, #ccc)', borderRadius: '4px', cursor: 'pointer', backgroundColor: !drawing.folderId ? 'var(--color-primary-light, rgba(108, 99, 255, 0.1))' : 'transparent', color: 'inherit', textAlign: 'left' }}>
              {t.moveToRoot}
            </button>
            {folders.map((folder) => (
              <button key={folder.id} onClick={() => handleMoveToFolder(drawing.id, folder.id)}
                style={{ padding: '3px 8px', border: '1px solid var(--default-border-color, #ccc)', borderRadius: '4px', cursor: 'pointer', backgroundColor: drawing.folderId === folder.id ? 'var(--color-primary-light, rgba(108, 99, 255, 0.1))' : 'transparent', color: 'inherit', textAlign: 'left' }}>
                📁 {folder.name}
              </button>
            ))}
            <button onClick={() => setMovingDrawingId(null)}
              style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--text-secondary-color, #888)', textAlign: 'left' }}>
              {t.cancel}
            </button>
          </div>
        ) : editingId !== drawing.id && (
          <>
            {activeDrawing?.id !== drawing.id && (
              <button onClick={(e) => { e.stopPropagation(); handleSelect(drawing); }}
                disabled={!!switchingId}
                style={{ padding: '3px 8px', fontSize: '12px', backgroundColor: 'var(--color-primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: switchingId ? 0.6 : 1 }}
                title={t.open}>
                {switchingId === drawing.id ? '⏳' : t.open}
              </button>
            )}
            {folders.length > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setMovingDrawingId(drawing.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '14px', opacity: 0.5 }}
                title={t.moveToFolder}>📁</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); exportDrawingAsExcalidraw(drawing.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '14px', opacity: 0.5 }}
              title={t.exportDrawing}>💾</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(drawing.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '14px', opacity: 0.5 }}
              title={t.delete}>🗑️</button>
          </>
        )}
      </div>
    </div>
  );

  // Render a folder group
  const renderFolderGroup = (folder: Folder) => {
    const folderDrawings = drawingsByFolder[folder.id] || [];
    const isExpanded = expandedFolders.has(folder.id);

    return (
      <div
        key={folder.id}
        style={{ marginBottom: '4px' }}
        onDragOver={(e) => {
          if (!draggingDrawingId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropTargetFolderId(folder.id);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the folder group entirely (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (dropTargetFolderId === folder.id) setDropTargetFolderId(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingDrawingId) {
            handleMoveToFolder(draggingDrawingId, folder.id);
            setDraggingDrawingId(null);
            setDropTargetFolderId(null);
            setExpandedFolders((prev) => new Set([...prev, folder.id]));
          }
        }}
      >
        {/* Folder header */}
        <div
          onClick={() => { toggleFolder(folder.id); setSelectedId(null); }}
          style={{
            padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px',
            borderRadius: '8px', cursor: 'pointer',
            backgroundColor: dropTargetFolderId === folder.id
              ? 'var(--color-primary-light, rgba(108, 99, 255, 0.2))'
              : 'var(--color-surface-mid, rgba(0, 0, 0, 0.03))',
            border: dropTargetFolderId === folder.id ? '2px dashed var(--color-primary, #6c63ff)' : '2px solid transparent',
            transition: 'background-color 0.15s, border-color 0.15s',
          }}
        >
          <span style={{ fontSize: '12px', width: '16px', textAlign: 'center', flexShrink: 0 }}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>
            📁
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingFolderId === folder.id ? (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                <input
                  type="text" value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFolderEdit(); if (e.key === 'Escape') { setEditingFolderId(null); setEditFolderName(''); } }}
                  autoFocus
                  style={{ flex: 1, padding: '2px 6px', fontSize: '14px', border: '1px solid var(--color-primary, #6c63ff)', borderRadius: '4px', outline: 'none' }}
                />
                <button onClick={handleSaveFolderEdit}
                  style={{ padding: '2px 8px', fontSize: '12px', backgroundColor: 'var(--color-primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  {t.save}
                </button>
              </div>
            ) : (
              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                {folder.name}
                <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-secondary-color, #888)', marginLeft: '6px' }}>
                  ({folderDrawings.length})
                </span>
              </span>
            )}
          </div>
          {/* Folder actions */}
          {editingFolderId !== folder.id && (
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '2px' }}>
              <button onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '12px', opacity: 0.5 }}
                title={t.renameFolder}>✏️</button>
              <button onClick={() => setConfirmDeleteFolderId(folder.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '12px', opacity: 0.5 }}
                title={t.deleteFolder}>🗑️</button>
            </div>
          )}
        </div>

        {/* Folder contents */}
        {isExpanded && (
          <div style={{ paddingLeft: '24px', marginTop: '2px' }} onClick={() => setSelectedId(null)}>
            {folderDrawings.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary-color, #888)', fontStyle: 'italic' }}>
                {t.noDrawingsYet}
              </div>
            )}
            {folderDrawings.map(renderDrawingRow)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="rita-workspace-dialog-overlay"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: position ? 'block' : 'flex',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} className="rita-workspace-dialog" style={dialogStyle}>
        {/* Header - draggable */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            padding: '16px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', cursor: 'grab', userSelect: 'none',
            borderBottom: '1px solid var(--default-border-color, #e0e0e0)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t.dialogTitle}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: '#fff3cd',
                color: '#856404',
                border: '1px solid #ffc107',
                textTransform: 'uppercase',
              }}
              title="Beta — funktionen är under utveckling och kan ändras"
            >
              BETA
            </span>
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '24px',
              cursor: 'pointer', padding: '4px', lineHeight: 1, color: 'inherit',
            }}
            aria-label={t.close}
          >
            ×
          </button>
        </div>
        {/* Search */}
        {drawings.length > 3 && (
          <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--default-border-color, #e0e0e0)' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍"
              style={{
                width: '100%', padding: '6px 12px', fontSize: '14px',
                border: '1px solid var(--default-border-color, #e0e0e0)', borderRadius: '6px',
                outline: 'none', backgroundColor: 'transparent', color: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Scrollable content */}
        <div
          style={{ flex: 1, overflow: 'auto' }}
          onClick={() => setSelectedId(null)}
          onDragOver={(e) => {
            if (!draggingDrawingId) return;
            // Auto-scroll when dragging near edges
            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();
            const margin = 40;
            if (e.clientY - rect.top < margin) {
              el.scrollTop -= 8;
            } else if (rect.bottom - e.clientY < margin) {
              el.scrollTop += 8;
            }
          }}
        >

          {/* === Drawings & Folders list === */}
          {isRefreshing ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-secondary-color, #666)' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '24px' }}>⏳</span>
            </div>
          ) : (drawings.length > 0 || folders.length > 0) ? (
            <div style={{ padding: '8px 20px 0' }} onClick={() => setSelectedId(null)}>
              {/* Folder groups */}
              {filteredFolders.map(renderFolderGroup)}

              {/* Drop zone for root level (when dragging from a folder) */}
              {draggingDrawingId && folders.length > 0 && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetFolderId('__root__');
                  }}
                  onDragLeave={() => {
                    if (dropTargetFolderId === '__root__') setDropTargetFolderId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingDrawingId) {
                      handleMoveToFolder(draggingDrawingId, null);
                      setDraggingDrawingId(null);
                      setDropTargetFolderId(null);
                    }
                  }}
                  style={{
                    padding: '8px 12px', marginBottom: '4px',
                    borderRadius: '8px', textAlign: 'center',
                    fontSize: '12px', color: 'var(--text-secondary-color, #888)',
                    backgroundColor: dropTargetFolderId === '__root__'
                      ? 'var(--color-primary-light, rgba(108, 99, 255, 0.2))'
                      : 'transparent',
                    border: '2px dashed var(--default-border-color, #ccc)',
                    borderColor: dropTargetFolderId === '__root__' ? 'var(--color-primary, #6c63ff)' : 'var(--default-border-color, #ccc)',
                    transition: 'background-color 0.15s, border-color 0.15s',
                  }}
                >
                  {t.moveToRoot}
                </div>
              )}

              {/* Root-level drawings (no folder) */}
              {rootDrawings.map(renderDrawingRow)}
            </div>
          ) : (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-secondary-color, #666)' }}>
              <p>{t.noDrawingsYet}</p>
              <p>{t.clickNewToStart}</p>
            </div>
          )}

          {/* === Section: Ritningar (enskilda filer) === */}
          <div style={sectionHeaderStyle}>{t.sectionDrawings}</div>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <ActionButton
              icon="📄"
              label={t.createNewDrawing}
              description={t.createNewDrawingDesc}
              onClick={() => handleCreate()}
            />
            <ActionButton
              icon="📂"
              label={t.openFromFile}
              description={t.openFromFileDesc}
              onClick={importExcalidrawFile}
            />
            {/* Create folder */}
            {creatingFolder ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' }}>
                <input
                  ref={newFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                  placeholder={t.newFolderName}
                  style={{
                    flex: 1, padding: '8px 12px', fontSize: '14px',
                    border: '1px solid var(--color-primary, #6c63ff)', borderRadius: '8px', outline: 'none',
                  }}
                />
                <button onClick={handleCreateFolder}
                  style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: 'var(--color-primary, #6c63ff)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  {t.save}
                </button>
                <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}
                  style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: 'transparent', border: '1px solid var(--default-border-color, #ccc)', borderRadius: '8px', cursor: 'pointer', color: 'inherit' }}>
                  {t.cancel}
                </button>
              </div>
            ) : (
              <ActionButton
                icon="📁"
                label={t.createFolder}
                description=""
                onClick={() => setCreatingFolder(true)}
              />
            )}
          </div>

          {/* === Section: Hela arbetsytan === */}
          <div style={sectionHeaderStyle}>{t.sectionWorkspace}</div>
          {daysSinceBackup !== null && (() => {
            const isNever = daysSinceBackup >= 999;
            const isCritical = !isNever && daysSinceBackup >= 30;
            const isWarning = !isNever && !isCritical && daysSinceBackup >= 7;
            const isInfo = !isNever && !isCritical && !isWarning;
            const dateStr = lastBackupTimestamp
              ? new Date(lastBackupTimestamp).toLocaleString(effectiveLang || 'sv', {
                  year: 'numeric', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })
              : null;
            const ageStr = daysSinceBackup === 0 ? 'idag' : `för ${daysSinceBackup} dagar sedan`;
            return (
              <div
                style={{
                  margin: '0 20px 12px',
                  padding: '10px 14px',
                  backgroundColor: isCritical || isNever ? '#f8d7da' : isWarning ? '#fff3cd' : 'transparent',
                  color: isCritical || isNever ? '#721c24' : isWarning ? '#856404' : 'var(--text-secondary-color, #888)',
                  fontSize: '13px',
                  fontWeight: isInfo ? 400 : 500,
                  border: isInfo
                    ? '1px solid var(--default-border-color, #e0e0e0)'
                    : `1px solid ${isCritical || isNever ? '#dc3545' : '#ffc107'}`,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '16px' }}>
                  {isNever || isCritical ? '🚨' : isWarning ? '⚠️' : '💾'}
                </span>
                <span>
                  {isNever
                    ? <><strong>Ingen backup gjord ännu.</strong> Klicka "Spara alla ritningar" nedan för att ladda ner en kopia.</>
                    : isCritical
                      ? <><strong>Ingen backup på {daysSinceBackup} dagar.</strong> Senast: {dateStr}.</>
                      : isWarning
                        ? <>Senaste backup {ageStr} ({dateStr}). Överväg att spara en ny.</>
                        : <>Senaste backup {ageStr} ({dateStr}).</>
                  }
                </span>
              </div>
            );
          })()}
          <div style={{ padding: '0 20px 16px', display: 'flex', gap: '8px' }}>
            <ActionButton
              icon="💾"
              label={t.saveAllBackup}
              description={t.saveAllBackupDesc}
              onClick={() => {
                localStorage.setItem('rita-workspace-last-backup', Date.now().toString());
                exportWorkspace();
              }}
            />
            <ActionButton
              icon="📦"
              label="Exportera alla som .excalidraw"
              description="Laddar ner varje ritning som separat fil"
              onClick={exportAllDrawingsAsExcalidraw}
            />
            <ActionButton
              icon="📥"
              label={t.loadBackup}
              description={t.loadBackupDesc}
              onClick={importWorkspace}
            />
          </div>

          {/* === Settings: auto-start workspace mode === */}
          <div style={{ padding: '0 20px 16px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                border: '1px solid var(--default-border-color, #e0e0e0)',
                borderRadius: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={autoStart}
                onChange={handleToggleAutoStart}
                style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{t.autoStartLabel}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary-color, #888)', marginTop: '2px' }}>
                  {t.autoStartDesc}
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Confirm delete modal — for drawings and folders */}
      {(confirmDeleteId || confirmDeleteFolderId) && (() => {
        const isFolder = !!confirmDeleteFolderId;
        const targetName = isFolder
          ? folders.find((f) => f.id === confirmDeleteFolderId)?.name
          : drawings.find((d) => d.id === confirmDeleteId)?.name;
        const onConfirm = () => {
          if (isFolder && confirmDeleteFolderId) handleDeleteFolder(confirmDeleteFolderId);
          else if (confirmDeleteId) handleDelete(confirmDeleteId);
        };
        const onCancel = () => {
          setConfirmDeleteId(null);
          setConfirmDeleteFolderId(null);
        };
        return (
          <div
            className="rita-workspace-confirm-modal"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10000,
            }}
          >
            <div style={{
              backgroundColor: 'var(--island-bg-color, #fff)',
              color: 'var(--text-primary-color, #1b1b1f)',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '320px',
              maxWidth: '420px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>
                {isFolder ? t.deleteFolder : t.delete}
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary-color, #666)' }}>
                {isFolder ? t.deleteFolderConfirm : t.confirmDelete}
                {targetName && (
                  <>
                    {' '}<strong style={{ color: 'var(--text-primary-color, #1b1b1f)' }}>{targetName}</strong>?
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={onCancel}
                  autoFocus
                  style={{
                    padding: '8px 16px', fontSize: '14px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--default-border-color, #ccc)',
                    borderRadius: '6px', cursor: 'pointer', color: 'inherit',
                  }}
                >
                  {t.cancel}
                </button>
                <button
                  onClick={onConfirm}
                  style={{
                    padding: '8px 16px', fontSize: '14px',
                    backgroundColor: '#dc3545', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                  }}
                >
                  {t.delete}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DrawingsDialog;
