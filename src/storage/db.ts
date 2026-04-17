import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Drawing {
  id: string;
  name: string;
  folderId?: string | null;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  drawingIds: string[];
  activeDrawingId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface RitaWorkspaceDB extends DBSchema {
  workspaces: {
    key: string;
    value: Workspace;
    indexes: { 'by-updated': number };
  };
  drawings: {
    key: string;
    value: Drawing;
    indexes: { 'by-updated': number };
  };
  folders: {
    key: string;
    value: Folder;
    indexes: { 'by-name': string };
  };
}

const DB_NAME = 'rita-workspace';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<RitaWorkspaceDB> | null = null;
let dbPromise: Promise<IDBPDatabase<RitaWorkspaceDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<RitaWorkspaceDB>> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = openDB<RitaWorkspaceDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // === Version 1: workspaces + drawings ===
      if (!db.objectStoreNames.contains('workspaces')) {
        const workspaceStore = db.createObjectStore('workspaces', { keyPath: 'id' });
        workspaceStore.createIndex('by-updated', 'updatedAt');
      }

      if (!db.objectStoreNames.contains('drawings')) {
        const drawingStore = db.createObjectStore('drawings', { keyPath: 'id' });
        drawingStore.createIndex('by-updated', 'updatedAt');
      }

      // === Version 2: folders ===
      if (oldVersion < 2) {
        const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
        folderStore.createIndex('by-name', 'name');
      }
    },
  });

  dbInstance = await dbPromise;
  dbPromise = null;
  return dbInstance;
}

/** Pre-warm the DB connection so it's ready when first query runs */
export function warmDB(): void {
  if (!dbInstance && !dbPromise) getDB();
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
