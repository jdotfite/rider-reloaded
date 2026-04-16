import { VehicleDef } from './VehicleDef';
import { PointDef, ConstraintDef, JointDef } from '../rider-data';

/**
 * Monster truck — rigid chassis+wheels frame, breakable driver.
 *
 * The truck is modeled like the sled: a single rigid frame of points
 * connected by sticks. Only the driver-to-chassis bonds break.
 *
 * Point layout:
 *   0: WHEEL_FRONT   — front wheel (main contact, high friction)
 *   1: WHEEL_REAR    — rear wheel (main contact, high friction)
 *   2: CHASSIS_FRONT  — front-top of cab (above front wheel)
 *   3: CHASSIS_REAR   — rear-top of cab (above rear wheel)
 *   4: DRIVER_SEAT   — driver body seat
 *   5: DRIVER_HEAD   — driver head
 *   6-12: EXHAUST flutter points
 *
 * The frame is: WHEEL_FRONT, WHEEL_REAR, CHASSIS_FRONT, CHASSIS_REAR
 * forming a trapezoid with full diagonal bracing (6 sticks).
 */

const WHEEL_FRONT = 0;
const WHEEL_REAR = 1;
const CHASSIS_FRONT = 2;
const CHASSIS_REAR = 3;
const DRIVER_SEAT = 4;
const DRIVER_HEAD = 5;
const EXHAUST_START = 6;

const TRUCK_POINTS: PointDef[] = [
  // Wheels — main ground contact, high friction
  { x: 0,    y: 5,   type: 'collision', friction: 0.8 },    // 0: WHEEL_FRONT
  { x: 15,   y: 5,   type: 'collision', friction: 0.8 },    // 1: WHEEL_REAR

  // Chassis top corners (cab roof line)
  { x: 0,    y: -4,  type: 'collision', friction: 0.0 },    // 2: CHASSIS_FRONT
  { x: 17.5, y: -4,  type: 'collision', friction: 0.0 },    // 3: CHASSIS_REAR

  // Driver
  { x: 5,    y: -3,  type: 'collision', friction: 0.8 },    // 4: DRIVER_SEAT
  { x: 5,    y: -9,  type: 'collision', friction: 0.1 },    // 5: DRIVER_HEAD

  // Exhaust flutter points
  { x: 18,   y: -4,  type: 'flutter', friction: 0 },
  { x: 20,   y: -4,  type: 'flutter', friction: 0 },
  { x: 22,   y: -4,  type: 'flutter', friction: 0 },
  { x: 24,   y: -4,  type: 'flutter', friction: 0 },
  { x: 26,   y: -4,  type: 'flutter', friction: 0 },
  { x: 28,   y: -4,  type: 'flutter', friction: 0 },
  { x: 30,   y: -4,  type: 'flutter', friction: 0 },
];

const TRUCK_CONSTRAINTS: ConstraintDef[] = [
  // Rigid frame — same pattern as sled (4 edges + 2 diagonals = 6 sticks)
  { type: 'stick', p1: WHEEL_FRONT, p2: WHEEL_REAR },          // bottom (axle line)
  { type: 'stick', p1: WHEEL_REAR, p2: CHASSIS_REAR },          // rear upright
  { type: 'stick', p1: CHASSIS_REAR, p2: CHASSIS_FRONT },       // top (roof line)
  { type: 'stick', p1: CHASSIS_FRONT, p2: WHEEL_FRONT },        // front upright
  { type: 'stick', p1: WHEEL_FRONT, p2: CHASSIS_REAR },         // diagonal
  { type: 'stick', p1: CHASSIS_FRONT, p2: WHEEL_REAR },         // diagonal

  // Driver-to-chassis (breakable — driver ejects on crash)
  { type: 'bind_stick', p1: CHASSIS_FRONT, p2: DRIVER_SEAT },
  { type: 'bind_stick', p1: WHEEL_FRONT, p2: DRIVER_SEAT },
  { type: 'bind_stick', p1: WHEEL_REAR, p2: DRIVER_SEAT },

  // Driver skeleton
  { type: 'stick', p1: DRIVER_SEAT, p2: DRIVER_HEAD },

  // Driver body constraints (keep head from going through chassis)
  { type: 'bind_stick', p1: DRIVER_HEAD, p2: CHASSIS_FRONT },
  { type: 'bind_stick', p1: DRIVER_HEAD, p2: CHASSIS_REAR },

  // Repel sticks to keep driver head upright
  { type: 'repel', p1: DRIVER_HEAD, p2: WHEEL_FRONT, lengthFactor: 0.5 },
  { type: 'repel', p1: DRIVER_HEAD, p2: WHEEL_REAR, lengthFactor: 0.5 },

  // Exhaust chains
  { type: 'chain', p1: CHASSIS_REAR, p2: EXHAUST_START },
  { type: 'chain', p1: EXHAUST_START, p2: EXHAUST_START + 1 },
  { type: 'chain', p1: EXHAUST_START + 1, p2: EXHAUST_START + 2 },
  { type: 'chain', p1: EXHAUST_START + 2, p2: EXHAUST_START + 3 },
  { type: 'chain', p1: EXHAUST_START + 3, p2: EXHAUST_START + 4 },
  { type: 'chain', p1: EXHAUST_START + 4, p2: EXHAUST_START + 5 },
  { type: 'chain', p1: EXHAUST_START + 5, p2: EXHAUST_START + 6 },
];

const TRUCK_JOINTS: JointDef[] = [
  // Driver inverted relative to chassis → eject
  { p1: DRIVER_HEAD, p2: DRIVER_SEAT, q1: CHASSIS_REAR, q2: CHASSIS_FRONT, binding: 'RIDER_MOUNTED' },
  // Chassis flipped (wheels above roof) → sled broken
  { p1: CHASSIS_FRONT, p2: WHEEL_FRONT, q1: CHASSIS_REAR, q2: CHASSIS_FRONT, binding: 'SLED_INTACT' },
  // Chassis flipped → also dismount driver
  { p1: CHASSIS_FRONT, p2: WHEEL_FRONT, q1: CHASSIS_REAR, q2: CHASSIS_FRONT, binding: 'RIDER_MOUNTED' },
];

export const TRUCK_VEHICLE: VehicleDef = {
  id: 'truck',
  name: 'Monster Truck',
  points: TRUCK_POINTS,
  constraints: TRUCK_CONSTRAINTS,
  joints: TRUCK_JOINTS,
  gravityScale: 1.12,
  velocityScale: 0.9,
  renderPoints: {
    wheelFront: WHEEL_FRONT,
    wheelRear: WHEEL_REAR,
    chassisFront: CHASSIS_FRONT,
    chassisRear: CHASSIS_REAR,
    driverSeat: DRIVER_SEAT,
    driverHead: DRIVER_HEAD,
    exhaustStart: EXHAUST_START,
  },
};
