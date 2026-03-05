import { Point } from './Point';
import { GRAVITY } from '../../constants';

const AIR_FRICTION = 0.45;

export class FlutterPoint extends Point {
  constructor(x: number, y: number) {
    super(x, y, 0);
  }

  step() {
    const vx = (this.pos.x - this.prevPos.x) * (1 - AIR_FRICTION);
    const vy = (this.pos.y - this.prevPos.y) * (1 - AIR_FRICTION);
    const mx = vx + GRAVITY.x;
    const my = vy + GRAVITY.y;
    this.momentum.set(mx, my);
    this.prevPos.copyFrom(this.pos);

    // Gentle flutter: small random wobble proportional to speed
    const speed = Math.sqrt(mx * mx + my * my);
    const flutter = (Math.random() - 0.5) * speed * 3;

    this.pos.x += mx + flutter;
    this.pos.y += my;
  }
}
