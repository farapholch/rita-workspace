/**
 * Drawings Dialog
 *
 * A modal dialog for managing all drawings in the workspace.
 * Provides full CRUD operations: view, rename, delete, create new.
 */

import React, { useState, useCallback } from 'react';
import { useWorkspace } from '../../state/WorkspaceContext';
import { getTranslations } from '../../i18n';
import type { Drawing } from '../../storage/db';
import type { Translations } from '../../i18n';

export interface DrawingsDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;

  /**
   * Called when the dialog should close
   */
  onClose: () => void;

  /**
   * Called when a drawing is selected
   */
  onDrawingSelect?: (drawing: Drawing) => void;

  /**
   * Language code (e.g., 'sv', 'en', 'sv-SE')
   * Falls back to English if not supported
   */
  lang?: string;

  /**
   * Optional thumbnail renderer for each drawing
   */
  renderThumbnail?: (drawing: Drawing) => React.ReactNode;
}

/**
 * DrawingsDialog - modal for managing workspace drawings
 */
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
    t: contextT,
    lang: contextLang,
  } = useWorkspace();

  // Use explicit lang prop if provided, otherwise use context language
  const t = lang ? getTranslations(lang) : contextT;
  const effectiveLang = lang || contextLang;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSelect = useCallback(async (drawing: Drawing) => {
    await switchDrawing(drawing.id);
    onDrawingSelect?.(drawing);
  }, [switchDrawing, onDrawingSelect]);

  const handleCreate = useCallback(async () => {
    const newDrawing = await createNewDrawing();
    if (newDrawing) {
      onDrawingSelect?.(newDrawing);
    }
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

  // Use language-appropriate locale for date formatting
  const getLocale = () => {
    if (!effectiveLang) return 'en-US';
    const baseLang = effectiveLang.split('-')[0].toLowerCase();
    if (baseLang === 'sv') return 'sv-SE';
    return 'en-US';
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(getLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!open) return null;

  return (
    <div
      className="rita-workspace-dialog-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rita-workspace-dialog"
        style={{
          backgroundColor: 'var(--island-bg-color, #fff)',
          borderRadius: '8px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-primary-color, #1b1b1f)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--default-border-color, #e0e0e0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            {t.dialogTitle}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1,
              color: 'inherit',
            }}
            aria-label={t.close}
          >
            ×
          </button>
        </div>

        {/* Drawings List */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px 0',
          }}
        >
          {drawings.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary-color, #666)',
              }}
            >
              <p>{t.noDrawingsYet}</p>
              <p>{t.clickNewToStart}</p>
            </div>
          ) : (
            drawings.map((drawing) => (
              <div
                key={drawing.id}
                className="rita-workspace-dialog-item"
                onClick={() => {
                  if (editingId || confirmDeleteId) return;
                  if (activeDrawing?.id !== drawing.id) handleSelect(drawing);
                }}
                style={{
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderBottom: '1px solid var(--default-border-color, #f0f0f0)',
                  cursor: editingId || confirmDeleteId ? 'default' : 'pointer',
                  backgroundColor:
                    activeDrawing?.id === drawing.id
                      ? 'var(--color-primary-light, rgba(108, 99, 255, 0.1))'
                      : 'transparent',
                }}
              >
                {/* Thumbnail */}
                {renderThumbnail && (
                  <div style={{
                    width: '80px',
                    height: '60px',
                    flexShrink: 0,
                    borderRadius: '4px',
                    overflow: 'hidden',
                    border: '1px solid var(--default-border-color, #e0e0e0)',
                    backgroundColor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {renderThumbnail(drawing)}
                  </div>
                )}
                {/* Drawing info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === drawing.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        fontSize: '14px',
                        border: '1px solid var(--color-primary, #6c63ff)',
                        borderRadius: '4px',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <>
                      <div
                        style={{
                          fontWeight: activeDrawing?.id === drawing.id ? 600 : 400,
                          fontSize: '14px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {activeDrawing?.id === drawing.id && '✓ '}
                        {drawing.name}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary-color, #888)',
                          marginTop: '2px',
                        }}
                      >
                        {t.modified}: {formatDate(drawing.updatedAt)}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {editingId === drawing.id ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: 'var(--color-primary, #6c63ff)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {t.save}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--default-border-color, #ccc)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                      >
                        {t.cancel}
                      </button>
                    </>
                  ) : confirmDeleteId === drawing.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(drawing.id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: '#dc3545',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {t.delete}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--default-border-color, #ccc)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                      >
                        {t.cancel}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); exportDrawingAsExcalidraw(drawing.id); }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--default-border-color, #ccc)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                        title={t.exportDrawing}
                      >
                        💾
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartEdit(drawing); }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--default-border-color, #ccc)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                        title={t.rename}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(drawing.id); }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--default-border-color, #ccc)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                        title={t.delete}
                        disabled={drawings.length <= 1}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--default-border-color, #e0e0e0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreate}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: 'var(--color-primary, #6c63ff)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              + {t.newDrawing}
            </button>
            <button
              onClick={importExcalidrawFile}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                border: '1px solid var(--default-border-color, #ccc)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              📂 {t.importDrawing}
            </button>
            <button
              onClick={importWorkspace}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                border: '1px solid var(--default-border-color, #ccc)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              📥 {t.importWorkspace}
            </button>
            <button
              onClick={exportWorkspace}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                border: '1px solid var(--default-border-color, #ccc)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'inherit',
              }}
              disabled={drawings.length === 0}
            >
              📤 {t.exportWorkspace}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrawingsDialog;
