import React, { useState, useRef, useEffect } from 'react';
import { Drawing } from '../../storage';
import styles from './DrawingList.module.css';

interface DrawingListItemProps {
  drawing: Drawing;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export function DrawingListItem({
  drawing,
  isActive,
  onSelect,
  onRename,
  onDelete,
  canDelete,
}: DrawingListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(drawing.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setEditName(drawing.name);
      setIsEditing(false);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Ta bort "${drawing.name}"?`)) {
      onDelete();
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('sv-SE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <li
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      onClick={onSelect}
    >
      <div className={styles.itemContent}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            className={styles.editInput}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span
              className={styles.name}
              onDoubleClick={handleDoubleClick}
              title="Dubbelklicka för att byta namn"
            >
              {drawing.name}
            </span>
            <span className={styles.date}>{formatDate(drawing.updatedAt)}</span>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.actionButton}
          onClick={handleDoubleClick}
          title="Byt namn (F2)"
        >
          ✏️
        </button>
        {canDelete && (
          <button
            className={styles.actionButton}
            onClick={handleDeleteClick}
            title="Ta bort"
          >
            🗑️
          </button>
        )}
      </div>
    </li>
  );
}
