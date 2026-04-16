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
    onClick={onClick}
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
    exportWorkspace,
    importWorkspace,
    exportDrawingAsExcalidraw,
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

  // Drag-and-drop state (for moving drawings to folders)
  const [draggingDrawingId, setDraggingDrawingId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null); // null = root, '__none__' = no target

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
      setIsRefreshing(true);
      refreshDrawings().finally(() => setIsRefreshing(false));
      if (!prevOpenRef.current) {
        setPosition(null);
        setSearchQuery('');
        setSelectedId(null);
        // Expand all folders by default on first open
        setExpandedFolders(new Set(foldersRef.current.map((f) => f.id)));
      }
    }
    prevOpenRef.current = open;
  }, [open, refreshDrawings]);

  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [creatingFolder]);

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
    const newDrawing = await createNewDrawing(undefined, folderId);
    if (newDrawing) onDrawingSelect?.(newDrawing);
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

  // Filter and group drawings by folder (memoized — must be before early return)
  const { rootDrawings, drawingsByFolder, filteredFolders } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? drawings.filter((d) => d.name.toLowerCase().includes(query))
      : drawings;
    const root = filtered.filter((d) => !d.folderId);
    const byFolder: Record<string, Drawing[]> = {};
    for (const folder of folders) {
      byFolder[folder.id] = filtered.filter((d) => d.folderId === folder.id);
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
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (editingId || confirmDeleteId || movingDrawingId) return;
        setSelectedId(drawing.id);
      }}
      style={{
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px',
        borderRadius: '8px', marginBottom: '4px',
        cursor: draggingDrawingId ? 'grabbing' : 'pointer',
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
      {renderThumbnail && (
        <div style={{
          width: '64px', height: '48px', flexShrink: 0, borderRadius: '4px',
          overflow: 'hidden', border: '1px solid var(--default-border-color, #e0e0e0)',
          backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
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
                  whiteSpace: 'nowrap', cursor: 'text',
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
      {/* Row actions */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        {confirmDeleteId === drawing.id ? (
          <>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(drawing.id); }}
              style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {t.delete}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
              style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid var(--default-border-color, #ccc)', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>
              {t.cancel}
            </button>
          </>
        ) : movingDrawingId === drawing.id ? (
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
              title={t.delete} disabled={drawings.length <= 1}>🗑️</button>
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
          {confirmDeleteFolderId === folder.id ? (
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => handleDeleteFolder(folder.id)}
                style={{ padding: '2px 8px', fontSize: '12px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {t.delete}
              </button>
              <button onClick={() => setConfirmDeleteFolderId(null)}
                style={{ padding: '2px 8px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid var(--default-border-color, #ccc)', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>
                {t.cancel}
              </button>
            </div>
          ) : editingFolderId !== folder.id && (
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            {t.dialogTitle}
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
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* === Drawings & Folders list === */}
          {isRefreshing && drawings.length === 0 ? (
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
              primary
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
          <div style={{ padding: '0 20px 16px', display: 'flex', gap: '8px' }}>
            <ActionButton
              icon="💾"
              label={t.saveAllBackup}
              description={t.saveAllBackupDesc}
              onClick={exportWorkspace}
            />
            <ActionButton
              icon="📥"
              label={t.loadBackup}
              description={t.loadBackupDesc}
              onClick={importWorkspace}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrawingsDialog;
