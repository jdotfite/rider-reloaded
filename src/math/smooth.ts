import { Vec2 } from './Vec2';

/**
 * Ramer-Douglas-Peucker line simplification.
 * Removes points that deviate less than `epsilon` from the line between endpoints.
 */
export function rdpSimplify(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length <= 2) return points;

  // Find the point with max perpendicular distance
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [first, last];
  }
}

function perpendicularDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return point.distanceTo(lineStart);

  const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  return num / Math.sqrt(lenSq);
}

/**
 * Convert simplified points back to segment pairs for the store.
 */
export function pointsToSegments(points: Vec2[]): Array<{ p1: Vec2; p2: Vec2 }> {
  const segs: Array<{ p1: Vec2; p2: Vec2 }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push({ p1: points[i].clone(), p2: points[i + 1].clone() });
  }
  return segs;
}
