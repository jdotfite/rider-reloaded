import { Point } from './Point';

export class CollisionPoint extends Point {
  constructor(x: number, y: number, friction: number = 0) {
    super(x, y, friction);
  }
}
