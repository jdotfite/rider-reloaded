import { Vec2 } from '../../math/Vec2';
import { Line } from './Line';
import { LineOptions } from './Line';
import { LineType } from './LineTypes';
import { ACC_LINE_BOOST } from '../../constants';

export class AccLine extends Line {
  readonly friction: number = 0.1;
  readonly multiplier: number;
  readonly accMultiplier: number;

  constructor(p1: Vec2, p2: Vec2, options: LineOptions = {}) {
    super(p1, p2, LineType.ACC, options);
    this.multiplier = options.multiplier ?? 1;
    this.accMultiplier = ACC_LINE_BOOST * this.multiplier;
  }
}
