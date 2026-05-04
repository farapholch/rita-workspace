import { describe, it, expect } from 'vitest';
import { shouldAbortSaveDueToIdMismatch } from './saveGuard';

describe('shouldAbortSaveDueToIdMismatch', () => {
  it('lets save through when expected and active id match', () => {
    expect(shouldAbortSaveDueToIdMismatch('drawing-a', 'drawing-a')).toBe(false);
  });

  it('aborts save when expected differs from active (switch-during-save)', () => {
    // Caller captured expectedDrawingId='A' before the user switched to B.
    // By the time the deferred save fires, active is 'B' — writing A's data
    // would be fine, but writing CANVAS-B's data to A's row would merge.
    expect(shouldAbortSaveDueToIdMismatch('drawing-a', 'drawing-b')).toBe(true);
  });

  it('aborts save when active drawing is null (e.g. workspace torn down)', () => {
    expect(shouldAbortSaveDueToIdMismatch('drawing-a', null)).toBe(true);
  });

  it('aborts save when active drawing is undefined', () => {
    expect(shouldAbortSaveDueToIdMismatch('drawing-a', undefined)).toBe(true);
  });

  it('aborts save when expected id is null', () => {
    expect(shouldAbortSaveDueToIdMismatch(null, 'drawing-a')).toBe(true);
  });

  it('aborts save when expected id is empty string', () => {
    // Defensive: an empty expectedDrawingId means caller had no active drawing
    // when capturing elements — writing them anywhere is wrong.
    expect(shouldAbortSaveDueToIdMismatch('', 'drawing-a')).toBe(true);
  });

  it('aborts save when both ids are null/undefined', () => {
    expect(shouldAbortSaveDueToIdMismatch(null, null)).toBe(true);
    expect(shouldAbortSaveDueToIdMismatch(undefined, undefined)).toBe(true);
  });

  it('handles long realistic id strings', () => {
    const idA = 'AJf8H_Ep4QGKyExR0rhMx';
    const idB = 'OHvYn7DfOR9Lv8Ex3VFOW';
    expect(shouldAbortSaveDueToIdMismatch(idA, idA)).toBe(false);
    expect(shouldAbortSaveDueToIdMismatch(idA, idB)).toBe(true);
  });
});
