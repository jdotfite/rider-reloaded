import { VehicleDef } from './VehicleDef';
import { PointDef, ConstraintDef, JointDef } from '../rider-data';

/**
 * Roller coaster — 3-cart train, single driver in the front cart.
 *
 * Point layout (all collision):
 *   Cart 3 (rear,    x= 0..10): 0=LT 1=LB 2=RB 3=RT
 *   Cart 2 (middle,  x=11..21): 4=LT 5=LB 6=RB 7=RT
 *   Cart 1 (front,   x=22..32): 8=LT 9=LB 10=RB 11=RT
 *   Driver (in Cart 1):         12=SEAT 13=HEAD
 *
 * Carts are internally rigid (6 sticks + 2 diagonals each).
 * Adjacent carts coupled by 2 sticks (top + bottom) — allows slight articulation.
 * No scarf/flutter points.
 */

const C3_LT=0, C3_LB=1, C3_RB=2, C3_RT=3;
const C2_LT=4, C2_LB=5, C2_RB=6, C2_RT=7;
const C1_LT=8, C1_LB=9, C1_RB=10, C1_RT=11;
const SEAT=12, HEAD=13;

const RC_POINTS: PointDef[] = [
  // Cart 3 (rear trailing cart) — x=0..10
  { x:  0, y: 0, type: 'collision', friction: 0.8 },  // 0: C3_LT
  { x:  0, y: 5, type: 'collision', friction: 0.0 },  // 1: C3_LB (wheel contact)
  { x: 10, y: 5, type: 'collision', friction: 0.0 },  // 2: C3_RB (wheel contact)
  { x: 10, y: 0, type: 'collision', friction: 0.0 },  // 3: C3_RT

  // Cart 2 (middle cart) — x=26..36  (16-unit gap)
  { x: 26, y: 0, type: 'collision', friction: 0.8 },  // 4: C2_LT
  { x: 26, y: 5, type: 'collision', friction: 0.0 },  // 5: C2_LB (wheel contact)
  { x: 36, y: 5, type: 'collision', friction: 0.0 },  // 6: C2_RB (wheel contact)
  { x: 36, y: 0, type: 'collision', friction: 0.0 },  // 7: C2_RT

  // Cart 1 (front leading cart) — x=52..62
  { x: 52, y: 0, type: 'collision', friction: 0.8 },  // 8: C1_LT
  { x: 52, y: 5, type: 'collision', friction: 0.0 },  // 9: C1_LB (wheel contact)
  { x: 62, y: 5, type: 'collision', friction: 0.0 },  // 10: C1_RB (wheel contact)
  { x: 62, y: 0, type: 'collision', friction: 0.0 },  // 11: C1_RT

  // Driver (seated in front cart center)
  { x: 57, y: 0,    type: 'collision', friction: 0.8 }, // 12: SEAT
  { x: 57, y: -5.5, type: 'collision', friction: 0.8 }, // 13: HEAD
];

const RC_CONSTRAINTS: ConstraintDef[] = [
  // Cart 3 rigid frame
  { type: 'stick', p1: C3_LT, p2: C3_LB },
  { type: 'stick', p1: C3_LB, p2: C3_RB },
  { type: 'stick', p1: C3_RB, p2: C3_RT },
  { type: 'stick', p1: C3_RT, p2: C3_LT },
  { type: 'stick', p1: C3_LT, p2: C3_RB },
  { type: 'stick', p1: C3_RT, p2: C3_LB },

  // Cart 2 rigid frame
  { type: 'stick', p1: C2_LT, p2: C2_LB },
  { type: 'stick', p1: C2_LB, p2: C2_RB },
  { type: 'stick', p1: C2_RB, p2: C2_RT },
  { type: 'stick', p1: C2_RT, p2: C2_LT },
  { type: 'stick', p1: C2_LT, p2: C2_RB },
  { type: 'stick', p1: C2_RT, p2: C2_LB },

  // Cart 1 rigid frame
  { type: 'stick', p1: C1_LT, p2: C1_LB },
  { type: 'stick', p1: C1_LB, p2: C1_RB },
  { type: 'stick', p1: C1_RB, p2: C1_RT },
  { type: 'stick', p1: C1_RT, p2: C1_LT },
  { type: 'stick', p1: C1_LT, p2: C1_RB },
  { type: 'stick', p1: C1_RT, p2: C1_LB },

  // Cart 3 → Cart 2 coupler — single bottom hitch so each cart can angle independently
  { type: 'stick', p1: C3_RB, p2: C2_LB },
  { type: 'repel', p1: C3_RT, p2: C2_LT, lengthFactor: 0.8 },

  // Cart 2 → Cart 1 coupler
  { type: 'stick', p1: C2_RB, p2: C1_LB },
  { type: 'repel', p1: C2_RT, p2: C1_LT, lengthFactor: 0.8 },

  // Driver to Cart 1 (breakable)
  { type: 'bind_stick', p1: C1_LT, p2: SEAT },
  { type: 'bind_stick', p1: C1_LB, p2: SEAT },
  { type: 'bind_stick', p1: C1_RB, p2: SEAT },

  // Driver spine
  { type: 'stick', p1: HEAD, p2: SEAT },

  // Driver upper attachment (breakable)
  { type: 'bind_stick', p1: HEAD, p2: C1_LT },
  { type: 'bind_stick', p1: C1_RT, p2: HEAD },

  // Keep driver upright
  { type: 'repel', p1: HEAD, p2: C1_LB, lengthFactor: 0.5 },
  { type: 'repel', p1: HEAD, p2: C1_RB, lengthFactor: 0.5 },
];

const RC_JOINTS: JointDef[] = [
  // Driver ejected when inverted relative to front cart
  { p1: HEAD, p2: SEAT, q1: C1_RT, q2: C1_LT, binding: 'RIDER_MOUNTED' },
  // Sled breaks when front cart flips
  { p1: C1_LT, p2: C1_LB, q1: C1_RT, q2: C1_LT, binding: 'SLED_INTACT' },
  { p1: C1_LT, p2: C1_LB, q1: C1_RT, q2: C1_LT, binding: 'RIDER_MOUNTED' },
];

export const ROLLERCOASTER_VEHICLE: VehicleDef = {
  id: 'rollercoaster',
  name: 'Roller Coaster',
  points: RC_POINTS,
  constraints: RC_CONSTRAINTS,
  joints: RC_JOINTS,
  gravityScale: 1.15,
  velocityScale: 0.85,
  renderPoints: {
    driverSeat: SEAT,
    driverHead: HEAD,
    nose: C1_RT,
    tail: C3_LT,
    // Named for renderer
    c3lt: C3_LT, c3lb: C3_LB, c3rb: C3_RB, c3rt: C3_RT,
    c2lt: C2_LT, c2lb: C2_LB, c2rb: C2_RB, c2rt: C2_RT,
    c1lt: C1_LT, c1lb: C1_LB, c1rb: C1_RB, c1rt: C1_RT,
  },
};
