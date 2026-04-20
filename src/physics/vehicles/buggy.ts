import { VehicleDef } from './VehicleDef';
import { PointDef, ConstraintDef, JointDef } from '../rider-data';

const REAR_WHEEL = 0;
const FRONT_WHEEL = 1;
const REAR_CAGE = 2;
const FRONT_CAGE = 3;
const DRIVER_SEAT = 4;
const DRIVER_HEAD = 5;
const WHIP_START = 6;

const BUGGY_POINTS: PointDef[] = [
  { x: 0, y: 5.8, type: 'collision', friction: 0.0 },
  { x: 18, y: 5.8, type: 'collision', friction: 0.0 },
  { x: 2.2, y: -1.2, type: 'collision', friction: 0.55 },
  { x: 14.8, y: -3.2, type: 'collision', friction: 0.55 },
  { x: 8.4, y: -0.8, type: 'collision', friction: 0.65 },
  { x: 7.8, y: -7.1, type: 'collision', friction: 0.7 },
  { x: 0.8, y: -4.2, type: 'flutter', friction: 0 },
  { x: -1.2, y: -5.2, type: 'flutter', friction: 0 },
  { x: -3.4, y: -6.0, type: 'flutter', friction: 0 },
  { x: -5.8, y: -6.5, type: 'flutter', friction: 0 },
  { x: -8.2, y: -6.9, type: 'flutter', friction: 0 },
];

const BUGGY_CONSTRAINTS: ConstraintDef[] = [
  { type: 'stick', p1: REAR_WHEEL, p2: FRONT_WHEEL },
  { type: 'stick', p1: REAR_CAGE, p2: FRONT_CAGE },

  { type: 'spring', p1: REAR_WHEEL, p2: REAR_CAGE, stiffness: 0.42 },
  { type: 'spring', p1: FRONT_WHEEL, p2: FRONT_CAGE, stiffness: 0.42 },
  { type: 'spring', p1: REAR_WHEEL, p2: FRONT_CAGE, stiffness: 0.18 },
  { type: 'spring', p1: FRONT_WHEEL, p2: REAR_CAGE, stiffness: 0.18 },

  { type: 'bind_stick', p1: REAR_CAGE, p2: DRIVER_SEAT },
  { type: 'bind_stick', p1: FRONT_CAGE, p2: DRIVER_SEAT },
  { type: 'stick', p1: DRIVER_SEAT, p2: DRIVER_HEAD },
  { type: 'bind_stick', p1: REAR_CAGE, p2: DRIVER_HEAD },
  { type: 'bind_stick', p1: FRONT_CAGE, p2: DRIVER_HEAD },

  { type: 'repel', p1: DRIVER_HEAD, p2: REAR_WHEEL, lengthFactor: 0.55 },
  { type: 'repel', p1: DRIVER_HEAD, p2: FRONT_WHEEL, lengthFactor: 0.55 },

  { type: 'chain', p1: REAR_CAGE, p2: WHIP_START },
  { type: 'chain', p1: WHIP_START, p2: WHIP_START + 1 },
  { type: 'chain', p1: WHIP_START + 1, p2: WHIP_START + 2 },
  { type: 'chain', p1: WHIP_START + 2, p2: WHIP_START + 3 },
  { type: 'chain', p1: WHIP_START + 3, p2: WHIP_START + 4 },
];

const BUGGY_JOINTS: JointDef[] = [
  { p1: DRIVER_HEAD, p2: DRIVER_SEAT, q1: FRONT_CAGE, q2: REAR_CAGE, binding: 'RIDER_MOUNTED' },
  { p1: REAR_CAGE, p2: REAR_WHEEL, q1: FRONT_CAGE, q2: REAR_CAGE, binding: 'SLED_INTACT' },
  { p1: REAR_CAGE, p2: REAR_WHEEL, q1: FRONT_CAGE, q2: REAR_CAGE, binding: 'RIDER_MOUNTED' },
];

export const BUGGY_VEHICLE: VehicleDef = {
  id: 'buggy',
  name: 'Rally Buggy',
  points: BUGGY_POINTS,
  constraints: BUGGY_CONSTRAINTS,
  joints: BUGGY_JOINTS,
  gravityScale: 1.03,
  velocityScale: 1.08,
  renderPoints: {
    rearWheel: REAR_WHEEL,
    frontWheel: FRONT_WHEEL,
    rearCage: REAR_CAGE,
    frontCage: FRONT_CAGE,
    driverSeat: DRIVER_SEAT,
    driverHead: DRIVER_HEAD,
    whipStart: WHIP_START,
  },
};
