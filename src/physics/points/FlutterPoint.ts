import { Point } from './Point';
import { GRAVITY } from '../../constants';

/**
 * Scarf point with air friction matching linerider-advanced.
 * LRA uses 0.9 friction multiplier on velocity (momentum *= 0.9).
 * Wave-based flutter is applied separately via Rider.flutterScarf().
 */
const SCARF_FRICTION = 0.9;

export class FlutterPoint extends Point {
  constructor(x: number, y: number) {
    super(x, y, 0);
  }

  step(gravityScale: number = 1) {
    const vx = (this.pos.x - this.prevPos.x) * SCARF_FRICTION;
    const vy = (this.pos.y - this.prevPos.y) * SCARF_FRICTION;
    const mx = vx + GRAVITY.x * gravityScale;
    const my = vy + GRAVITY.y * gravityScale;
    this.momentum.set(mx, my);
    this.prevPos.copyFrom(this.pos);
    this.pos.x += mx;
    this.pos.y += my;
  }
}
