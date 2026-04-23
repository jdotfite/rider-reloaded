import { snapToGrid } from '../../editor/GridMath';
import { Vec2 } from '../../math/Vec2';

export type PointSnapKind = 'none' | 'endpoint' | 'grid';

export interface PointSnapResult {
  point: Vec2;
  kind: PointSnapKind;
}

export function resolvePointSnap(
  point: Vec2,
  options: {
    gridEnabled: boolean;
    gridSize: number;
    endpoint: Vec2 | null;
  },
): PointSnapResult {
  if (options.gridEnabled) {
    return {
      point: snapToGrid(point, options.gridSize),
      kind: 'grid',
    };
  }

  if (options.endpoint) {
    return {
      point: options.endpoint.clone(),
      kind: 'endpoint',
    };
  }

  return {
    point: point.clone(),
    kind: 'none',
  };
}

export function renderPointSnapIndicator(
  ctx: CanvasRenderingContext2D,
  snap: PointSnapResult | null,
  zoom: number,
) {
  if (!snap || snap.kind === 'none') return;

  const isGrid = snap.kind === 'grid';
  const radius = (isGrid ? 6 : 5) / zoom;
  const arm = (isGrid ? 10 : 7) / zoom;

  ctx.save();
  ctx.lineWidth = 1.35 / zoom;
  ctx.strokeStyle = isGrid
    ? 'rgba(64, 120, 196, 0.82)'
    : 'rgba(68, 136, 204, 0.9)';
  ctx.fillStyle = isGrid
    ? 'rgba(64, 120, 196, 0.12)'
    : 'rgba(68, 136, 204, 0.14)';

  ctx.beginPath();
  ctx.arc(snap.point.x, snap.point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (isGrid) {
    ctx.beginPath();
    ctx.moveTo(snap.point.x - arm, snap.point.y);
    ctx.lineTo(snap.point.x + arm, snap.point.y);
    ctx.moveTo(snap.point.x, snap.point.y - arm);
    ctx.lineTo(snap.point.x, snap.point.y + arm);
    ctx.stroke();
  }

  ctx.restore();
}
