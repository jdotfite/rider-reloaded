import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGeneratorAssets, sanitizeGeneratorSettings } from '../../src/generators/catalog';
import { GeneratorTool } from '../../src/input/tools/GeneratorTool';
import { Vec2 } from '../../src/math/Vec2';
import { LineType } from '../../src/physics/lines/LineTypes';
import { TrackStore } from '../../src/store/TrackStore';

test('generator tool stamps snapped lines using the current line type', () => {
  const store = new TrackStore();
  const asset = buildGeneratorAssets().find((entry) => entry.id === 'line-array');
  assert.ok(asset);

  const settings = sanitizeGeneratorSettings(asset, {
    ...asset.defaultSettings,
    count: 3,
    length: 24,
    spacing: 10,
    angle: 0,
  });

  const tool = new GeneratorTool(
    store,
    () => LineType.ACC,
    () => settings,
    () => true,
    () => 20,
    () => 1,
  );
  tool.setAsset(asset);
  tool.onMouseDown(new Vec2(23, 37));

  assert.equal(store.lines.length, 3);
  assert.equal(store.lines.every((line) => line.type === LineType.ACC), true);

  assert.equal(store.lines[0].p1.x, 8);
  assert.equal(store.lines[0].p2.x, 32);
  assert.deepEqual(
    store.lines.map((line) => [line.p1.y, line.p2.y]),
    [
      [30, 30],
      [40, 40],
      [50, 50],
    ],
  );
});
