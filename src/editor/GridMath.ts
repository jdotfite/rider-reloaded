import { Vec2 } from '../math/Vec2';

export const DEFAULT_EDITOR_GRID_SIZE = 24;
export const MIN_EDITOR_GRID_SIZE = 8;
export const MAX_EDITOR_GRID_SIZE = 64;
export const DEFAULT_EDITOR_GRID_MAJOR_EVERY = 4;

export interface EditorGridSettings {
  enabled: boolean;
  snapEnabled: boolean;
  size: number;
  majorEvery: number;
}

export function clampEditorGridSize(size: number): number {
  const normalized = Number.isFinite(size)
    ? Math.round(size)
    : DEFAULT_EDITOR_GRID_SIZE;
  return Math.max(MIN_EDITOR_GRID_SIZE, Math.min(MAX_EDITOR_GRID_SIZE, normalized));
}

export function snapToGrid(point: Vec2, size: number): Vec2 {
  const step = clampEditorGridSize(size);
  return new Vec2(
    Math.round(point.x / step) * step,
    Math.round(point.y / step) * step,
  );
}
