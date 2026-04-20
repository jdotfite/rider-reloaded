import { Point } from '../points/Point';

export class SpringStick {
  p1: Point;
  p2: Point;
  restLength: number;
  stiffness: number;

  constructor(p1: Point, p2: Point, stiffness: number, lengthFactor: number = 1) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = p1.pos.distanceTo(p2.pos) * lengthFactor;
    this.stiffness = Math.max(0.05, Math.min(1, stiffness));
  }

  resolve() {
    const dx = this.p1.pos.x - this.p2.pos.x;
    const dy = this.p1.pos.y - this.p2.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const diff = (dist - this.restLength) / dist * 0.5 * this.stiffness;
    const ox = dx * diff;
    const oy = dy * diff;

    this.p1.pos.x -= ox;
    this.p1.pos.y -= oy;
    this.p2.pos.x += ox;
    this.p2.pos.y += oy;
  }
}
