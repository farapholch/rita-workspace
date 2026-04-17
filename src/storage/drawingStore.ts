import { nanoid } from 'nanoid';
import { getDB, Drawing } from './db';

export async function createDrawing(
  name: string = 'Untitled',
  elements: unknown[] = [],
  appState: Record<string, unknown> = {},
  folderId?: string | null
): Promise<Drawing> {
  const db = await getDB();
  const now = Date.now();

  const drawing: Drawing = {
    id: nanoid(),
    name,
    folderId: folderId || null,
    elements,
    appState,
    files: {},
    createdAt: now,
    updatedAt: now,
  };

  await db.put('drawings', drawing);
  return drawing;
}

export async function getDrawing(id: string): Promise<Drawing | undefined> {
  const db = await getDB();
  return db.get('drawings', id);
}

export async function getAllDrawings(): Promise<Drawing[]> {
  const db = await getDB();
  return db.getAllFromIndex('drawings', 'by-updated');
}

/** Lightweight metadata-only fetch — skips elements/appState/files for fast listing */
export type DrawingMeta = Pick<Drawing, 'id' | 'name' | 'folderId' | 'createdAt' | 'updatedAt'>;

export async function getAllDrawingsMeta(): Promise<DrawingMeta[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('drawings', 'by-updated');
  return all.map(({ id, name, folderId, createdAt, updatedAt }) => ({
    id, name, folderId, createdAt, updatedAt,
  }));
}

export async function updateDrawing(
  id: string,
  updates: Partial<Omit<Drawing, 'id' | 'createdAt'>>
): Promise<Drawing | undefined> {
  const db = await getDB();
  const existing = await db.get('drawings', id);

  if (!existing) return undefined;

  const updated: Drawing = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await db.put('drawings', updated);
  return updated;
}

export async function deleteDrawing(id: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get('drawings', id);

  if (!existing) return false;

  await db.delete('drawings', id);
  return true;
}

export async function duplicateDrawing(id: string, newName?: string): Promise<Drawing | undefined> {
  const existing = await getDrawing(id);

  if (!existing) return undefined;

  return createDrawing(
    newName || `${existing.name} (copy)`,
    existing.elements,
    existing.appState,
    existing.folderId
  );
}

export async function moveDrawingToFolder(
  drawingId: string,
  folderId: string | null
): Promise<Drawing | undefined> {
  return updateDrawing(drawingId, { folderId });
}
