import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Drawing {
  id: string;
  name: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
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
}

const DB_NAME = 'rita-workspace';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<RitaWorkspaceDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<RitaWorkspaceDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<RitaWorkspaceDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Workspaces store
      if (!db.objectStoreNames.contains('workspaces')) {
        const workspaceStore = db.createObjectStore('workspaces', { keyPath: 'id' });
        workspaceStore.createIndex('by-updated', 'updatedAt');
      }

      // Drawings store
      if (!db.objectStoreNames.contains('drawings')) {
        const drawingStore = db.createObjectStore('drawings', { keyPath: 'id' });
        drawingStore.createIndex('by-updated', 'updatedAt');
      }
    },
  });

  return dbInstance;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
