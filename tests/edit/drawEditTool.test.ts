import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { TrackStore } from '../../src/store/TrackStore';
import { LineType } from '../../src/physics/lines/LineTypes';
import { LineTool } from '../../src/input/tools/LineTool';
import { EditTool } from '../../src/input/tools/EditTool';
import { DrawEditTool } from '../../src/input/tools/DrawEditTool';
import { PortalTool } from '../../src/input/tools/PortalTool';

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

function createDrawEditPortalTool(store: TrackStore) {
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
  const portalTool = new PortalTool(
    store,
    () => 1,
    () => true,
    () => false,
    () => 24,
  );
  return { tool: new DrawEditTool('line', rawLineTool, portalTool, editTool), portalTool };
}

test('dragging an already active straight line in draw mode moves it without converting it to bezier', () => {
  installWindowStub();

  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);
  const tool = createDrawEditTool(store);

  const activate = new Vec2(50, 0);
  const dragStart = new Vec2(60, 0);
  const dragEnd = new Vec2(70, 12);
  tool.onMouseDown(activate, activate, 0);
  tool.onMouseUp(activate, activate, 0);
  tool.onMouseDown(dragStart, dragStart, 0);
  tool.onMouseMove(dragEnd, dragEnd);
  tool.onMouseUp(dragEnd, dragEnd, 0);

  assert.equal(store.lines.length, 1);
  assert.equal(store.bezierPaths.length, 0);
  assert.equal(store.lines[0].p1.x, 10);
  assert.equal(store.lines[0].p1.y, 12);
  assert.equal(store.lines[0].p2.x, 110);
  assert.equal(store.lines[0].p2.y, 12);
});

test('clicking an inactive line body does not drag until the next deliberate edit gesture', () => {
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
  assert.equal(store.lines[0].p1.x, 0);
  assert.equal(store.lines[0].p1.y, 0);
  assert.equal(store.lines[0].p2.x, 100);
  assert.equal(store.lines[0].p2.y, 0);
});

test('clicking an inactive line endpoint starts a connected line instead of grabbing the existing line', () => {
  installWindowStub();

  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);
  const tool = createDrawEditTool(store);

  const sharedEndpoint = new Vec2(100, 0);
  const drawEnd = new Vec2(140, 16);
  tool.onMouseDown(sharedEndpoint, sharedEndpoint, 0);
  tool.onMouseMove(drawEnd, drawEnd);
  tool.onMouseUp(drawEnd, drawEnd, 0);

  assert.equal(store.lines.length, 2);
  assert.equal(store.lines[0].p1.x, 0);
  assert.equal(store.lines[0].p1.y, 0);
  assert.equal(store.lines[0].p2.x, 100);
  assert.equal(store.lines[0].p2.y, 0);
  assert.equal(store.lines[1].p1.x, 100);
  assert.equal(store.lines[1].p1.y, 0);
  assert.equal(store.lines[1].p2.x, 140);
  assert.equal(store.lines[1].p2.y, 16);
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

test('double-click conversion preserves flipped ride side on the new curve', () => {
  installWindowStub();

  const store = new TrackStore();
  const line = store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);
  assert.ok(line);
  store.flipLine(line!.id);
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

  assert.equal(store.bezierPaths.length, 1);
  assert.equal(store.bezierPaths[0].flipped, true);
  assert.equal(store.bezierPaths[0].lineIds.every((lineId) => store.lines.find((candidate) => candidate.id === lineId)?.flipped === true), true);
});

test('clicking a portal while on the line tool selects the portal instead of starting a new line', () => {
  installWindowStub();

  const store = new TrackStore();
  const pair = store.addPortalPair(new Vec2(0, 0), new Vec2(40, 0), {
    entryRotation: 0,
    exitRotation: 0,
  });
  assert.ok(pair);
  const { tool, portalTool } = createDrawEditPortalTool(store);

  const hit = new Vec2(0, 0);
  tool.onMouseDown(hit, hit, 0);
  tool.onMouseUp(hit, hit, 0);

  assert.equal(store.lines.length, 0);
  assert.equal(portalTool.getSelectedPortalId(), pair!.id);
});

test('clicking the visible upper arch of a portal selects it from the line tool', () => {
  installWindowStub();

  const store = new TrackStore();
  const pair = store.addPortalPair(new Vec2(0, 0), new Vec2(40, 0), {
    entryRotation: 0,
    exitRotation: 0,
  });
  assert.ok(pair);
  const { tool, portalTool } = createDrawEditPortalTool(store);

  const visibleArchPoint = new Vec2(0, -18);
  tool.onMouseDown(visibleArchPoint, visibleArchPoint, 0);
  tool.onMouseUp(visibleArchPoint, visibleArchPoint, 0);

  assert.equal(store.lines.length, 0);
  assert.equal(portalTool.getSelectedPortalId(), pair!.id);
});
