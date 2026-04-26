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
