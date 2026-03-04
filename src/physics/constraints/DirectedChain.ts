import { Point } from '../points/Point';

/** One-way chain — only moves the second point, used for scarf */
export class DirectedChain {
  p1: Point;
  p2: Point;
  restLength: number;

  constructor(p1: Point, p2: Point, restLength?: number) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = restLength ?? p1.pos.distanceTo(p2.pos);
  }

  resolve() {
    const dx = this.p2.pos.x - this.p1.pos.x;
    const dy = this.p2.pos.y - this.p1.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0 || dist <= this.restLength) return;

    const diff = (dist - this.restLength) / dist;
    this.p2.pos.x -= dx * diff;
    this.p2.pos.y -= dy * diff;
  }
}
