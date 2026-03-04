import { Point } from '../points/Point';

/**
 * Fixed-distance constraint matching lr-core.
 * diff = ((len - rest) / len) * 0.5
 * delta = p1 - p2
 * p1 -= delta * diff, p2 += delta * diff
 */
export class Stick {
  p1: Point;
  p2: Point;
  restLength: number;

  constructor(p1: Point, p2: Point, restLength?: number) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = restLength ?? p1.pos.distanceTo(p2.pos);
  }

  resolve() {
    const dx = this.p1.pos.x - this.p2.pos.x;
    const dy = this.p1.pos.y - this.p2.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const diff = (dist - this.restLength) / dist * 0.5;
    const ox = dx * diff;
    const oy = dy * diff;

    this.p1.pos.x -= ox;
    this.p1.pos.y -= oy;
    this.p2.pos.x += ox;
    this.p2.pos.y += oy;
  }
}
