import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { AccLine } from '../../src/physics/lines/AccLine';
import { LineType } from '../../src/physics/lines/LineTypes';
import { TrackStore } from '../../src/store/TrackStore';
import { SelectTool } from '../../src/input/tools/SelectTool';
import { BezierAnchor } from '../../src/store/BezierPath';

function installWindowStub() {
  const listeners = new Map<string, Array<(event: KeyboardEvent) => void>>();
  const stub = {
    addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    removeEventListener(type: string, listener: (event: KeyboardEvent) => void) {
      const existing = listeners.get(type) ?? [];
      listeners.set(type, existing.filter((candidate) => candidate !== listener));
    },
    dispatch(type: string, event: KeyboardEvent) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: stub,
    configurable: true,
    writable: true,
  });
  return stub;
}

function createSampleCurve(store: TrackStore) {
  const anchors: BezierAnchor[] = [
    {
      position: new Vec2(0, 0),
      handleIn: new Vec2(0, 0),
      handleOut: new Vec2(30, -40),
      smooth: true,
    },
    {
      position: new Vec2(120, 0),
      handleIn: new Vec2(-30, 40),
      handleOut: new Vec2(0, 0),
      smooth: true,
    },
  ];
  return store.addBezierPath(anchors, LineType.SOLID, store.activeLayerId);
}

function createStraightPath(store: TrackStore) {
  const anchors: BezierAnchor[] = [
    {
      position: new Vec2(0, 0),
      handleIn: new Vec2(0, 0),
      handleOut: new Vec2(0, 0),
      smooth: true,
    },
    {
      position: new Vec2(100, 50),
      handleIn: new Vec2(0, 0),
      handleOut: new Vec2(0, 0),
      smooth: true,
    },
  ];
  return store.addBezierPath(anchors, LineType.SOLID, store.activeLayerId);
}

test('partial bezier type change upgrades to the whole curve without dropping path ownership', () => {
  installWindowStub();
  const store = new TrackStore();
  const path = createSampleCurve(store);

  assert.ok(path.lineIds.length > 1);

  store.changeLineTypes(new Set([path.lineIds[0]]), LineType.ACC);

  assert.equal(store.bezierPaths.length, 1);
  assert.equal(store.bezierPaths[0].id, path.id);
  assert.equal(store.bezierPaths[0].lineType, LineType.ACC);
  assert.ok(
    store.bezierPaths[0].lineIds.every(lineId => {
      const line = store.lines.find(candidate => candidate.id === lineId);
      return line?.type === LineType.ACC;
    }),
  );
});

test('selecting a bezier segment expands to the full curve and duplicate keeps it editable', () => {
  installWindowStub();
  const store = new TrackStore();
  const original = createSampleCurve(store);
  const selectTool = new SelectTool(store);
  const pickedLine = store.lines.find(line => line.id === original.lineIds[0]);

  assert.ok(pickedLine);

  const midpoint = pickedLine!.p1.lerp(pickedLine!.p2, 0.5);
  selectTool.onMouseDown(midpoint);

  assert.equal(selectTool.getSelectedCount(), original.lineIds.length);

  selectTool.duplicateSelected();

  assert.equal(store.bezierPaths.length, 2);
  const duplicate = store.bezierPaths.find(path => path.id !== original.id);
  assert.ok(duplicate);
  assert.equal(selectTool.getSelectedCount(), duplicate!.lineIds.length);

  assert.equal(duplicate!.anchors.length, original.anchors.length);
  for (let i = 0; i < original.anchors.length; i++) {
    assert.equal(duplicate!.anchors[i].position.x, original.anchors[i].position.x + 20);
    assert.equal(duplicate!.anchors[i].position.y, original.anchors[i].position.y + 20);
    assert.equal(duplicate!.anchors[i].handleIn.x, original.anchors[i].handleIn.x);
    assert.equal(duplicate!.anchors[i].handleIn.y, original.anchors[i].handleIn.y);
    assert.equal(duplicate!.anchors[i].handleOut.x, original.anchors[i].handleOut.x);
    assert.equal(duplicate!.anchors[i].handleOut.y, original.anchors[i].handleOut.y);
  }
});

test('smoothing a selected line chain keeps the result editable as a bezier path', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(40, 20), LineType.SOLID);
  store.addLine(new Vec2(40, 20), new Vec2(80, -10), LineType.SOLID);
  store.addLine(new Vec2(80, -10), new Vec2(120, 0), LineType.SOLID);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(-10, -20));
  selectTool.onMouseMove(new Vec2(130, 30));
  selectTool.onMouseUp(new Vec2(130, 30));

  assert.equal(selectTool.getSelectedCount(), 3);
  assert.equal(store.bezierPaths.length, 0);

  assert.equal(selectTool.startSmooth(), true);
  selectTool.setSmoothAmount(0.65);
  selectTool.applySmooth();

  assert.equal(store.bezierPaths.length, 1);
  assert.ok(store.bezierPaths[0].anchors.length >= 2);
  assert.equal(selectTool.getSelectedCount(), store.bezierPaths[0].lineIds.length);
});

test('select tool scales a selected line uniformly from a corner handle by default', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 50), LineType.SOLID);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(50, 25));
  selectTool.onMouseDown(new Vec2(100, 50));
  selectTool.onMouseMove(new Vec2(200, 100));
  selectTool.onMouseUp(new Vec2(200, 100));

  assert.equal(store.lines[0].p1.x, 0);
  assert.equal(store.lines[0].p1.y, 0);
  assert.equal(store.lines[0].p2.x, 200);
  assert.equal(store.lines[0].p2.y, 100);
});

test('holding shift while scaling breaks aspect ratio', () => {
  const windowStub = installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 50), LineType.SOLID);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(50, 25));
  windowStub.dispatch('keydown', {
    key: 'Shift',
    shiftKey: true,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  } as KeyboardEvent);
  selectTool.onMouseDown(new Vec2(100, 50));
  selectTool.onMouseMove(new Vec2(200, 50));
  selectTool.onMouseUp(new Vec2(200, 50));
  windowStub.dispatch('keyup', {
    key: 'Shift',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  } as KeyboardEvent);

  assert.equal(store.lines[0].p2.x, 200);
  assert.equal(store.lines[0].p2.y, 50);
});

test('grid snap affects select-tool scaling handles', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 50), LineType.SOLID);

  const selectTool = new SelectTool(store, () => true, () => 20, () => 1);
  selectTool.onMouseDown(new Vec2(50, 25));
  selectTool.onMouseDown(new Vec2(100, 50));
  selectTool.onMouseMove(new Vec2(191, 91));
  selectTool.onMouseUp(new Vec2(191, 91));

  assert.equal(store.lines[0].p2.x, 200);
  assert.equal(store.lines[0].p2.y, 100);
});

test('select tool rotates a selected line around its center using the rotate handle', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);

  const selectTool = new SelectTool(store, () => false, () => 24, () => 1);
  selectTool.onMouseDown(new Vec2(50, 0));
  selectTool.onMouseDown(new Vec2(50, -28));
  selectTool.onMouseMove(new Vec2(100, 0));
  selectTool.onMouseUp(new Vec2(100, 0));

  assert.ok(Math.abs(store.lines[0].p1.x - 50) < 1e-6);
  assert.ok(Math.abs(store.lines[0].p1.y + 50) < 1e-6);
  assert.ok(Math.abs(store.lines[0].p2.x - 50) < 1e-6);
  assert.ok(Math.abs(store.lines[0].p2.y - 50) < 1e-6);
});

test('scaling a selected bezier path keeps it editable and updates path ownership', () => {
  installWindowStub();
  const store = new TrackStore();
  const path = createStraightPath(store);
  const selectTool = new SelectTool(store);

  selectTool.onMouseDown(new Vec2(50, 25));
  selectTool.onMouseDown(new Vec2(100, 50));
  selectTool.onMouseMove(new Vec2(200, 100));
  selectTool.onMouseUp(new Vec2(200, 100));

  assert.equal(store.bezierPaths.length, 1);
  assert.equal(store.bezierPaths[0].id, path.id);
  assert.equal(store.bezierPaths[0].anchors[0].position.x, 0);
  assert.equal(store.bezierPaths[0].anchors[0].position.y, 0);
  assert.equal(store.bezierPaths[0].anchors[1].position.x, 200);
  assert.equal(store.bezierPaths[0].anchors[1].position.y, 100);
  assert.equal(selectTool.getSelectedCount(), store.bezierPaths[0].lineIds.length);
});

test('select tool flips selected straight lines', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.SOLID);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(50, 0));
  selectTool.flipSelected();

  assert.equal(store.lines[0].flipped, true);
});

test('select tool can reverse accel direction without flipping the rideable side', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.ACC);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(50, 0));
  selectTool.reverseAccelSelected();

  assert.equal(store.lines[0].flipped, false);
  assert.equal(store.lines[0] instanceof AccLine, true);
  assert.equal((store.lines[0] as AccLine).accelFlipped, true);
});

test('flipping the rideable side preserves accel direction state on red lines', () => {
  installWindowStub();
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(100, 0), LineType.ACC);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(50, 0));
  selectTool.reverseAccelSelected();
  selectTool.flipSelected();

  assert.equal(store.lines[0].flipped, true);
  assert.equal(store.lines[0] instanceof AccLine, true);
  assert.equal((store.lines[0] as AccLine).accelFlipped, true);
});

test('select tool flips every segment in a selected bezier path without losing ownership', () => {
  installWindowStub();
  const store = new TrackStore();
  const path = createSampleCurve(store);
  const selectTool = new SelectTool(store);

  const pickedLine = store.lines.find((line) => line.id === path.lineIds[0]);
  assert.ok(pickedLine);
  const midpoint = pickedLine!.p1.lerp(pickedLine!.p2, 0.5);
  selectTool.onMouseDown(midpoint);
  selectTool.flipSelected();

  assert.equal(store.bezierPaths.length, 1);
  assert.equal(store.bezierPaths[0].id, path.id);
  assert.equal(
    store.bezierPaths[0].lineIds.every((lineId) => store.lines.find((line) => line.id === lineId)?.flipped === true),
    true,
  );
});
