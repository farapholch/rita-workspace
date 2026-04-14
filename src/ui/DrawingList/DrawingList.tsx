import React from 'react';
import { useWorkspace } from '../../state';
import { DrawingListItem } from './DrawingListItem';
import styles from './DrawingList.module.css';

export function DrawingList() {
  const { drawings, activeDrawing, switchDrawing, renameDrawing, removeDrawing } = useWorkspace();

  if (drawings.length === 0) {
    return <div className={styles.empty}>Inga ritningar</div>;
  }

  return (
    <ul className={styles.list}>
      {drawings.map((drawing) => (
        <DrawingListItem
          key={drawing.id}
          drawing={drawing}
          isActive={drawing.id === activeDrawing?.id}
          onSelect={() => switchDrawing(drawing.id)}
          onRename={(name) => renameDrawing(drawing.id, name)}
          onDelete={() => removeDrawing(drawing.id)}
          canDelete={drawings.length > 1}
        />
      ))}
    </ul>
  );
}
