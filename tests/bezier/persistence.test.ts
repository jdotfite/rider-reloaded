import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { LineType } from '../../src/physics/lines/LineTypes';
import { EditTool } from '../../src/input/tools/EditTool';
import { TrackStore } from '../../src/store/TrackStore';
import { BezierAnchor } from '../../src/store/BezierPath';

function installWindowStub() {
  const stub = {
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(globalThis, 'window', {
    value: stub,
    configurable: true,
    writable: true,
  });
}

test('serialized bezier paths keep segment ownership after reload', () => {
  installWindowStub();

  const store = new TrackStore();
  const anchors: BezierAnchor[] = [
    {
      position: new Vec2(0, 0),
      handleIn: new Vec2(0, 0),
      handleOut: new Vec2(35, -30),
      smooth: true,
    },
    {
      position: new Vec2(110, 0),
      handleIn: new Vec2(-30, 40),
      handleOut: new Vec2(0, 0),
      smooth: true,
    },
  ];
  const originalPath = store.addBezierPath(anchors, LineType.SOLID, store.activeLayerId);
  const serialized = store.serialize();

  const restored = new TrackStore();
  assert.equal(restored.load(serialized), true);
  assert.equal(restored.bezierPaths.length, 1);

  const restoredPath = restored.bezierPaths[0];
  assert.deepEqual(restoredPath.lineIds, originalPath.lineIds);
  for (const lineId of restoredPath.lineIds) {
    assert.ok(restored.lines.some(line => line.id === lineId));
    assert.equal(restored.findBezierPathForLine(lineId)?.id, restoredPath.id);
  }

  const middleLineId = restoredPath.lineIds[Math.floor(restoredPath.lineIds.length / 2)];
  const middleSegment = restored.lines.find(line => line.id === middleLineId);
  assert.ok(middleSegment);

  const editTool = new EditTool(restored, () => 1, () => false);
  const start = middleSegment!.p1.lerp(middleSegment!.p2, 0.5);
  editTool.setActivePath(restoredPath.id);
  editTool.onMouseDown(start);
  editTool.onMouseMove(start.add(new Vec2(18, 9)));
  editTool.onMouseUp();

  assert.equal(restored.bezierPaths.length, 1);
  assert.equal(restored.bezierPaths[0].anchors[0].position.x, 18);
  assert.equal(restored.bezierPaths[0].anchors[0].position.y, 9);
});

test('serialized accel lines preserve ride-side flip separately from accel direction', () => {
  installWindowStub();

  const store = new TrackStore();
  const line = store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.ACC);
  assert.ok(line);
  store.flipLine(line!.id);
  store.reverseAccelLine(line!.id);

  const serialized = store.serialize();
  const restored = new TrackStore();
  assert.equal(restored.load(serialized), true);
  assert.equal(restored.lines.length, 1);
  assert.equal(restored.lines[0].flipped, true);
  assert.equal(restored.lines[0].type, LineType.ACC);
  assert.equal((restored.lines[0] as any).accelFlipped, true);
});

test('legacy accel lines fall back to flipped when explicit accel direction is missing', () => {
  installWindowStub();

  const legacyTrack = {
    version: '6.4',
    label: 'Legacy',
    creator: 'Test',
    startPosition: { x: 0, y: 0 },
    layers: [{ id: 0, name: 'Main', visible: true, editable: true }],
    lines: [{
      id: 1,
      type: 1,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      flipped: 1,
      layer: 0,
    }],
  };

  const restored = new TrackStore();
  assert.equal(restored.load(legacyTrack), true);
  assert.equal(restored.lines.length, 1);
  assert.equal(restored.lines[0].flipped, true);
  assert.equal(restored.lines[0].type, LineType.ACC);
  assert.equal((restored.lines[0] as any).accelFlipped, true);
});
