import { Point } from '../points/Point';

/** Minimum-distance constraint — only pushes apart, never pulls together */
export class RepelStick {
  p1: Point;
  p2: Point;
  restLength: number;

  constructor(p1: Point, p2: Point, lengthFactor: number = 1) {
    this.p1 = p1;
    this.p2 = p2;
    // Rest length is the natural distance multiplied by lengthFactor
    this.restLength = p1.pos.distanceTo(p2.pos) * lengthFactor;
  }

  resolve() {
    const dx = this.p1.pos.x - this.p2.pos.x;
    const dy = this.p1.pos.y - this.p2.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= this.restLength || dist === 0) return;

    const diff = (dist - this.restLength) / dist * 0.5;
    const ox = dx * diff;
    const oy = dy * diff;

    this.p1.pos.x -= ox;
    this.p1.pos.y -= oy;
    this.p2.pos.x += ox;
    this.p2.pos.y += oy;
  }
}
