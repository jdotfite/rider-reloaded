import { Vec2 } from '../math/Vec2';
import { Point } from './points/Point';
import { CollisionPoint } from './points/CollisionPoint';
import { FlutterPoint } from './points/FlutterPoint';
import { Binding } from './points/Binding';
import { Stick } from './constraints/Stick';
import { RepelStick } from './constraints/RepelStick';
import { BindStick } from './constraints/BindStick';
import { BindJoint } from './constraints/BindJoint';
import { DirectedChain } from './constraints/DirectedChain';
import { SpringStick } from './constraints/SpringStick';
import {
  RIDER_POINTS, RIDER_CONSTRAINTS, RIDER_JOINTS,
  ConstraintDef, SHOULDER, BUTT,
} from './rider-data';
import { INITIAL_RIDER_VELOCITY } from '../constants';
import { RiderRenderData } from '../rendering/RiderRenderer';
import { VehicleDef } from './vehicles/VehicleDef';
import { rotateVec } from '../portal/portalMath';
import type { PortalTriggerBody } from '../store/PortalTypes';

export interface RiderSnapshot {
  positions: Array<{ px: number; py: number; ppx: number; ppy: number }>;
  riderMounted: boolean;
  sledIntact: boolean;
  portalCooldowns?: Array<{ pairId: number; frames: number }>;
}

export class Rider {
  points: Point[] = [];
  collisionPoints: CollisionPoint[] = [];
  iteratingConstraints: Array<Stick | BindStick | SpringStick> = [];
  repelSticks: RepelStick[] = [];
  bindJoints: BindJoint[] = [];
  chains: DirectedChain[] = [];
  binding: Binding = new Binding();

  gravityScale = 1;
  private velocityScale = 1;
  private startPos: Vec2;
  private vehicle: VehicleDef | null = null;
  private portalCooldowns: Map<number, number> = new Map();
  private portalTriggerIndices: number[] = [0, 1, 2, 3];

  /** Indices used for camera center — default to BUTT/SHOULDER */
  private centerIdx1 = BUTT;
  private centerIdx2 = SHOULDER;

  constructor(startPos: Vec2) {
    this.startPos = startPos.clone();
    this.init();
  }

  setVehicle(vehicle: VehicleDef) {
    this.vehicle = vehicle;
    this.gravityScale = vehicle.gravityScale;
    this.velocityScale = vehicle.velocityScale;
    // Determine center indices from vehicle render points
    if (vehicle.renderPoints.driverSeat !== undefined && vehicle.renderPoints.driverHead !== undefined) {
      this.centerIdx1 = vehicle.renderPoints.driverSeat;
      this.centerIdx2 = vehicle.renderPoints.driverHead;
    } else {
      this.centerIdx1 = vehicle.renderPoints.butt ?? BUTT;
      this.centerIdx2 = vehicle.renderPoints.shoulder ?? SHOULDER;
    }
    this.portalTriggerIndices = this.resolvePortalTriggerIndices(vehicle);
    this.reset();
  }

  init() {
    this.points = [];
    this.collisionPoints = [];
    this.iteratingConstraints = [];
    this.repelSticks = [];
    this.bindJoints = [];
    this.chains = [];
    this.binding.reset();
    this.portalCooldowns.clear();

    const pointDefs = this.vehicle?.points ?? RIDER_POINTS;
    const constraintDefs = this.vehicle?.constraints ?? RIDER_CONSTRAINTS;
    const jointDefs = this.vehicle?.joints ?? RIDER_JOINTS;
    const velScale = this.vehicle?.velocityScale ?? 1;

    // Create points
    for (const def of pointDefs) {
      const x = this.startPos.x + def.x;
      const y = this.startPos.y + def.y;

      let point: Point;
      if (def.type === 'collision') {
        point = new CollisionPoint(x, y, def.friction);
        this.collisionPoints.push(point as CollisionPoint);
      } else {
        point = new FlutterPoint(x, y);
      }

      // Set initial velocity via prevPos offset, scaled by vehicle
      point.prevPos.x = point.pos.x - INITIAL_RIDER_VELOCITY.x * velScale;
      point.prevPos.y = point.pos.y - INITIAL_RIDER_VELOCITY.y * velScale;

      this.points.push(point);
    }

    // Create bone constraints
    for (const def of constraintDefs) {
      this.createConstraint(def);
    }

    // Create bind joints (checked after iterations, not during)
    for (const jdef of jointDefs) {
      this.bindJoints.push(new BindJoint(
        this.points[jdef.p1], this.points[jdef.p2],
        this.points[jdef.q1], this.points[jdef.q2],
        this.binding, jdef.binding
      ));
    }
  }

  private createConstraint(def: ConstraintDef) {
    const p = this.points;
    switch (def.type) {
      case 'stick':
        this.iteratingConstraints.push(new Stick(p[def.p1], p[def.p2]));
        break;
      case 'repel':
        this.repelSticks.push(new RepelStick(p[def.p1], p[def.p2], def.lengthFactor));
        break;
      case 'bind_stick':
        this.iteratingConstraints.push(new BindStick(p[def.p1], p[def.p2], this.binding));
        break;
      case 'spring':
        this.iteratingConstraints.push(
          new SpringStick(p[def.p1], p[def.p2], def.stiffness, def.lengthFactor ?? 1),
        );
        break;
      case 'chain':
        this.chains.push(new DirectedChain(p[def.p1], p[def.p2], def.restLength));
        break;
    }
  }

  reset() {
    this.init();
  }

  setStartPosition(startPos: Vec2) {
    this.startPos = startPos.clone();
    this.reset();
  }

  /** Save a lightweight snapshot of all point positions + binding state */
  saveSnapshot(): RiderSnapshot {
    return {
      positions: this.points.map(p => ({
        px: p.pos.x, py: p.pos.y,
        ppx: p.prevPos.x, ppy: p.prevPos.y,
      })),
      riderMounted: this.binding.riderMounted,
      sledIntact: this.binding.sledIntact,
      portalCooldowns: [...this.portalCooldowns.entries()].map(([pairId, frames]) => ({ pairId, frames })),
    };
  }

  /** Restore from a snapshot */
  restoreSnapshot(snap: RiderSnapshot) {
    for (let i = 0; i < snap.positions.length && i < this.points.length; i++) {
      const s = snap.positions[i];
      this.points[i].pos.x = s.px;
      this.points[i].pos.y = s.py;
      this.points[i].prevPos.x = s.ppx;
      this.points[i].prevPos.y = s.ppy;
    }
    this.binding.riderMounted = snap.riderMounted;
    this.binding.sledIntact = snap.sledIntact;
    this.portalCooldowns.clear();
    for (const cooldown of snap.portalCooldowns ?? []) {
      if (cooldown && cooldown.frames > 0) {
        this.portalCooldowns.set(cooldown.pairId, cooldown.frames);
      }
    }
  }

  getRenderData(alpha: number = 1): RiderRenderData {
    const t = Math.max(0, Math.min(1, alpha));
    return {
      points: this.points.map(p => ({
        x: p.prevPos.x + (p.pos.x - p.prevPos.x) * t,
        y: p.prevPos.y + (p.pos.y - p.prevPos.y) * t,
      })),
      mounted: this.binding.riderMounted,
      sledIntact: this.binding.sledIntact,
    };
  }

  /** Approximate center of the rider body (for camera tracking) */
  getCenter(alpha: number = 1): Vec2 {
    const t = Math.max(0, Math.min(1, alpha));
    const p1 = this.points[this.centerIdx1];
    const p2 = this.points[this.centerIdx2];
    const x1 = p1.prevPos.x + (p1.pos.x - p1.prevPos.x) * t;
    const y1 = p1.prevPos.y + (p1.pos.y - p1.prevPos.y) * t;
    const x2 = p2.prevPos.x + (p2.pos.x - p2.prevPos.x) * t;
    const y2 = p2.prevPos.y + (p2.pos.y - p2.prevPos.y) * t;
    return new Vec2((x1 + x2) / 2, (y1 + y2) / 2);
  }

  static renderDataFromSnapshot(snap: RiderSnapshot): RiderRenderData {
    return {
      points: snap.positions.map(p => ({ x: p.px, y: p.py })),
      mounted: snap.riderMounted,
      sledIntact: snap.sledIntact,
    };
  }

  getCenterVelocity(): Vec2 {
    const v1 = this.points[this.centerIdx1].vel;
    const v2 = this.points[this.centerIdx2].vel;
    return new Vec2((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
  }

  getCenterSpeed(): number {
    const v = this.getCenterVelocity();
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  getPortalTriggerPoint(body: PortalTriggerBody = 'auto', alpha: number = 1): Vec2 {
    const indices = this.getPortalTriggerIndices(body);
    const t = Math.max(0, Math.min(1, alpha));
    let x = 0;
    let y = 0;
    let count = 0;
    for (const index of indices) {
      const point = this.points[index];
      if (!point) continue;
      x += point.prevPos.x + (point.pos.x - point.prevPos.x) * t;
      y += point.prevPos.y + (point.pos.y - point.prevPos.y) * t;
      count++;
    }
    if (count === 0) return this.getCenter(alpha);
    return new Vec2(x / count, y / count);
  }

  getPortalTriggerVelocity(body: PortalTriggerBody = 'auto'): Vec2 {
    const indices = this.getPortalTriggerIndices(body);
    let x = 0;
    let y = 0;
    let count = 0;
    for (const index of indices) {
      const point = this.points[index];
      if (!point) continue;
      const velocity = point.vel;
      x += velocity.x;
      y += velocity.y;
      count++;
    }
    if (count === 0) {
      return this.getCenter(1).sub(this.getCenter(0));
    }
    return new Vec2(x / count, y / count);
  }

  /**
   * LRA-style wave flutter for scarf points.
   * Computes angle between consecutive scarf points, adds a sine-wave
   * perturbation scaled by rider momentum, creating a coherent wave pattern.
   * Called after chains resolve in the physics step.
   */
  private scarfFlutterFrame = 0;

  flutterScarf() {
    // No chains = no scarf (e.g. roller coaster has no flutter points)
    if (this.chains.length === 0) return;

    // Scarf points start after the 10 body points
    const scarfStart = 10;
    const scarfCount = this.points.length - scarfStart;
    if (scarfCount < 2) return;

    // Get rider momentum magnitude for flutter intensity
    const shoulder = this.points[SHOULDER];
    const momentum = Math.sqrt(
      (shoulder.pos.x - shoulder.prevPos.x) ** 2 +
      (shoulder.pos.y - shoulder.prevPos.y) ** 2,
    );

    // Progress rate scales with momentum (LRA behavior)
    this.scarfFlutterFrame += Math.max(1, momentum * 2);

    for (let i = scarfStart + 1; i < this.points.length; i++) {
      const prev = this.points[i - 1];
      const curr = this.points[i];

      // Angle between consecutive scarf points
      const dx = curr.pos.x - prev.pos.x;
      const dy = curr.pos.y - prev.pos.y;
      const angle = Math.atan2(dy, dx);

      // LRA WaveFlutter: rotate by cos(angle) * 90 degrees, scale by sine wave
      const scarfIndex = i - scarfStart;
      const wavePhase = this.scarfFlutterFrame * 0.1 + scarfIndex * 1.5;
      const waveAmount = Math.sin(wavePhase) * 2;

      // Apply perpendicular flutter (rotated 90 degrees from segment direction)
      const perpX = -Math.sin(angle) * waveAmount;
      const perpY = Math.cos(angle) * waveAmount;

      // Scale by momentum — no flutter when stationary
      const scale = Math.min(1, momentum * 0.8);
      curr.pos.x += perpX * scale;
      curr.pos.y += perpY * scale;
    }
  }

  tickTransientState() {
    if (this.portalCooldowns.size === 0) return;
    for (const [pairId, frames] of this.portalCooldowns) {
      if (frames <= 1) {
        this.portalCooldowns.delete(pairId);
      } else {
        this.portalCooldowns.set(pairId, frames - 1);
      }
    }
  }

  isPortalBlocked(pairId: number): boolean {
    return (this.portalCooldowns.get(pairId) ?? 0) > 0;
  }

  setPortalCooldown(pairId: number, frames: number) {
    if (frames <= 0) {
      this.portalCooldowns.delete(pairId);
      return;
    }
    this.portalCooldowns.set(pairId, Math.max(0, Math.floor(frames)));
  }

  private getPortalTriggerIndices(body: PortalTriggerBody): number[] {
    if (body === 'front') {
      return this.resolveNamedRenderPointIndices(
        ['nose', 'string', 'peg', 'chassisFront', 'wheelFront', 'frontWheel', 'frontCage'],
        this.getCollisionPointIndices().slice(0, 2),
      );
    }
    if (body === 'rear') {
      return this.resolveNamedRenderPointIndices(
        ['tail', 'rearCage', 'chassisRear', 'wheelRear', 'rearWheel', 'butt'],
        this.getCollisionPointIndices().slice(-2),
      );
    }
    if (body === 'center') {
      return this.resolveNamedRenderPointIndices(
        ['driverSeat', 'driverHead', 'butt', 'shoulder', 'chassisFront', 'chassisRear'],
        [this.centerIdx1, this.centerIdx2],
      );
    }
    return this.portalTriggerIndices.length > 0
      ? this.portalTriggerIndices
      : [this.centerIdx1, this.centerIdx2];
  }

  teleportAroundPoint(
    currentAnchor: Vec2,
    nextAnchor: Vec2,
    rotationDelta: number,
    mapVelocity: (velocity: Vec2) => Vec2,
  ) {
    for (const point of this.points) {
      const relPos = point.pos.sub(currentAnchor);
      const nextPos = nextAnchor.add(rotateVec(relPos, rotationDelta));
      const velocity = point.pos.sub(point.prevPos);
      const nextVelocity = mapVelocity(velocity);
      point.pos.copyFrom(nextPos);
      point.prevPos.copyFrom(nextPos.sub(nextVelocity));
      point.momentum.copyFrom(nextVelocity);
    }
  }

  private resolvePortalTriggerIndices(vehicle: VehicleDef): number[] {
    const candidates = [
      vehicle.renderPoints.peg,
      vehicle.renderPoints.tail,
      vehicle.renderPoints.nose,
      vehicle.renderPoints.string,
      vehicle.renderPoints.chassisFront,
      vehicle.renderPoints.wheelFront,
      vehicle.renderPoints.wheelRear,
      vehicle.renderPoints.chassisRear,
      vehicle.renderPoints.rearWheel,
      vehicle.renderPoints.frontWheel,
      vehicle.renderPoints.rearCage,
      vehicle.renderPoints.frontCage,
    ].filter((value): value is number => typeof value === 'number');

    const unique = [...new Set(candidates)];
    if (unique.length >= 2) return unique.slice(0, 4);

    return this.collisionPoints
      .slice(0, 4)
      .map(point => this.points.indexOf(point))
      .filter(index => index >= 0);
  }

  private resolveNamedRenderPointIndices(names: string[], fallback: number[]): number[] {
    const renderPoints = this.vehicle?.renderPoints ?? {};
    const resolved = [...new Set(
      names
        .map(name => renderPoints[name])
        .filter((value): value is number => typeof value === 'number' && value >= 0 && value < this.points.length),
    )];
    if (resolved.length > 0) return resolved.slice(0, 4);
    return fallback.filter(index => index >= 0 && index < this.points.length);
  }

  private getCollisionPointIndices(): number[] {
    return this.collisionPoints
      .map(point => this.points.indexOf(point))
      .filter(index => index >= 0);
  }
}
