import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { TrackStore } from '../../src/store/TrackStore';
import { LineType } from '../../src/physics/lines/LineTypes';
import { LineTool } from '../../src/input/tools/LineTool';
import { EditTool } from '../../src/input/tools/EditTool';
import { DrawEditTool } from '../../src/input/tools/DrawEditTool';

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

function createDrawEditTool(store: TrackStore) {
  const rawLineTool = new LineTool(
    store,
    () => LineType.SOLID,
    () => true,
    () => false,
    () => 24,
    () => 1,
  );
  const editTool = new EditTool(
    store,
    () => 1,
    () => true,
    () => false,
    () => 24,
  );
  return new DrawEditTool('line', rawLineTool, editTool);
}

test('drawing mode drags an existing straight line without converting it to bezier', () => {
  installWindowStub();

  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);
  const tool = createDrawEditTool(store);

  const start = new Vec2(50, 0);
  const end = new Vec2(60, 12);
  tool.onMouseDown(start, start, 0);
  tool.onMouseMove(end, end);
  tool.onMouseUp(end, end, 0);

  assert.equal(store.lines.length, 1);
  assert.equal(store.bezierPaths.length, 0);
  assert.equal(store.lines[0].p1.x, 10);
  assert.equal(store.lines[0].p1.y, 12);
  assert.equal(store.lines[0].p2.x, 110);
  assert.equal(store.lines[0].p2.y, 12);
});

test('clicking a drawn line activates its handles, then empty space still starts a new line', () => {
  installWindowStub();

  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);
  const tool = createDrawEditTool(store);

  const midpoint = new Vec2(50, 0);
  tool.onMouseDown(midpoint, midpoint, 0);
  tool.onMouseUp(midpoint, midpoint, 0);

  const movedHandle = new Vec2(20, 20);
  tool.onMouseDown(new Vec2(0, 0), new Vec2(0, 0), 0);
  tool.onMouseMove(movedHandle, movedHandle);
  tool.onMouseUp(movedHandle, movedHandle, 0);

  assert.equal(store.lines[0].p1.x, 20);
  assert.equal(store.lines[0].p1.y, 20);
  assert.equal(store.lines[0].p2.x, 100);
  assert.equal(store.lines[0].p2.y, 0);

  const drawStart = new Vec2(200, 10);
  const drawEnd = new Vec2(240, 10);
  tool.onMouseDown(drawStart, drawStart, 0);
  tool.onMouseMove(drawEnd, drawEnd);
  tool.onMouseUp(drawEnd, drawEnd, 0);

  assert.equal(store.lines.length, 2);
  assert.equal(store.lines[1].p1.x, 200);
  assert.equal(store.lines[1].p1.y, 10);
  assert.equal(store.lines[1].p2.x, 240);
  assert.equal(store.lines[1].p2.y, 10);
});

test('double-clicking a straight line in draw mode converts it to a bezier path', () => {
  installWindowStub();

  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);
  const tool = createDrawEditTool(store);

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const midpoint = new Vec2(50, 0);
    tool.onMouseDown(midpoint, midpoint, 0);
    tool.onMouseUp(midpoint, midpoint, 0);

    now = 1100;
    tool.onMouseDown(midpoint, midpoint, 0);
    tool.onMouseUp(midpoint, midpoint, 0);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(store.lines.length > 0, true);
  assert.equal(store.bezierPaths.length, 1);
  assert.equal(store.bezierPaths[0].anchors.length, 2);
});
