import { Vec2 } from './Vec2';
import { MIN_LINE_LENGTH } from '../constants';

export function sampleCubicBezier(
  start: Vec2,
  cp1: Vec2,
  cp2: Vec2,
  end: Vec2,
  segmentCount?: number,
): Array<{ p1: Vec2; p2: Vec2 }> {
  if (segmentCount === undefined) {
    const approxLength =
      start.distanceTo(cp1) +
      cp1.distanceTo(cp2) +
      cp2.distanceTo(end);
    segmentCount = Math.max(8, Math.min(64, Math.ceil(approxLength / MIN_LINE_LENGTH)));
  }

  const points: Vec2[] = [];
  for (let i = 0; i <= segmentCount; i++) {
    const t = i / segmentCount;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    points.push(new Vec2(
      mt3 * start.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * end.x,
      mt3 * start.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * end.y,
    ));
  }

  const segments: Array<{ p1: Vec2; p2: Vec2 }> = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({ p1: points[i - 1], p2: points[i] });
  }
  return segments;
}
