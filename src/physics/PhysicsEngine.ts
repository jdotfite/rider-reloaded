import { Rider } from './Rider';
import { SpatialGrid } from './grid/SpatialGrid';
import { Line } from './lines/Line';
import { AccLine } from './lines/AccLine';
import { LineType } from './lines/LineTypes';
import { CollisionPoint } from './points/CollisionPoint';
import { ITERATIONS, MAX_LINE_COLLIDE_DIST } from '../constants';

export class PhysicsEngine {
  rider: Rider;
  grid: SpatialGrid;

  constructor(rider: Rider, grid: SpatialGrid) {
    this.rider = rider;
    this.grid = grid;
  }

  step() {
    // 1. Verlet integration (stores momentum for collision checks)
    for (const point of this.rider.points) {
      point.step();
    }

    // 2. Iterate the constraints that belong in the main solver loop.
    for (let i = 0; i < ITERATIONS; i++) {
      this.resolveConstraints();

      for (const cp of this.rider.collisionPoints) {
        this.collidePoint(cp);
      }
    }

    // 3. Resolve non-iterating constraints after the solver loop.
    for (const rs of this.rider.repelSticks) {
      rs.resolve();
    }

    for (const joint of this.rider.bindJoints) {
      joint.resolve();
    }

    for (const chain of this.rider.chains) {
      chain.resolve();
    }
  }

  private resolveConstraints() {
    for (const c of this.rider.iteratingConstraints) {
      c.resolve();
    }
  }

  private collidePoint(cp: CollisionPoint) {
    const nearbyLines = this.grid.queryPoint(cp.pos.x, cp.pos.y);
    for (const line of nearbyLines) {
      if (line.type === LineType.SCENERY) continue;
      this.collideLine(cp, line);
    }
  }

  /**
   * Line collision matching lr-core / linerider-advanced exactly.
   *
   * Three checks:
   * 1. Moving into line: dot(momentum, normal) > 0
   * 2. In force zone: 0 < perpComp < Zone (10)
   * 3. Within line extent: leftBound <= t <= rightBound
   *
   * Response:
   * - pos projected onto surface
   * - prevPos adjusted by friction vector with conditional sign flips
   * - Acc lines additionally shift prevPos along line direction
   */
  private collideLine(cp: CollisionPoint, line: Line) {
    // CHECK 1: momentum must point into the line's normal direction
    const momDot = cp.momentum.x * line.normal.x + cp.momentum.y * line.normal.y;
    if (momDot <= 0) return;

    // Offset from line start
    const offX = cp.pos.x - line.p1.x;
    const offY = cp.pos.y - line.p1.y;

    // CHECK 2: perpendicular distance in (0, Zone)
    const perpComp = offX * line.normal.x + offY * line.normal.y;
    if (perpComp <= 0 || perpComp >= MAX_LINE_COLLIDE_DIST) return;

    // CHECK 3: within line extent (with extension)
    const linePos = (offX * line.delta.x + offY * line.delta.y) * line.invLengthSq;
    if (linePos < line.leftBound || linePos > line.rightBound) return;

    // --- COLLISION RESPONSE ---

    // Project point onto line surface (remove perpendicular component)
    const newPosX = cp.pos.x - line.normal.x * perpComp;
    const newPosY = cp.pos.y - line.normal.y * perpComp;
    cp.pos.x = newPosX;
    cp.pos.y = newPosY;

    // Friction: adjust prevPos
    // frictionVec = normal.rotCCW() * friction * perpComp
    // rotCCW of (-dy, dx) = (dx, dy)... no:
    // rotCCW(x, y) = (y, -x)
    // So rotCCW(normal) = (normal.y, -normal.x)
    if (cp.friction > 0) {
      let fx = line.normal.y * cp.friction * perpComp;
      let fy = -line.normal.x * cp.friction * perpComp;

      // Conditional sign flips (matching original game exactly)
      if (cp.prevPos.x >= newPosX) fx = -fx;
      if (cp.prevPos.y < newPosY) fy = -fy;

      cp.prevPos.x += fx;
      cp.prevPos.y += fy;
    }

    // Acceleration line boost: shift prevPos along line direction
    if (line.type === LineType.ACC) {
      const accLine = line as AccLine;
      // acc direction = normal.rotCW() = (-normal.y, normal.x) ... that's the line direction
      // The live game also supports per-line accel multipliers on top of the base 0.1 boost.
      const accX = -line.normal.y * accLine.accMultiplier;
      const accY = line.normal.x * accLine.accMultiplier;
      cp.prevPos.x += accX;
      cp.prevPos.y += accY;
    }
  }
}
