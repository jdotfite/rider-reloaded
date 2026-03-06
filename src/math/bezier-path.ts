import { Vec2 } from './Vec2';
import { BezierPath } from '../store/BezierPath';
import { MIN_LINE_LENGTH } from '../constants';

/**
 * Generate line segments from a BezierPath by sampling each cubic bezier span.
 * Segments are contiguous: each segment's p2 is the SAME Vec2 instance as the
 * next segment's p1 so that the renderer's connected-segment optimization works
 * and there are no physics gaps.
 */
export function generateSegmentsFromPath(path: BezierPath): Array<{ p1: Vec2; p2: Vec2 }> {
  const anchors = path.anchors;

  // First, collect all sample points across all spans into one contiguous array.
  // This guarantees span boundaries are exact anchor positions (no floating-point gaps).
  const points: Vec2[] = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    const a0 = anchors[i];
    const a1 = anchors[i + 1];

    const cp0 = a0.position;
    const cp1 = a0.position.add(a0.handleOut);
    const cp2 = a1.position.add(a1.handleIn);
    const cp3 = a1.position;

    // Check if this is essentially a straight line (both handles near zero)
    if (a0.handleOut.lengthSq() < 0.01 && a1.handleIn.lengthSq() < 0.01) {
      if (points.length === 0) points.push(cp0.clone());
      if (cp0.distanceToSq(cp3) > 0.01) {
        points.push(cp3.clone());
      }
      continue;
    }

    // Determine sample count from control polygon length
    const controlLen = cp0.distanceTo(cp1) + cp1.distanceTo(cp2) + cp2.distanceTo(cp3);
    const count = Math.max(4, Math.min(64, Math.ceil(controlLen / MIN_LINE_LENGTH)));

    // Start from exact anchor position for first span
    if (points.length === 0) points.push(cp0.clone());

    for (let j = 1; j < count; j++) {
      const t = j / count;
      const pt = evalCubic(cp0, cp1, cp2, cp3, t);
      const prev = points[points.length - 1];
      if (pt.distanceToSq(prev) >= MIN_LINE_LENGTH * MIN_LINE_LENGTH * 0.25) {
        points.push(pt);
      }
    }

    // Always end at exact anchor position (no floating-point drift)
    points.push(cp3.clone());
  }

  // Convert points to segments. Each segment shares the same Vec2 instance at
  // the junction so the LineRenderer connected check (reference equality) works.
  const segments: Array<{ p1: Vec2; p2: Vec2 }> = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceToSq(points[i - 1]) < 0.01) continue;
    segments.push({ p1: points[i - 1], p2: points[i] });
  }

  return segments;
}

function evalCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return new Vec2(
    mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  );
}
