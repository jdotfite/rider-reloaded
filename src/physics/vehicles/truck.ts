import { VehicleDef } from './VehicleDef';
import { PointDef, ConstraintDef, JointDef } from '../rider-data';

/**
 * Monster truck — wider stance, two wheels, slightly heavier.
 *
 * Point layout (indices):
 *   0: CHASSIS_FL  (front-left / top-left of cab)
 *   1: CHASSIS_BL  (back-left / top-right of cab — rear)
 *   2: CHASSIS_BR  (back-right / bottom-right — rear low)
 *   3: CHASSIS_FR  (front-right / bottom-left — front low)
 *   4: WHEEL_FRONT (front wheel contact)
 *   5: WHEEL_REAR  (rear wheel contact)
 *   6: DRIVER_SEAT (driver body position)
 *   7: DRIVER_HEAD (driver head/shoulder)
 *   8-14: SCARF/EXHAUST flutter points
 */

const CHASSIS_FL = 0;
const CHASSIS_BL = 1;
const CHASSIS_BR = 2;
const CHASSIS_FR = 3;
const WHEEL_FRONT = 4;
const WHEEL_REAR = 5;
const DRIVER_SEAT = 6;
const DRIVER_HEAD = 7;
const EXHAUST_START = 8;

const TRUCK_POINTS: PointDef[] = [
  // Chassis corners (forms a box)
  { x: -2,   y: -3,  type: 'collision', friction: 0.4 },   // 0: CHASSIS_FL (front top)
  { x: 18,   y: -3,  type: 'collision', friction: 0.4 },   // 1: CHASSIS_BL (rear top)
  { x: 18,   y: 2,   type: 'collision', friction: 0.4 },   // 2: CHASSIS_BR (rear bottom)
  { x: -2,   y: 2,   type: 'collision', friction: 0.4 },   // 3: CHASSIS_FR (front bottom)

  // Wheels — high friction, main contact
  { x: 1,    y: 6,   type: 'collision', friction: 0.9 },   // 4: WHEEL_FRONT
  { x: 15,   y: 6,   type: 'collision', friction: 0.9 },   // 5: WHEEL_REAR

  // Driver (simpler than sled rider — just seat + head)
  { x: 8,    y: -2,  type: 'collision', friction: 0.8 },   // 6: DRIVER_SEAT
  { x: 8,    y: -8,  type: 'collision', friction: 0.5 },   // 7: DRIVER_HEAD

  // Exhaust flutter points (trail behind)
  { x: 19,   y: -2,  type: 'flutter', friction: 0 },       // 8
  { x: 21,   y: -2,  type: 'flutter', friction: 0 },       // 9
  { x: 23,   y: -2,  type: 'flutter', friction: 0 },       // 10
  { x: 25,   y: -2,  type: 'flutter', friction: 0 },       // 11
  { x: 27,   y: -2,  type: 'flutter', friction: 0 },       // 12
  { x: 29,   y: -2,  type: 'flutter', friction: 0 },       // 13
  { x: 31,   y: -2,  type: 'flutter', friction: 0 },       // 14
];

const TRUCK_CONSTRAINTS: ConstraintDef[] = [
  // Chassis frame — rigid box with diagonals
  { type: 'stick', p1: CHASSIS_FL, p2: CHASSIS_BL },         // top edge
  { type: 'stick', p1: CHASSIS_BL, p2: CHASSIS_BR },         // right edge
  { type: 'stick', p1: CHASSIS_BR, p2: CHASSIS_FR },         // bottom edge
  { type: 'stick', p1: CHASSIS_FR, p2: CHASSIS_FL },         // left edge
  { type: 'stick', p1: CHASSIS_FL, p2: CHASSIS_BR },         // diagonal
  { type: 'stick', p1: CHASSIS_BL, p2: CHASSIS_FR },         // diagonal

  // Wheel-to-chassis (suspension) — breakable on hard impact
  { type: 'bind_stick', p1: CHASSIS_FR, p2: WHEEL_FRONT },   // front suspension left
  { type: 'bind_stick', p1: CHASSIS_FL, p2: WHEEL_FRONT },   // front suspension right
  { type: 'bind_stick', p1: CHASSIS_BR, p2: WHEEL_REAR },    // rear suspension left
  { type: 'bind_stick', p1: CHASSIS_BL, p2: WHEEL_REAR },    // rear suspension right

  // Cross braces wheel-to-wheel through chassis (stability)
  { type: 'stick', p1: WHEEL_FRONT, p2: WHEEL_REAR },

  // Driver skeleton
  { type: 'stick', p1: DRIVER_SEAT, p2: DRIVER_HEAD },

  // Driver-to-chassis (breakable — driver ejects on crash)
  { type: 'bind_stick', p1: CHASSIS_FL, p2: DRIVER_SEAT },
  { type: 'bind_stick', p1: CHASSIS_BL, p2: DRIVER_SEAT },
  { type: 'bind_stick', p1: CHASSIS_FR, p2: DRIVER_SEAT },

  // Driver head repel from chassis (keeps head upright)
  { type: 'repel', p1: DRIVER_HEAD, p2: CHASSIS_FR, lengthFactor: 0.5 },
  { type: 'repel', p1: DRIVER_HEAD, p2: CHASSIS_BR, lengthFactor: 0.5 },

  // Exhaust chains (trail from rear top)
  { type: 'chain', p1: CHASSIS_BL, p2: EXHAUST_START },
  { type: 'chain', p1: EXHAUST_START, p2: EXHAUST_START + 1 },
  { type: 'chain', p1: EXHAUST_START + 1, p2: EXHAUST_START + 2 },
  { type: 'chain', p1: EXHAUST_START + 2, p2: EXHAUST_START + 3 },
  { type: 'chain', p1: EXHAUST_START + 3, p2: EXHAUST_START + 4 },
  { type: 'chain', p1: EXHAUST_START + 4, p2: EXHAUST_START + 5 },
  { type: 'chain', p1: EXHAUST_START + 5, p2: EXHAUST_START + 6 },
];

const TRUCK_JOINTS: JointDef[] = [
  // Driver inverted relative to chassis → eject
  { p1: DRIVER_HEAD, p2: DRIVER_SEAT, q1: CHASSIS_FL, q2: CHASSIS_FR, binding: 'RIDER_MOUNTED' },
  // Chassis flipped → break sled (chassis) integrity
  { p1: CHASSIS_FL, p2: CHASSIS_FR, q1: CHASSIS_BL, q2: CHASSIS_FL, binding: 'SLED_INTACT' },
  // Chassis flipped → also dismount driver
  { p1: CHASSIS_FL, p2: CHASSIS_FR, q1: CHASSIS_BL, q2: CHASSIS_FL, binding: 'RIDER_MOUNTED' },
];

export const TRUCK_VEHICLE: VehicleDef = {
  id: 'truck',
  name: 'Monster Truck',
  points: TRUCK_POINTS,
  constraints: TRUCK_CONSTRAINTS,
  joints: TRUCK_JOINTS,
  gravityScale: 1.15,      // slightly heavier
  velocityScale: 0.85,     // slightly slower start
  renderPoints: {
    chassisFL: CHASSIS_FL,
    chassisBL: CHASSIS_BL,
    chassisBR: CHASSIS_BR,
    chassisFR: CHASSIS_FR,
    wheelFront: WHEEL_FRONT,
    wheelRear: WHEEL_REAR,
    driverSeat: DRIVER_SEAT,
    driverHead: DRIVER_HEAD,
    exhaustStart: EXHAUST_START,
  },
};
