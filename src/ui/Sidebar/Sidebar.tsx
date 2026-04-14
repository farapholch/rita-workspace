import React, { useState } from 'react';
import { useWorkspace } from '../../state';
import { DrawingList } from '../DrawingList';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  width?: number;
}

export function Sidebar({ isOpen = true, onToggle, width = 250 }: SidebarProps) {
  const { createNewDrawing, isLoading } = useWorkspace();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateNew = async () => {
    setIsCreating(true);
    await createNewDrawing();
    setIsCreating(false);
  };

  if (!isOpen) {
    return (
      <button
        className={styles.toggleButton}
        onClick={onToggle}
        title="Open sidebar (Ctrl+B)"
        aria-label="Open sidebar"
      >
        ☰
      </button>
    );
  }

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <header className={styles.header}>
        <h2 className={styles.title}>Ritningar</h2>
        <button
          className={styles.closeButton}
          onClick={onToggle}
          title="Close sidebar (Ctrl+B)"
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </header>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>Laddar...</div>
        ) : (
          <DrawingList />
        )}
      </div>

      <footer className={styles.footer}>
        <button
          className={styles.newButton}
          onClick={handleCreateNew}
          disabled={isCreating}
        >
          {isCreating ? 'Skapar...' : '+ Ny ritning'}
        </button>
      </footer>
    </aside>
  );
}
