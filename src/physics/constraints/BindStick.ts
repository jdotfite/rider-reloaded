import { Point } from '../points/Point';
import { Binding } from '../points/Binding';

/**
 * Breakable distance constraint — matching lr-core/linerider-advanced.
 * Endurance = 0.057 * restLength * 0.5 (= 0.0285 * restLength).
 * Breaks only when stretching past endurance, where diff = ((len - rest) / len) * 0.5.
 */
export class BindStick {
  p1: Point;
  p2: Point;
  restLength: number;
  endurance: number;
  private binding: Binding;

  constructor(p1: Point, p2: Point, binding: Binding, restLength?: number) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = restLength ?? p1.pos.distanceTo(p2.pos);
    this.endurance = 0.057 * this.restLength * 0.5;
    this.binding = binding;
  }

  resolve(): boolean {
    if (!this.binding.riderMounted) return false;

    const dx = this.p1.pos.x - this.p2.pos.x;
    const dy = this.p1.pos.y - this.p2.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return false;

    const diff = (dist - this.restLength) / dist * 0.5;

    if (diff > this.endurance) {
      this.binding.dismount();
      return true;
    }

    const ox = dx * diff;
    const oy = dy * diff;
    this.p1.pos.x -= ox;
    this.p1.pos.y -= oy;
    this.p2.pos.x += ox;
    this.p2.pos.y += oy;
    return false;
  }
}
