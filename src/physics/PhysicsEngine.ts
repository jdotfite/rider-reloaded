import { Rider } from './Rider';
import { SpatialGrid } from './grid/SpatialGrid';
import { Line } from './lines/Line';
import { AccLine } from './lines/AccLine';
import { LineType } from './lines/LineTypes';
import { CollisionPoint } from './points/CollisionPoint';
import { ITERATIONS, MAX_LINE_COLLIDE_DIST } from '../constants';
import type { PortalPair, PortalEndpoint, PortalEndpointKey } from '../store/PortalTypes';
import {
  pointInsidePortalCapsule,
  portalLocalToWorld,
  portalNormal,
  portalTangent,
  worldToPortalLocal,
} from '../portal/portalMath';
import { Vec2 } from '../math/Vec2';

export interface PortalTeleportEvent {
  pairId: number;
  source: PortalEndpointKey;
  destination: PortalEndpointKey;
  entryPosition: Vec2;
  exitPosition: Vec2;
  speed: number;
  theme: PortalPair['visual']['colorTheme'];
}

export class PhysicsEngine {
  rider: Rider;
  grid: SpatialGrid;
  onPortalTeleport: ((event: PortalTeleportEvent) => void) | null = null;
  /** Line IDs that had active collisions during the last step */
  hitLines: Set<number> = new Set();
  private getPortals: () => PortalPair[];

  constructor(rider: Rider, grid: SpatialGrid, getPortals: () => PortalPair[] = () => []) {
    this.rider = rider;
    this.grid = grid;
    this.getPortals = getPortals;
  }

  step() {
    this.rider.tickTransientState();
    this.hitLines.clear();

    // 1. Verlet integration (stores momentum for collision checks)
    const gs = this.rider.gravityScale;
    for (const point of this.rider.points) {
      point.step(gs);
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

    // 4. LRA-style wave flutter on scarf (after chains resolve)
    this.rider.flutterScarf();

    this.resolvePortals();
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
    this.hitLines.add(line.id);

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
      // Keep accel direction independent from the rideable-side flip.
      // Base direction matches the legacy unflipped red-line behavior.
      const accelDirection = accLine.accelFlipped ? 1 : -1;
      const tangentX = line.length > 0 ? (line.delta.x / line.length) * accelDirection : 0;
      const tangentY = line.length > 0 ? (line.delta.y / line.length) * accelDirection : 0;
      const accX = tangentX * accLine.accMultiplier;
      const accY = tangentY * accLine.accMultiplier;
      cp.prevPos.x += accX;
      cp.prevPos.y += accY;
    }
  }

  private resolvePortals() {
    const portals = this.getPortals();
    if (portals.length === 0) return;

    for (const portal of portals) {
      if (!portal.enabled || this.rider.isPortalBlocked(portal.id)) continue;
      const triggerPoint = this.rider.getPortalTriggerPoint(portal.physics.triggerBody, 1);
      const triggerVelocity = this.rider.getPortalTriggerVelocity(portal.physics.triggerBody);

      const candidates: Array<[PortalEndpointKey, PortalEndpointKey]> = portal.mode === 'twoWay'
        ? [['entry', 'exit'], ['exit', 'entry']]
        : [['entry', 'exit']];

      for (const [sourceKey, destinationKey] of candidates) {
        const source = portal[sourceKey];
        if (!pointInsidePortalCapsule(triggerPoint, source, 2)) continue;
        if (!this.passesDirectionRule(triggerVelocity, source, portal.physics.entryDirectionRule)) continue;
        this.teleportThroughPortal(portal, sourceKey, destinationKey, triggerPoint);
        return;
      }
    }
  }

  private passesDirectionRule(velocity: Vec2, endpoint: PortalEndpoint, rule: PortalPair['physics']['entryDirectionRule']) {
    const alignment = velocity.dot(portalNormal(endpoint.rotation));
    if (rule === 'frontOnly') return alignment > 0;
    if (rule === 'backOnly') return alignment < 0;
    return true;
  }

  private teleportThroughPortal(
    pair: PortalPair,
    sourceKey: PortalEndpointKey,
    destinationKey: PortalEndpointKey,
    triggerPoint: Vec2,
  ) {
    const source = pair[sourceKey];
    const destination = pair[destinationKey];
    const local = worldToPortalLocal(triggerPoint, source);
    const mappedLocal = pair.physics.preserveLocalOffset ? local : new Vec2(0, 0);
    const exitLocal = new Vec2(mappedLocal.x, -(destination.radius + pair.physics.exitOffset));
    const nextCenter = this.resolveSafeExitPoint(destination, portalLocalToWorld(exitLocal, destination));
    const rotationDelta = destination.rotation - source.rotation;
    const sourceTangent = portalTangent(source.rotation);
    const sourceNormal = portalNormal(source.rotation);
    const destinationTangent = portalTangent(destination.rotation);
    const destinationNormal = portalNormal(destination.rotation);
    const entrySpeed = this.rider.getPortalTriggerVelocity(pair.physics.triggerBody).length();

    this.rider.teleportAroundPoint(triggerPoint, nextCenter, rotationDelta, (velocity) => {
      const localVelocity = new Vec2(
        velocity.dot(sourceTangent),
        velocity.dot(sourceNormal),
      );
      return this.mapPortalExitVelocity(
        velocity,
        localVelocity,
        destinationTangent,
        destinationNormal,
        pair,
      );
    });

    this.rider.setPortalCooldown(pair.id, pair.physics.cooldownFrames);
    this.onPortalTeleport?.({
      pairId: pair.id,
      source: sourceKey,
      destination: destinationKey,
      entryPosition: source.position.clone(),
      exitPosition: destination.position.clone(),
      speed: entrySpeed * pair.physics.speedMultiplier,
      theme: pair.visual.colorTheme,
    });
  }

  private resolveSafeExitPoint(destination: PortalEndpoint, candidate: Vec2): Vec2 {
    const outward = portalNormal(destination.rotation).scale(-1);
    const clearance = Math.max(4, destination.radius * 0.45);
    let resolved = candidate;
    for (let i = 0; i < 12; i++) {
      const nearbyLines = this.grid.queryPoint(resolved.x, resolved.y);
      const blocked = nearbyLines.some(line =>
        line.type !== LineType.SCENERY && line.distanceToPointSq(resolved) <= clearance * clearance,
      );
      if (!blocked) {
        return resolved;
      }
      resolved = resolved.add(outward.scale(Math.max(3, clearance * 0.8)));
    }
    return resolved;
  }

  private mapPortalExitVelocity(
    worldVelocity: Vec2,
    localVelocity: Vec2,
    destinationTangent: Vec2,
    destinationNormal: Vec2,
    pair: PortalPair,
  ): Vec2 {
    const scaledSpeed = worldVelocity.length() * pair.physics.speedMultiplier;
    if (pair.physics.exitDirection === 'forward' || pair.physics.exitDirection === 'backward') {
      const sign = pair.physics.exitDirection === 'forward' ? 1 : -1;
      return destinationTangent.scale(sign * scaledSpeed);
    }
    if (pair.physics.velocityMode === 'world') {
      return worldVelocity.scale(pair.physics.speedMultiplier);
    }
    return destinationTangent.scale(localVelocity.x)
      .add(destinationNormal.scale(localVelocity.y))
      .scale(pair.physics.speedMultiplier);
  }
}
