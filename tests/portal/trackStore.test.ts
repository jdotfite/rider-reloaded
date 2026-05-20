import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { TrackStore } from '../../src/store/TrackStore';
import { LineType } from '../../src/physics/lines/LineTypes';

function approx(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

test('undo and redo notify mutation observers after restoring snapshots', () => {
  const store = new TrackStore();
  let mutations = 0;
  store.onMutation = () => { mutations++; };

  store.addLine(new Vec2(0, 0), new Vec2(10, 0), LineType.SOLID);
  assert.equal(mutations, 1);
  assert.equal(store.lines.length, 1);

  store.undo();
  assert.equal(mutations, 2);
  assert.equal(store.lines.length, 0);

  store.redo();
  assert.equal(mutations, 3);
  assert.equal(store.lines.length, 1);
});

test('load rejects non-finite coordinates and duplicate imported line ids', () => {
  const baseTrack = {
    version: '6.5',
    label: 'Invalid Track',
    creator: 'test',
    startPosition: { x: 0, y: 0 },
    layers: [{ id: 0, name: 'Default', visible: true, editable: true }],
    lines: [
      { id: 1, type: 0, x1: 0, y1: 0, x2: 10, y2: 0, layer: 0 },
    ],
  };

  const infiniteCoordinate = new TrackStore();
  assert.equal(infiniteCoordinate.load({
    ...baseTrack,
    lines: [{ ...baseTrack.lines[0], x1: Infinity }],
  }), false);

  const infiniteStart = new TrackStore();
  assert.equal(infiniteStart.load({
    ...baseTrack,
    startPosition: { x: 0, y: Infinity },
  }), false);

  const duplicateIds = new TrackStore();
  assert.equal(duplicateIds.load({
    ...baseTrack,
    lines: [
      baseTrack.lines[0],
      { id: 1, type: 0, x1: 20, y1: 0, x2: 30, y2: 0, layer: 0 },
    ],
  }), false);
});

test('portal helpers rotate, swap, and serialize advanced state', () => {
  const store = new TrackStore();
  const pair = store.addPortalPair(new Vec2(0, 0), new Vec2(20, 0), {
    entryRotation: 0,
    exitRotation: 0,
  });

  assert.ok(pair);
  store.rotatePortalPair(pair!.id, Math.PI / 2);
  let rotated = store.getPortalById(pair!.id)!;
  approx(rotated.entry.position.x, 10);
  approx(rotated.entry.position.y, -10);
  approx(rotated.exit.position.x, 10);
  approx(rotated.exit.position.y, 10);

  store.updatePortalPhysics(pair!.id, {
    triggerBody: 'front',
    entryDirectionRule: 'backOnly',
    exitDirection: 'backward',
    exitOffset: 9,
  });
  store.updatePortalVisual(pair!.id, {
    colorTheme: 'amber',
    visibility: 'activation',
    showDebug: true,
  });

  store.swapPortalEndpoints(pair!.id);
  const swapped = store.getPortalById(pair!.id)!;
  approx(swapped.entry.position.y, 10);
  approx(swapped.exit.position.y, -10);

  const serialized = store.serialize();
  const reloaded = new TrackStore();
  assert.equal(reloaded.load(serialized), true);
  const restored = reloaded.getPortalById(pair!.id)!;

  assert.equal(restored.physics.triggerBody, 'front');
  assert.equal(restored.physics.entryDirectionRule, 'backOnly');
  assert.equal(restored.physics.exitDirection, 'backward');
  assert.equal(restored.physics.exitOffset, 9);
  assert.equal(restored.visual.colorTheme, 'amber');
  assert.equal(restored.visual.visibility, 'activation');
  assert.equal(restored.visual.showDebug, true);
});
