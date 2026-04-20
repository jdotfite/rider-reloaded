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

export interface RiderSnapshot {
  positions: Array<{ px: number; py: number; ppx: number; ppy: number }>;
  riderMounted: boolean;
  sledIntact: boolean;
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
        this.chains.push(new DirectedChain(p[def.p1], p[def.p2]));
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

  getCenterSpeed(): number {
    const v1 = this.points[this.centerIdx1].vel;
    const v2 = this.points[this.centerIdx2].vel;
    const averageX = (v1.x + v2.x) / 2;
    const averageY = (v1.y + v2.y) / 2;
    return Math.sqrt(averageX * averageX + averageY * averageY);
  }
}
