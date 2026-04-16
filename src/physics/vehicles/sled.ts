import { VehicleDef } from './VehicleDef';
import {
  RIDER_POINTS, RIDER_CONSTRAINTS, RIDER_JOINTS,
  PEG, TAIL, NOSE, STRING, BUTT, SHOULDER, RHAND, LHAND, LFOOT, RFOOT,
} from '../rider-data';

/** The classic Line Rider sled — original physics, unchanged */
export const SLED_VEHICLE: VehicleDef = {
  id: 'sled',
  name: 'Classic Sled',
  points: RIDER_POINTS,
  constraints: RIDER_CONSTRAINTS,
  joints: RIDER_JOINTS,
  gravityScale: 1,
  velocityScale: 1,
  renderPoints: {
    peg: PEG, tail: TAIL, nose: NOSE, string: STRING,
    butt: BUTT, shoulder: SHOULDER,
    rhand: RHAND, lhand: LHAND, lfoot: LFOOT, rfoot: RFOOT,
  },
};
