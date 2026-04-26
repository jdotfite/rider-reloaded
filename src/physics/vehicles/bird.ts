import { ConstraintDef, JointDef, PointDef } from '../rider-data';
import { VehicleDef } from './VehicleDef';

const PEG = 0;
const TAIL = 1;
const NOSE = 2;
const STRING = 3;
const BODY_SEAT = 4;
const BODY_HEAD = 5;

const BIRD_POINTS: PointDef[] = [
  // Soft outer frame. The bottom edge is the main slide rail; the top edge gives
  // the bird some volume for squash/stretch.
  { x: 1.5,  y: -0.8, type: 'collision', friction: 0.32 }, // PEG
  { x: 0,    y: 5.0,  type: 'collision', friction: 0.02 }, // TAIL
  { x: 15.2, y: 5.0,  type: 'collision', friction: 0.02 }, // NOSE
  { x: 16.6, y: -0.8, type: 'collision', friction: 0.32 }, // STRING

  // Inner body core. These stay tucked inside the visible bird so collisions
  // feel like a rounded blob instead of a hidden rider with hands/feet sticking out.
  { x: 6.8,  y: 2.2,  type: 'collision', friction: 0.12 }, // BODY_SEAT
  { x: 10.2, y: -1.9, type: 'collision', friction: 0.12 }, // BODY_HEAD
];

const BIRD_CONSTRAINTS: ConstraintDef[] = [
  // Bottom rail stays reliable on track.
  { type: 'stick', p1: TAIL, p2: NOSE },

  // Puffy upper frame and sides. These softer springs create the squash.
  { type: 'spring', p1: PEG, p2: TAIL, stiffness: 0.24 },
  { type: 'spring', p1: NOSE, p2: STRING, stiffness: 0.24 },
  { type: 'spring', p1: PEG, p2: STRING, stiffness: 0.28, lengthFactor: 1.04 },
  { type: 'spring', p1: PEG, p2: NOSE, stiffness: 0.18 },
  { type: 'spring', p1: STRING, p2: TAIL, stiffness: 0.18 },

  // Inner core keeps the bird from collapsing into a flat plank.
  { type: 'spring', p1: BODY_SEAT, p2: BODY_HEAD, stiffness: 0.3 },
  { type: 'spring', p1: BODY_SEAT, p2: TAIL, stiffness: 0.24 },
  { type: 'spring', p1: BODY_SEAT, p2: NOSE, stiffness: 0.24 },
  { type: 'spring', p1: BODY_HEAD, p2: PEG, stiffness: 0.22 },
  { type: 'spring', p1: BODY_HEAD, p2: STRING, stiffness: 0.22 },

  // Keep the core from folding through the rail on hard landings.
  { type: 'repel', p1: BODY_HEAD, p2: TAIL, lengthFactor: 0.62 },
  { type: 'repel', p1: BODY_HEAD, p2: NOSE, lengthFactor: 0.62 },
];

const BIRD_JOINTS: JointDef[] = [
  // If the top frame flips under the rail, consider the bird wiped out.
  { p1: PEG, p2: TAIL, q1: STRING, q2: PEG, binding: 'SLED_INTACT' },
  { p1: PEG, p2: TAIL, q1: STRING, q2: PEG, binding: 'RIDER_MOUNTED' },
];

export const BIRD_VEHICLE: VehicleDef = {
  id: 'bird',
  name: 'Bird',
  points: BIRD_POINTS,
  constraints: BIRD_CONSTRAINTS,
  joints: BIRD_JOINTS,
  gravityScale: 0.99,
  velocityScale: 1,
  renderPoints: {
    peg: PEG,
    tail: TAIL,
    nose: NOSE,
    string: STRING,
    driverSeat: BODY_SEAT,
    driverHead: BODY_HEAD,
  },
};
