import { Vec2 } from '../../math/Vec2';
import { LineType } from './LineTypes';
import { MAX_LINE_COLLIDE_DIST } from '../../constants';

let nextLineId = 0;

export interface LineOptions {
  flipped?: boolean;
  leftExtended?: boolean;
  rightExtended?: boolean;
  layer?: number;
  multiplier?: number;
}

export class Line {
  readonly id: number;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly type: LineType;
  readonly flipped: boolean;
  readonly leftExtended: boolean;
  readonly rightExtended: boolean;
  readonly layer: number;

  // Derived geometry (computed once)
  readonly delta: Vec2;      // p2 - p1
  readonly length: number;
  readonly normal: Vec2;     // rotCW of direction: points INTO solid region
  readonly invLengthSq: number;
  readonly leftBound: number;
  readonly rightBound: number;

  constructor(p1: Vec2, p2: Vec2, type: LineType, options: LineOptions = {}) {
    this.id = nextLineId++;
    this.p1 = p1.clone();
    this.p2 = p2.clone();
    this.type = type;
    this.flipped = options.flipped ?? false;
    this.leftExtended = options.leftExtended ?? false;
    this.rightExtended = options.rightExtended ?? false;
    this.layer = options.layer ?? 0;

    this.delta = p2.sub(p1);
    this.length = this.delta.length();
    this.invLengthSq = this.length > 0 ? 1 / this.delta.lengthSq() : 0;

    // Normal: rotCW(dx, dy) = (-dy, dx) → points INTO the solid region
    // For a LTR line (dx>0, dy=0): normal = (0, dx) = pointing DOWN
    const flip = this.flipped ? -1 : 1;
    const nx = -(this.delta.y) * flip;
    const ny = this.delta.x * flip;
    const nl = Math.sqrt(nx * nx + ny * ny);
    this.normal = nl > 0 ? new Vec2(nx / nl, ny / nl) : new Vec2(0, 1);

    // Line extent with extension (matching lr-core / linerider-advanced)
    const ext = this.length > 0 ? Math.min(0.25, MAX_LINE_COLLIDE_DIST / this.length) : 0;
    this.leftBound = this.leftExtended ? -ext : 0;
    this.rightBound = this.rightExtended ? 1 + ext : 1;
  }

  /** Parametric projection [0,1] = on segment */
  projectT(point: Vec2): number {
    const rx = point.x - this.p1.x;
    const ry = point.y - this.p1.y;
    return (rx * this.delta.x + ry * this.delta.y) * this.invLengthSq;
  }

  /** Perpendicular distance (positive = inside force zone on normal side) */
  perpDistance(point: Vec2): number {
    const rx = point.x - this.p1.x;
    const ry = point.y - this.p1.y;
    return rx * this.normal.x + ry * this.normal.y;
  }

  distanceToPointSq(point: Vec2): number {
    if (this.invLengthSq === 0) {
      return this.p1.distanceToSq(point);
    }

    const t = Math.max(0, Math.min(1, this.projectT(point)));
    const closestX = this.p1.x + this.delta.x * t;
    const closestY = this.p1.y + this.delta.y * t;
    const dx = point.x - closestX;
    const dy = point.y - closestY;
    return dx * dx + dy * dy;
  }
}
