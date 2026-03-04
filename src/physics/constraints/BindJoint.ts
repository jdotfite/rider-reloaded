import { Point } from '../points/Point';
import { Binding } from '../points/Binding';

/**
 * 4-point cross-product joint — detects structural inversion.
 * Checks cross(p2-p1, q2-q1) >= 0. If < 0, breaks binding.
 * Matching lr-core BindJoint.
 */
export class BindJoint {
  p1: Point;
  p2: Point;
  q1: Point;
  q2: Point;
  private binding: Binding;
  private bindingType: 'RIDER_MOUNTED' | 'SLED_INTACT';

  constructor(
    p1: Point, p2: Point, q1: Point, q2: Point,
    binding: Binding, bindingType: 'RIDER_MOUNTED' | 'SLED_INTACT'
  ) {
    this.p1 = p1;
    this.p2 = p2;
    this.q1 = q1;
    this.q2 = q2;
    this.binding = binding;
    this.bindingType = bindingType;
  }

  resolve(): boolean {
    if (this.bindingType === 'RIDER_MOUNTED' && !this.binding.riderMounted) return false;
    if (this.bindingType === 'SLED_INTACT' && !this.binding.sledIntact) return false;

    const ax = this.p2.pos.x - this.p1.pos.x;
    const ay = this.p2.pos.y - this.p1.pos.y;
    const bx = this.q2.pos.x - this.q1.pos.x;
    const by = this.q2.pos.y - this.q1.pos.y;

    const cross = ax * by - ay * bx;
    if (cross < 0) {
      if (this.bindingType === 'SLED_INTACT') {
        this.binding.breakSled();
      } else {
        this.binding.dismount();
      }
      return true;
    }
    return false;
  }
}
