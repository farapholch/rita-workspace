/**
 * Race-guard helper for saveCurrentDrawing.
 *
 * Extracted as a pure function so the merge-prevention logic can be unit-tested
 * without spinning up the full React context. Used by WorkspaceContext to
 * abort writes when the active drawing has changed since the caller captured
 * its `expectedDrawingId`.
 */
export function shouldAbortSaveDueToIdMismatch(
  expectedDrawingId: string | null | undefined,
  currentActiveDrawingId: string | null | undefined,
): boolean {
  if (!expectedDrawingId) return true;
  if (!currentActiveDrawingId) return true;
  return expectedDrawingId !== currentActiveDrawingId;
}
