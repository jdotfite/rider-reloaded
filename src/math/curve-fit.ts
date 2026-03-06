import { Vec2 } from './Vec2';

/**
 * Schneider's curve fitting algorithm.
 * Converts a polyline into a series of cubic bezier curves.
 * Based on "An Algorithm for Automatically Fitting Digitized Curves" (Graphics Gems, 1990).
 */

interface CubicBezier {
  start: Vec2;
  cp1: Vec2;
  cp2: Vec2;
  end: Vec2;
}

const MAX_ITERATIONS = 4;

export function fitCurve(
  points: Vec2[],
  maxError: number,
): CubicBezier[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    return [fitSingleLine(points[0], points[1])];
  }

  // Remove duplicate consecutive points
  const cleaned: Vec2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceToSq(cleaned[cleaned.length - 1]) > 0.01) {
      cleaned.push(points[i]);
    }
  }
  if (cleaned.length < 2) return [];
  if (cleaned.length === 2) {
    return [fitSingleLine(cleaned[0], cleaned[1])];
  }

  // Compute left tangent at first point, right tangent at last point
  const leftTangent = computeLeftTangent(cleaned, 0);
  const rightTangent = computeRightTangent(cleaned, cleaned.length - 1);

  return fitCubic(cleaned, 0, cleaned.length - 1, leftTangent, rightTangent, maxError);
}

function fitSingleLine(p0: Vec2, p1: Vec2): CubicBezier {
  const dist = p0.distanceTo(p1) / 3;
  const dir = p1.sub(p0).normalize();
  return {
    start: p0.clone(),
    cp1: p0.add(dir.scale(dist)),
    cp2: p1.sub(dir.scale(dist)),
    end: p1.clone(),
  };
}

function fitCubic(
  points: Vec2[],
  first: number,
  last: number,
  tHat1: Vec2,
  tHat2: Vec2,
  error: number,
): CubicBezier[] {
  const nPts = last - first + 1;

  // Use heuristic for 2-point case
  if (nPts === 2) {
    const dist = points[first].distanceTo(points[last]) / 3;
    return [{
      start: points[first].clone(),
      cp1: points[first].add(tHat1.scale(dist)),
      cp2: points[last].add(tHat2.scale(dist)),
      end: points[last].clone(),
    }];
  }

  // Parameterize points by chord length
  let u = chordLengthParameterize(points, first, last);
  let bezier = generateBezier(points, first, last, u, tHat1, tHat2);
  let result = computeMaxError(points, first, last, bezier, u);

  if (result.maxError < error) {
    return [bezier];
  }

  // Try reparameterization if error is within tolerance * 4
  if (result.maxError < error * 4) {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const uPrime = reparameterize(points, first, last, u, bezier);
      bezier = generateBezier(points, first, last, uPrime, tHat1, tHat2);
      result = computeMaxError(points, first, last, bezier, uPrime);
      if (result.maxError < error) {
        return [bezier];
      }
      u = uPrime;
    }
  }

  // Split at point of max error and fit recursively
  const splitPoint = result.splitPoint;
  const centerTangent = computeCenterTangent(points, splitPoint);
  const negCenterTangent = centerTangent.scale(-1);

  const left = fitCubic(points, first, splitPoint, tHat1, centerTangent, error);
  const right = fitCubic(points, splitPoint, last, negCenterTangent, tHat2, error);

  return [...left, ...right];
}

function generateBezier(
  points: Vec2[],
  first: number,
  last: number,
  uPrime: number[],
  tHat1: Vec2,
  tHat2: Vec2,
): CubicBezier {
  const nPts = last - first + 1;

  // Compute A matrix: tangent-scaled Bernstein coefficients
  const A: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i];
    const oneMinusU = 1 - u;
    A.push([
      tHat1.scale(3 * u * oneMinusU * oneMinusU),
      tHat2.scale(3 * u * u * oneMinusU),
    ]);
  }

  // Compute C and X matrices
  const C = [[0, 0], [0, 0]];
  const X = [0, 0];

  const p0 = points[first];
  const p3 = points[last];

  for (let i = 0; i < nPts; i++) {
    C[0][0] += A[i][0].dot(A[i][0]);
    C[0][1] += A[i][0].dot(A[i][1]);
    C[1][0] = C[0][1];
    C[1][1] += A[i][1].dot(A[i][1]);

    const u = uPrime[i];
    const oneMinusU = 1 - u;
    // Point on bezier if ctrl pts were at p0,p0,p3,p3
    const b0 = oneMinusU * oneMinusU * oneMinusU;
    const b1 = 3 * oneMinusU * oneMinusU * u;
    const b2 = 3 * oneMinusU * u * u;
    const b3 = u * u * u;
    const tmp = points[first + i].sub(
      p0.scale(b0 + b1).add(p3.scale(b2 + b3))
    );
    X[0] += A[i][0].dot(tmp);
    X[1] += A[i][1].dot(tmp);
  }

  // Compute determinants
  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
  const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];

  // Derive alpha values
  let alphaL = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
  let alphaR = detC0C1 === 0 ? 0 : detC0X / detC0C1;

  // If alpha is negative or zero, use heuristic
  const segLength = p0.distanceTo(p3);
  const epsilon = 1.0e-6 * segLength;
  if (alphaL < epsilon || alphaR < epsilon) {
    const dist = segLength / 3;
    return {
      start: p0.clone(),
      cp1: p0.add(tHat1.scale(dist)),
      cp2: p3.add(tHat2.scale(dist)),
      end: p3.clone(),
    };
  }

  return {
    start: p0.clone(),
    cp1: p0.add(tHat1.scale(alphaL)),
    cp2: p3.add(tHat2.scale(alphaR)),
    end: p3.clone(),
  };
}

function reparameterize(
  points: Vec2[],
  first: number,
  last: number,
  u: number[],
  bezier: CubicBezier,
): number[] {
  const result: number[] = [];
  for (let i = first; i <= last; i++) {
    result.push(newtonRaphsonRootFind(bezier, points[i], u[i - first]));
  }
  return result;
}

function newtonRaphsonRootFind(
  bezier: CubicBezier,
  point: Vec2,
  u: number,
): number {
  // Q(u)
  const q = evaluateBezier(bezier, u);
  // Q'(u)
  const q1 = evaluateBezierDerivative(bezier, u);
  // Q''(u)
  const q2 = evaluateBezierSecondDerivative(bezier, u);

  const diff = q.sub(point);
  const numerator = diff.dot(q1);
  const denominator = q1.dot(q1) + diff.dot(q2);

  if (Math.abs(denominator) < 1e-12) return u;

  return u - numerator / denominator;
}

function evaluateBezier(bezier: CubicBezier, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return new Vec2(
    mt3 * bezier.start.x + 3 * mt2 * t * bezier.cp1.x + 3 * mt * t2 * bezier.cp2.x + t3 * bezier.end.x,
    mt3 * bezier.start.y + 3 * mt2 * t * bezier.cp1.y + 3 * mt * t2 * bezier.cp2.y + t3 * bezier.end.y,
  );
}

function evaluateBezierDerivative(bezier: CubicBezier, t: number): Vec2 {
  const mt = 1 - t;
  const a = bezier.cp1.sub(bezier.start).scale(3 * mt * mt);
  const b = bezier.cp2.sub(bezier.cp1).scale(6 * mt * t);
  const c = bezier.end.sub(bezier.cp2).scale(3 * t * t);
  return a.add(b).add(c);
}

function evaluateBezierSecondDerivative(bezier: CubicBezier, t: number): Vec2 {
  const mt = 1 - t;
  const a = bezier.cp2.sub(bezier.cp1.scale(2)).add(bezier.start).scale(6 * mt);
  const b = bezier.end.sub(bezier.cp2.scale(2)).add(bezier.cp1).scale(6 * t);
  return a.add(b);
}

function chordLengthParameterize(
  points: Vec2[],
  first: number,
  last: number,
): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[u.length - 1] + points[i].distanceTo(points[i - 1]));
  }
  const total = u[u.length - 1];
  if (total > 0) {
    for (let i = 1; i < u.length; i++) {
      u[i] /= total;
    }
  }
  return u;
}

function computeMaxError(
  points: Vec2[],
  first: number,
  last: number,
  bezier: CubicBezier,
  u: number[],
): { maxError: number; splitPoint: number } {
  let maxDist = 0;
  let splitPoint = Math.floor((last - first + 1) / 2) + first;

  for (let i = first + 1; i < last; i++) {
    const p = evaluateBezier(bezier, u[i - first]);
    const dist = p.distanceToSq(points[i]);
    if (dist >= maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }

  return { maxError: maxDist, splitPoint };
}

function computeLeftTangent(points: Vec2[], index: number): Vec2 {
  const tangent = points[index + 1].sub(points[index]);
  return tangent.length() > 0 ? tangent.normalize() : new Vec2(1, 0);
}

function computeRightTangent(points: Vec2[], index: number): Vec2 {
  const tangent = points[index - 1].sub(points[index]);
  return tangent.length() > 0 ? tangent.normalize() : new Vec2(-1, 0);
}

function computeCenterTangent(points: Vec2[], index: number): Vec2 {
  const v1 = points[index - 1].sub(points[index]);
  const v2 = points[index].sub(points[index + 1]);
  const tangent = v1.add(v2).scale(0.5);
  return tangent.length() > 0 ? tangent.normalize() : points[index + 1].sub(points[index - 1]).normalize();
}
