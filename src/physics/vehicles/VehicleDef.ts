import { PointDef, ConstraintDef, JointDef } from '../rider-data';

/**
 * A vehicle definition: physics layout + rendering hints.
 * Physics operates identically on all vehicles — only the point
 * positions, constraints, and visual representation differ.
 */
export interface VehicleDef {
  id: string;
  name: string;
  /** Point definitions (offsets from start position) */
  points: PointDef[];
  /** Constraint definitions (sticks, binds, repels, chains) */
  constraints: ConstraintDef[];
  /** Bind joint definitions */
  joints: JointDef[];
  /** Gravity multiplier (1 = default, >1 = heavier) */
  gravityScale: number;
  /** Initial velocity multiplier (1 = default) */
  velocityScale: number;
  /** Named point indices for the renderer */
  renderPoints: Record<string, number>;
}
