/**
 * Drawings Dialog
 *
 * A draggable modal dialog for managing all drawings in the workspace.
 * Design by Johan.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWorkspace } from '../../state/WorkspaceContext';
import { getTranslations } from '../../i18n';
import type { Drawing } from '../../storage/db';

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
    activeDrawing,
    switchDrawing,
    createNewDrawing,
    renameDrawing,
    removeDrawing,
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

  // Dragging state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      refreshDrawings();
      // Only reset position when dialog first opens, not on re-renders
      if (!prevOpenRef.current) {
        setPosition(null);
      }
    }
    prevOpenRef.current = open;
  }, [open, refreshDrawings]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
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
    await switchDrawing(drawing.id);
    onDrawingSelect?.(drawing);
    setSwitchingId(null);
  }, [switchDrawing, onDrawingSelect]);

  const handleCreate = useCallback(async () => {
    const newDrawing = await createNewDrawing();
    if (newDrawing) onDrawingSelect?.(newDrawing);
  }, [createNewDrawing, onDrawingSelect]);

  const handleStartEdit = useCallback((drawing: Drawing) => {
    setEditingId(drawing.id);
    setEditName(drawing.name);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingId && editName.trim()) {
      await renameDrawing(editingId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  }, [editingId, editName, renameDrawing]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await removeDrawing(id);
    setConfirmDeleteId(null);
  }, [removeDrawing]);

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

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* === Drawings list === */}
          {drawings.length > 0 && (
            <div style={{ padding: '8px 20px 0' }}>
              {drawings.map((drawing) => (
                <div
                  key={drawing.id}
                  onClick={() => {
                    if (editingId || confirmDeleteId || switchingId) return;
                    if (activeDrawing?.id !== drawing.id) handleSelect(drawing);
                  }}
                  style={{
                    padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px',
                    borderRadius: '8px', marginBottom: '4px',
                    cursor: editingId || confirmDeleteId || switchingId ? 'default' : 'pointer',
                    backgroundColor: activeDrawing?.id === drawing.id
                      ? 'var(--color-primary-light, rgba(108, 99, 255, 0.1))' : 'transparent',
                    transition: 'background-color 0.15s',
                    opacity: switchingId && switchingId !== drawing.id ? 0.5 : 1,
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
                  <div style={{ display: 'flex', gap: '2px' }}>
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
                    ) : editingId !== drawing.id && (
                      <>
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
              ))}
            </div>
          )}

          {drawings.length === 0 && (
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
              onClick={handleCreate}
              primary
            />
            <ActionButton
              icon="📂"
              label={t.openFromFile}
              description={t.openFromFileDesc}
              onClick={importExcalidrawFile}
            />
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
