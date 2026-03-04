/**
 * Rider body definition matching lr-core / linerider-advanced reference.
 * 10 collision points + 7 scarf points = 17 total
 * 22 bones + 3 bind joints + 7 scarf chains = 32 constraints
 */

export interface PointDef {
  x: number;
  y: number;
  type: 'collision' | 'flutter';
  friction: number;
}

export interface StickDef {
  type: 'stick';
  p1: number;
  p2: number;
}

export interface RepelDef {
  type: 'repel';
  p1: number;
  p2: number;
  lengthFactor: number;
}

export interface BindStickDef {
  type: 'bind_stick';
  p1: number;
  p2: number;
}

export interface ChainDef {
  type: 'chain';
  p1: number;
  p2: number;
}

export type ConstraintDef = StickDef | RepelDef | BindStickDef | ChainDef;

export interface JointDef {
  p1: number;
  p2: number;
  q1: number;
  q2: number;
  binding: 'RIDER_MOUNTED' | 'SLED_INTACT';
}

// Point indices (matching lr-core naming)
export const PEG = 0;       // Sled top-left
export const TAIL = 1;      // Sled bottom-left
export const NOSE = 2;      // Sled bottom-right
export const STRING = 3;    // Sled top-right
export const BUTT = 4;      // Body seat
export const SHOULDER = 5;  // Body shoulder
export const RHAND = 6;     // Right hand
export const LHAND = 7;     // Left hand
export const LFOOT = 8;     // Left foot
export const RFOOT = 9;     // Right foot
// Scarf: 10-16

/**
 * Exact point positions from lr-core rider-data.
 * Coordinates are offsets from start position.
 */
export const RIDER_POINTS: PointDef[] = [
  // Sled contact points (0-3)
  { x: 0,    y: 0,    type: 'collision', friction: 0.8 },   // 0: PEG
  { x: 0,    y: 5,    type: 'collision', friction: 0.0 },   // 1: TAIL
  { x: 15,   y: 5,    type: 'collision', friction: 0.0 },   // 2: NOSE
  { x: 17.5, y: 0,    type: 'collision', friction: 0.0 },   // 3: STRING

  // Body contact points (4-9)
  { x: 5,    y: 0,    type: 'collision', friction: 0.8 },   // 4: BUTT
  { x: 5,    y: -5.5, type: 'collision', friction: 0.8 },   // 5: SHOULDER
  { x: 11.5, y: -5,   type: 'collision', friction: 0.1 },   // 6: RHAND
  { x: 11.5, y: -5,   type: 'collision', friction: 0.1 },   // 7: LHAND
  { x: 10,   y: 5,    type: 'collision', friction: 0.0 },   // 8: LFOOT
  { x: 10,   y: 5,    type: 'collision', friction: 0.0 },   // 9: RFOOT

  // Scarf flutter points (10-16)
  { x: 3,    y: -5.5, type: 'flutter', friction: 0 },       // 10
  { x: 1,    y: -5.5, type: 'flutter', friction: 0 },       // 11
  { x: -1,   y: -5.5, type: 'flutter', friction: 0 },       // 12
  { x: -3,   y: -5.5, type: 'flutter', friction: 0 },       // 13
  { x: -5,   y: -5.5, type: 'flutter', friction: 0 },       // 14
  { x: -7,   y: -5.5, type: 'flutter', friction: 0 },       // 15
  { x: -9,   y: -5.5, type: 'flutter', friction: 0 },       // 16
];

/**
 * Bone constraints matching linerider-advanced RiderConstants.cs.
 * Order matters — this is the exact resolution order.
 */
export const RIDER_CONSTRAINTS: ConstraintDef[] = [
  // Sled frame — 6 rigid sticks forming quadrilateral with diagonals
  { type: 'stick', p1: PEG, p2: TAIL },           // 0
  { type: 'stick', p1: TAIL, p2: NOSE },           // 1
  { type: 'stick', p1: NOSE, p2: STRING },         // 2
  { type: 'stick', p1: STRING, p2: PEG },          // 3
  { type: 'stick', p1: PEG, p2: NOSE },            // 4 diagonal
  { type: 'stick', p1: STRING, p2: TAIL },         // 5 diagonal

  // Sled-to-body — 3 breakable
  { type: 'bind_stick', p1: PEG, p2: BUTT },       // 6
  { type: 'bind_stick', p1: TAIL, p2: BUTT },      // 7
  { type: 'bind_stick', p1: NOSE, p2: BUTT },      // 8

  // Body skeleton — 6 rigid (includes intentional duplicate Shoulder-RHand)
  { type: 'stick', p1: SHOULDER, p2: BUTT },       // 9
  { type: 'stick', p1: SHOULDER, p2: LHAND },      // 10
  { type: 'stick', p1: SHOULDER, p2: RHAND },      // 11
  { type: 'stick', p1: BUTT, p2: LFOOT },          // 12
  { type: 'stick', p1: BUTT, p2: RFOOT },          // 13
  { type: 'stick', p1: SHOULDER, p2: RHAND },      // 14 INTENTIONAL DUPLICATE

  // Body-to-sled — 5 breakable
  { type: 'bind_stick', p1: SHOULDER, p2: PEG },   // 15
  { type: 'bind_stick', p1: STRING, p2: LHAND },   // 16
  { type: 'bind_stick', p1: STRING, p2: RHAND },   // 17
  { type: 'bind_stick', p1: LFOOT, p2: NOSE },     // 18
  { type: 'bind_stick', p1: RFOOT, p2: NOSE },     // 19

  // Repel sticks — 2 (rest length halved)
  { type: 'repel', p1: SHOULDER, p2: LFOOT, lengthFactor: 0.5 },  // 20
  { type: 'repel', p1: SHOULDER, p2: RFOOT, lengthFactor: 0.5 },  // 21

  // Scarf chains
  { type: 'chain', p1: SHOULDER, p2: 10 },
  { type: 'chain', p1: 10, p2: 11 },
  { type: 'chain', p1: 11, p2: 12 },
  { type: 'chain', p1: 12, p2: 13 },
  { type: 'chain', p1: 13, p2: 14 },
  { type: 'chain', p1: 14, p2: 15 },
  { type: 'chain', p1: 15, p2: 16 },
];

/**
 * Bind joints — checked after all iterations.
 * cross(p2-p1, q2-q1) >= 0 → OK, < 0 → break binding.
 */
export const RIDER_JOINTS: JointDef[] = [
  // Body inverted relative to sled
  { p1: SHOULDER, p2: BUTT, q1: STRING, q2: PEG, binding: 'RIDER_MOUNTED' },
  // Sled flipped (breaks sled integrity)
  { p1: PEG, p2: TAIL, q1: STRING, q2: PEG, binding: 'SLED_INTACT' },
  // Sled flipped (also dismounts rider)
  { p1: PEG, p2: TAIL, q1: STRING, q2: PEG, binding: 'RIDER_MOUNTED' },
];
