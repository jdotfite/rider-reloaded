/** Cantor pairing function for hashing two integers into a unique key */
export function hashNumberPair(a: number, b: number): number {
  // Shift to non-negative
  const x = a >= 0 ? 2 * a : -2 * a - 1;
  const y = b >= 0 ? 2 * b : -2 * b - 1;
  return ((x + y) * (x + y + 1)) / 2 + y;
}
