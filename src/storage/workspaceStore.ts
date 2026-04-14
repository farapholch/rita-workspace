import { nanoid } from 'nanoid';
import { getDB, Workspace } from './db';
import { createDrawing } from './drawingStore';

const DEFAULT_WORKSPACE_ID = 'default';

export async function getOrCreateDefaultWorkspace(): Promise<Workspace> {
  const db = await getDB();
  let workspace = await db.get('workspaces', DEFAULT_WORKSPACE_ID);

  if (!workspace) {
    // Create default workspace with one empty drawing
    const firstDrawing = await createDrawing('Ritning 1');
    const now = Date.now();

    workspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: 'My Workspace',
      drawingIds: [firstDrawing.id],
      activeDrawingId: firstDrawing.id,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('workspaces', workspace);
  }

  return workspace;
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  const db = await getDB();
  return db.get('workspaces', id);
}

export async function updateWorkspace(
  id: string,
  updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>
): Promise<Workspace | undefined> {
  const db = await getDB();
  const existing = await db.get('workspaces', id);

  if (!existing) return undefined;

  const updated: Workspace = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await db.put('workspaces', updated);
  return updated;
}

export async function addDrawingToWorkspace(
  workspaceId: string,
  drawingId: string
): Promise<Workspace | undefined> {
  const workspace = await getWorkspace(workspaceId);

  if (!workspace) return undefined;

  if (!workspace.drawingIds.includes(drawingId)) {
    workspace.drawingIds.push(drawingId);
    return updateWorkspace(workspaceId, {
      drawingIds: workspace.drawingIds,
    });
  }

  return workspace;
}

export async function removeDrawingFromWorkspace(
  workspaceId: string,
  drawingId: string
): Promise<Workspace | undefined> {
  const workspace = await getWorkspace(workspaceId);

  if (!workspace) return undefined;

  const newDrawingIds = workspace.drawingIds.filter((id) => id !== drawingId);

  // Ensure at least one drawing remains
  if (newDrawingIds.length === 0) {
    return workspace;
  }

  // If removing active drawing, switch to first remaining
  const newActiveId =
    workspace.activeDrawingId === drawingId
      ? newDrawingIds[0]
      : workspace.activeDrawingId;

  return updateWorkspace(workspaceId, {
    drawingIds: newDrawingIds,
    activeDrawingId: newActiveId,
  });
}

export async function setActiveDrawing(
  workspaceId: string,
  drawingId: string
): Promise<Workspace | undefined> {
  return updateWorkspace(workspaceId, { activeDrawingId: drawingId });
}
