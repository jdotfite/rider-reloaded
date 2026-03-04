import { Vec2 } from '../../math/Vec2';
import { Line } from './Line';
import { LineOptions } from './Line';
import { LineType } from './LineTypes';

export class SceneryLine extends Line {
  constructor(p1: Vec2, p2: Vec2, options: LineOptions = {}) {
    super(p1, p2, LineType.SCENERY, options);
  }
}
