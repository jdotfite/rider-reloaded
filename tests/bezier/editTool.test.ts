import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { LineType } from '../../src/physics/lines/LineTypes';
import { TrackStore } from '../../src/store/TrackStore';
import { EditTool } from '../../src/input/tools/EditTool';
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

function createCurve(store: TrackStore) {
  const anchors: BezierAnchor[] = [
    {
      position: new Vec2(0, 0),
      handleIn: new Vec2(0, 0),
      handleOut: new Vec2(40, -30),
      smooth: true,
    },
    {
      position: new Vec2(120, 10),
      handleIn: new Vec2(-35, 45),
      handleOut: new Vec2(0, 0),
      smooth: true,
    },
  ];
  return store.addBezierPath(anchors, LineType.SOLID, store.activeLayerId);
}

test('dragging a bezier line body keeps moving across multiple mouse moves', () => {
  installWindowStub();

  const store = new TrackStore();
  const path = createCurve(store);
  const originalPositions = path.anchors.map(anchor => anchor.position.clone());
  const middleLineId = path.lineIds[Math.floor(path.lineIds.length / 2)];
  const segment = store.lines.find(line => line.id === middleLineId);
  assert.ok(segment);

  const editTool = new EditTool(store, () => 1, () => false);
  const start = segment!.p1.lerp(segment!.p2, 0.5);
  editTool.setActivePath(path.id);
  editTool.onMouseDown(start);
  editTool.onMouseMove(start.add(new Vec2(12, 6)));
  editTool.onMouseMove(start.add(new Vec2(24, 12)));
  editTool.onMouseUp();

  const movedPath = store.bezierPaths.find(candidate => candidate.id === path.id);
  assert.ok(movedPath);
  assert.equal(movedPath!.anchors.length, originalPositions.length);
  for (let i = 0; i < originalPositions.length; i++) {
    assert.equal(movedPath!.anchors[i].position.x, originalPositions[i].x + 24);
    assert.equal(movedPath!.anchors[i].position.y, originalPositions[i].y + 12);
  }
});

test('double-clicking a bezier segment inserts an anchor point', () => {
  installWindowStub();

  const store = new TrackStore();
  const path = createCurve(store);
  const middleLineId = path.lineIds[Math.floor(path.lineIds.length / 2)];
  const segment = store.lines.find(line => line.id === middleLineId);
  assert.ok(segment);

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const editTool = new EditTool(store, () => 1, () => false);
    const clickPos = segment!.p1.lerp(segment!.p2, 0.5);

    editTool.onMouseDown(clickPos);
    editTool.onMouseUp();

    now = 1100;
    editTool.onMouseDown(clickPos);
    editTool.onMouseUp();
  } finally {
    Date.now = originalNow;
  }

  const updated = store.bezierPaths.find(candidate => candidate.id === path.id);
  assert.ok(updated);
  assert.equal(updated!.anchors.length, 3);
});
