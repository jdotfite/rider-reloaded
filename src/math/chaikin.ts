import { Vec2 } from './Vec2';

/**
 * Chaikin corner-cutting subdivision.
 * Each iteration replaces interior corners with two points at 25%/75% along each segment.
 * First and last points are anchored to preserve chain connectivity.
 */
function chaikinIteration(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points;
  const result: Vec2[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    result.push(new Vec2(
      a.x * 0.75 + b.x * 0.25,
      a.y * 0.75 + b.y * 0.25,
    ));
    result.push(new Vec2(
      a.x * 0.25 + b.x * 0.75,
      a.y * 0.25 + b.y * 0.75,
    ));
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Resample a polyline to have roughly uniform arc-length spacing.
 */
export function resamplePolyline(points: Vec2[], count: number): Vec2[] {
  if (points.length < 2 || count < 2) return points;

  // Compute cumulative arc lengths
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  const totalLength = lengths[lengths.length - 1];
  if (totalLength === 0) return [points[0].clone()];

  const result: Vec2[] = [points[0].clone()];
  let seg = 0;
  for (let i = 1; i < count - 1; i++) {
    const targetDist = (i / (count - 1)) * totalLength;
    while (seg < lengths.length - 2 && lengths[seg + 1] < targetDist) seg++;
    const segLen = lengths[seg + 1] - lengths[seg];
    const t = segLen > 0 ? (targetDist - lengths[seg]) / segLen : 0;
    result.push(new Vec2(
      points[seg].x + (points[seg + 1].x - points[seg].x) * t,
      points[seg].y + (points[seg + 1].y - points[seg].y) * t,
    ));
  }
  result.push(points[points.length - 1].clone());
  return result;
}

/**
 * Smooth a polyline using Chaikin subdivision.
 * @param points - Input polyline (at least 3 points for any effect)
 * @param amount - 0 to 1 smoothing amount. Maps to 0-3 iterations with fractional interpolation.
 * @returns Smoothed polyline with anchored first/last points
 */
export function chaikinSmooth(points: Vec2[], amount: number): Vec2[] {
  if (points.length < 3 || amount <= 0) return points.map(p => p.clone());

  const maxIterations = 3;
  const continuous = Math.min(amount, 1) * maxIterations;
  const fullIterations = Math.floor(continuous);
  const frac = continuous - fullIterations;

  let current = points;
  for (let i = 0; i < fullIterations; i++) {
    current = chaikinIteration(current);
  }

  if (frac > 0 && fullIterations < maxIterations) {
    const next = chaikinIteration(current);
    // Resample both to same count for interpolation
    const count = next.length;
    const resampled = resamplePolyline(current, count);
    current = resampled.map((p, i) => new Vec2(
      p.x + (next[i].x - p.x) * frac,
      p.y + (next[i].y - p.y) * frac,
    ));
  }

  return current;
}
