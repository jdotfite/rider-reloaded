import { Vec2 } from '../../math/Vec2';
import { GRAVITY } from '../../constants';

export class Point {
  pos: Vec2;
  prevPos: Vec2;
  friction: number;
  /** Momentum from the last step — used for collision direction checks */
  momentum: Vec2 = new Vec2();

  constructor(x: number, y: number, friction: number = 0) {
    this.pos = new Vec2(x, y);
    this.prevPos = new Vec2(x, y);
    this.friction = friction;
  }

  get vel(): Vec2 {
    return this.pos.sub(this.prevPos);
  }

  step() {
    const vx = this.pos.x - this.prevPos.x;
    const vy = this.pos.y - this.prevPos.y;
    const mx = vx + GRAVITY.x;
    const my = vy + GRAVITY.y;
    this.momentum.set(mx, my);
    this.prevPos.copyFrom(this.pos);
    this.pos.x += mx;
    this.pos.y += my;
  }
}
