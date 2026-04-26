import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import {
  clampEditorGridSize,
  snapToGrid,
} from '../../src/editor/GridMath';
import { resolvePointSnap } from '../../src/input/tools/pointSnap';
import { TrackStore } from '../../src/store/TrackStore';
import { LineType } from '../../src/physics/lines/LineTypes';
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

test('grid math clamps sizes and snaps to the nearest world intersection', () => {
  assert.equal(clampEditorGridSize(3), 8);
  assert.equal(clampEditorGridSize(91), 64);

  const snapped = snapToGrid(new Vec2(13, -19), 10);
  assert.equal(snapped.x, 10);
  assert.equal(snapped.y, -20);
});

test('grid snapping takes priority over endpoint snapping when both are available', () => {
  const result = resolvePointSnap(new Vec2(13, 31), {
    gridEnabled: true,
    gridSize: 20,
    endpoint: new Vec2(14, 29),
  });

  assert.equal(result.kind, 'grid');
  assert.equal(result.point.x, 20);
  assert.equal(result.point.y, 40);
});

test('edit tool snaps bezier anchors onto grid intersections', () => {
  installWindowStub();

  const store = new TrackStore();
  const anchors: BezierAnchor[] = [
    {
      position: new Vec2(0, 0),
      handleIn: new Vec2(0, 0),
      handleOut: new Vec2(28, -12),
      smooth: true,
    },
    {
      position: new Vec2(80, 10),
      handleIn: new Vec2(-24, 18),
      handleOut: new Vec2(0, 0),
      smooth: true,
    },
  ];
  const path = store.addBezierPath(anchors, LineType.SOLID, store.activeLayerId);

  const editTool = new EditTool(store, () => 1, () => true, () => true, () => 20);
  editTool.setActivePath(path.id);

  editTool.onMouseDown(new Vec2(0, 0));
  editTool.onMouseMove(new Vec2(13, 31));
  editTool.onMouseUp();

  const moved = store.bezierPaths.find(candidate => candidate.id === path.id);
  assert.ok(moved);
  assert.equal(moved!.anchors[0].position.x, 20);
  assert.equal(moved!.anchors[0].position.y, 40);
});

test('edit tool snaps dragged bezier path bodies to grid intersections', () => {
  installWindowStub();

  const store = new TrackStore();
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
  const path = store.addBezierPath(anchors, LineType.SOLID, store.activeLayerId);
  const middleLineId = path.lineIds[Math.floor(path.lineIds.length / 2)];
  const segment = store.lines.find(line => line.id === middleLineId);
  assert.ok(segment);

  const editTool = new EditTool(store, () => 1, () => true, () => true, () => 20);
  const start = segment!.p1.lerp(segment!.p2, 0.5);
  editTool.setActivePath(path.id);
  editTool.onMouseDown(start);
  editTool.onMouseMove(start.add(new Vec2(13, 31)));
  editTool.onMouseUp();

  const moved = store.bezierPaths.find(candidate => candidate.id === path.id);
  assert.ok(moved);
  assert.equal(moved!.anchors[0].position.x, 20);
  assert.equal(moved!.anchors[0].position.y, 40);
  assert.equal(moved!.anchors[1].position.x, 140);
  assert.equal(moved!.anchors[1].position.y, 50);
});
