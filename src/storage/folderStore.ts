import { nanoid } from 'nanoid';
import { getDB, Folder } from './db';

export async function createFolder(name: string): Promise<Folder> {
  const db = await getDB();
  const now = Date.now();

  const folder: Folder = {
    id: nanoid(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  await db.put('folders', folder);
  return folder;
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const db = await getDB();
  return db.get('folders', id);
}

export async function getAllFolders(): Promise<Folder[]> {
  const db = await getDB();
  return db.getAllFromIndex('folders', 'by-name');
}

export async function renameFolder(id: string, name: string): Promise<Folder | undefined> {
  const db = await getDB();
  const existing = await db.get('folders', id);

  if (!existing) return undefined;

  const updated: Folder = {
    ...existing,
    name,
    updatedAt: Date.now(),
  };

  await db.put('folders', updated);
  return updated;
}

/**
 * Reassigns 'position' field on the given ordered folder ids (0..n-1).
 * Folders not in `orderedIds` are left untouched.
 */
export async function reorderFolders(orderedIds: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('folders', 'readwrite');
  const store = tx.objectStore('folders');
  for (let i = 0; i < orderedIds.length; i++) {
    const existing = await store.get(orderedIds[i]);
    if (!existing) continue;
    await store.put({ ...existing, position: i });
  }
  await tx.done;
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();

  // Clear folderId on all drawings in this folder
  const allDrawings = await db.getAll('drawings');
  const tx = db.transaction(['drawings', 'folders'], 'readwrite');

  for (const drawing of allDrawings) {
    if (drawing.folderId === id) {
      drawing.folderId = null;
      drawing.updatedAt = Date.now();
      await tx.objectStore('drawings').put(drawing);
    }
  }

  await tx.objectStore('folders').delete(id);
  await tx.done;
}
