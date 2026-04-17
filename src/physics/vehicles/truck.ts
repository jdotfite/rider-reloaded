import { VehicleDef } from './VehicleDef';
import { PointDef, ConstraintDef, JointDef } from '../rider-data';

/**
 * Monster truck — scaled to match the sled rider's visual size.
 *
 * The sled rider spans roughly:
 *   - Width: ~17.5 units (PEG to STRING)
 *   - Height: ~10.5 units (SHOULDER y:-5.5 to NOSE y:5)
 *
 * The truck frame uses the same 4-point + diagonals pattern as the sled.
 * Wheels are the bottom contact points (like TAIL/NOSE on the sled).
 * Chassis tops are the upper points (like PEG/STRING on the sled).
 *
 * Point layout:
 *   0: CHASSIS_FRONT — top-front (like PEG)
 *   1: WHEEL_FRONT   — bottom-front contact (like TAIL)
 *   2: WHEEL_REAR    — bottom-rear contact (like NOSE)
 *   3: CHASSIS_REAR   — top-rear (like STRING)
 *   4: DRIVER_SEAT   — inside cab
 *   5: DRIVER_HEAD   — above cab
 *   6-12: EXHAUST flutter
 */

const CHASSIS_FRONT = 0;
const WHEEL_FRONT = 1;
const WHEEL_REAR = 2;
const CHASSIS_REAR = 3;
const DRIVER_SEAT = 4;
const DRIVER_HEAD = 5;
const EXHAUST_START = 6;

const TRUCK_POINTS: PointDef[] = [
  // Frame — same scale as sled quadrilateral
  // Sled: PEG(0,0) TAIL(0,5) NOSE(15,5) STRING(17.5,0)
  { x: 0,    y: 0,    type: 'collision', friction: 0.8 },    // 0: CHASSIS_FRONT (like PEG)
  { x: 0,    y: 5,    type: 'collision', friction: 0.0 },    // 1: WHEEL_FRONT (like TAIL)
  { x: 15,   y: 5,    type: 'collision', friction: 0.0 },    // 2: WHEEL_REAR (like NOSE)
  { x: 17.5, y: 0,    type: 'collision', friction: 0.0 },    // 3: CHASSIS_REAR (like STRING)

  // Driver — similar position to sled rider
  { x: 5,    y: 0,    type: 'collision', friction: 0.8 },    // 4: DRIVER_SEAT (like BUTT)
  { x: 5,    y: -5.5, type: 'collision', friction: 0.8 },    // 5: DRIVER_HEAD (like SHOULDER)

  // Exhaust flutter
  { x: 18,   y: -1,   type: 'flutter', friction: 0 },
  { x: 20,   y: -1,   type: 'flutter', friction: 0 },
  { x: 22,   y: -1,   type: 'flutter', friction: 0 },
  { x: 24,   y: -1,   type: 'flutter', friction: 0 },
  { x: 26,   y: -1,   type: 'flutter', friction: 0 },
  { x: 28,   y: -1,   type: 'flutter', friction: 0 },
  { x: 30,   y: -1,   type: 'flutter', friction: 0 },
];

const TRUCK_CONSTRAINTS: ConstraintDef[] = [
  // Rigid frame — exact same pattern as sled (6 sticks)
  { type: 'stick', p1: CHASSIS_FRONT, p2: WHEEL_FRONT },        // 0: left edge (like PEG-TAIL)
  { type: 'stick', p1: WHEEL_FRONT, p2: WHEEL_REAR },           // 1: bottom (like TAIL-NOSE)
  { type: 'stick', p1: WHEEL_REAR, p2: CHASSIS_REAR },          // 2: right edge (like NOSE-STRING)
  { type: 'stick', p1: CHASSIS_REAR, p2: CHASSIS_FRONT },       // 3: top (like STRING-PEG)
  { type: 'stick', p1: CHASSIS_FRONT, p2: WHEEL_REAR },         // 4: diagonal (like PEG-NOSE)
  { type: 'stick', p1: CHASSIS_REAR, p2: WHEEL_FRONT },         // 5: diagonal (like STRING-TAIL)

  // Driver-to-frame (breakable — same pattern as sled body-to-sled)
  { type: 'bind_stick', p1: CHASSIS_FRONT, p2: DRIVER_SEAT },   // 6 (like PEG-BUTT)
  { type: 'bind_stick', p1: WHEEL_FRONT, p2: DRIVER_SEAT },     // 7 (like TAIL-BUTT)
  { type: 'bind_stick', p1: WHEEL_REAR, p2: DRIVER_SEAT },      // 8 (like NOSE-BUTT)

  // Driver skeleton
  { type: 'stick', p1: DRIVER_HEAD, p2: DRIVER_SEAT },          // 9 (like SHOULDER-BUTT)

  // Driver-to-frame upper (breakable)
  { type: 'bind_stick', p1: DRIVER_HEAD, p2: CHASSIS_FRONT },   // 10 (like SHOULDER-PEG)
  { type: 'bind_stick', p1: CHASSIS_REAR, p2: DRIVER_HEAD },    // 11

  // Repel sticks (keep driver upright)
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
  // Same pattern as sled joints
  // Driver inverted relative to frame → eject
  { p1: DRIVER_HEAD, p2: DRIVER_SEAT, q1: CHASSIS_REAR, q2: CHASSIS_FRONT, binding: 'RIDER_MOUNTED' },
  // Frame flipped → break
  { p1: CHASSIS_FRONT, p2: WHEEL_FRONT, q1: CHASSIS_REAR, q2: CHASSIS_FRONT, binding: 'SLED_INTACT' },
  // Frame flipped → also dismount
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
    chassisFront: CHASSIS_FRONT,
    wheelFront: WHEEL_FRONT,
    wheelRear: WHEEL_REAR,
    chassisRear: CHASSIS_REAR,
    driverSeat: DRIVER_SEAT,
    driverHead: DRIVER_HEAD,
    exhaustStart: EXHAUST_START,
  },
};
