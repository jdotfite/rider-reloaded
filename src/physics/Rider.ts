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
import {
  RIDER_POINTS, RIDER_CONSTRAINTS, RIDER_JOINTS,
  ConstraintDef, SHOULDER, BUTT,
} from './rider-data';
import { INITIAL_RIDER_VELOCITY } from '../constants';
import { RiderRenderData } from '../rendering/RiderRenderer';

export interface RiderSnapshot {
  positions: Array<{ px: number; py: number; ppx: number; ppy: number }>;
  riderMounted: boolean;
  sledIntact: boolean;
}

export class Rider {
  points: Point[] = [];
  collisionPoints: CollisionPoint[] = [];
  sticks: Stick[] = [];
  repelSticks: RepelStick[] = [];
  bindSticks: BindStick[] = [];
  bindJoints: BindJoint[] = [];
  chains: DirectedChain[] = [];
  binding: Binding = new Binding();

  private startPos: Vec2;

  constructor(startPos: Vec2) {
    this.startPos = startPos.clone();
    this.init();
  }

  init() {
    this.points = [];
    this.collisionPoints = [];
    this.sticks = [];
    this.repelSticks = [];
    this.bindSticks = [];
    this.bindJoints = [];
    this.chains = [];
    this.binding.reset();

    // Create points
    for (const def of RIDER_POINTS) {
      const x = this.startPos.x + def.x;
      const y = this.startPos.y + def.y;

      let point: Point;
      if (def.type === 'collision') {
        point = new CollisionPoint(x, y, def.friction);
        this.collisionPoints.push(point as CollisionPoint);
      } else {
        point = new FlutterPoint(x, y);
      }

      // Set initial velocity via prevPos offset
      point.prevPos.x = point.pos.x - INITIAL_RIDER_VELOCITY.x;
      point.prevPos.y = point.pos.y - INITIAL_RIDER_VELOCITY.y;

      this.points.push(point);
    }

    // Create bone constraints
    for (const def of RIDER_CONSTRAINTS) {
      this.createConstraint(def);
    }

    // Create bind joints (checked after iterations, not during)
    for (const jdef of RIDER_JOINTS) {
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
        this.sticks.push(new Stick(p[def.p1], p[def.p2]));
        break;
      case 'repel':
        this.repelSticks.push(new RepelStick(p[def.p1], p[def.p2], def.lengthFactor));
        break;
      case 'bind_stick':
        this.bindSticks.push(new BindStick(p[def.p1], p[def.p2], this.binding));
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
    const butt = this.points[BUTT];
    const shoulder = this.points[SHOULDER];
    const buttX = butt.prevPos.x + (butt.pos.x - butt.prevPos.x) * t;
    const buttY = butt.prevPos.y + (butt.pos.y - butt.prevPos.y) * t;
    const shoulderX = shoulder.prevPos.x + (shoulder.pos.x - shoulder.prevPos.x) * t;
    const shoulderY = shoulder.prevPos.y + (shoulder.pos.y - shoulder.prevPos.y) * t;
    return new Vec2(
      (buttX + shoulderX) / 2,
      (buttY + shoulderY) / 2
    );
  }

  static renderDataFromSnapshot(snap: RiderSnapshot): RiderRenderData {
    return {
      points: snap.positions.map(p => ({ x: p.px, y: p.py })),
      mounted: snap.riderMounted,
      sledIntact: snap.sledIntact,
    };
  }

  getCenterSpeed(): number {
    const buttVelocity = this.points[BUTT].vel;
    const shoulderVelocity = this.points[SHOULDER].vel;
    const averageX = (buttVelocity.x + shoulderVelocity.x) / 2;
    const averageY = (buttVelocity.y + shoulderVelocity.y) / 2;
    return Math.sqrt(averageX * averageX + averageY * averageY);
  }
}
