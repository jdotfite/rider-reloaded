import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGeneratorAssets, sanitizeGeneratorSettings } from '../../src/generators/catalog';

test('circle generator creates a closed loop with the requested line count', () => {
  const circle = buildGeneratorAssets().find((asset) => asset.id === 'circle');
  assert.ok(circle);

  const settings = sanitizeGeneratorSettings(circle, {
    ...circle.defaultSettings,
    radius: 40,
    segments: 16,
  });
  const segments = circle.createSegments(settings);

  assert.equal(segments.length, 16);
  assert.equal(segments.every((segment) => segment.leftExtended && segment.rightExtended), true);
  assert.ok(segments[0].p1.distanceToSq(segments[segments.length - 1].p2) < 1e-9);
});

test('line array generator produces separated parallel lines', () => {
  const array = buildGeneratorAssets().find((asset) => asset.id === 'line-array');
  assert.ok(array);

  const settings = sanitizeGeneratorSettings(array, {
    ...array.defaultSettings,
    count: 5,
    length: 40,
    spacing: 10,
    angle: 0,
  });
  const segments = array.createSegments(settings);

  assert.equal(segments.length, 5);
  assert.deepEqual(
    segments.map((segment) => [segment.p1.y, segment.p2.y]),
    [
      [-20, -20],
      [-10, -10],
      [0, 0],
      [10, 10],
      [20, 20],
    ],
  );
  assert.equal(segments.every((segment) => !segment.leftExtended && !segment.rightExtended), true);
});
