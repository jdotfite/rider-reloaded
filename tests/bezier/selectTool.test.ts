import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { LineType } from '../../src/physics/lines/LineTypes';
import { TrackStore } from '../../src/store/TrackStore';
import { SelectTool } from '../../src/input/tools/SelectTool';
import { BezierAnchor } from '../../src/store/BezierPath';

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

test('partial bezier type change upgrades to the whole curve without dropping path ownership', () => {
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
  const store = new TrackStore();
  const original = createSampleCurve(store);
  const selectTool = new SelectTool(store);
  const pickedLine = store.lines.find(line => line.id === original.lineIds[0]);

  assert.ok(pickedLine);

  const midpoint = pickedLine!.p1.lerp(pickedLine!.p2, 0.5);
  selectTool.onMouseDown(midpoint, midpoint);

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
  const store = new TrackStore();
  store.addLine(new Vec2(0, 0), new Vec2(40, 20), LineType.SOLID);
  store.addLine(new Vec2(40, 20), new Vec2(80, -10), LineType.SOLID);
  store.addLine(new Vec2(80, -10), new Vec2(120, 0), LineType.SOLID);

  const selectTool = new SelectTool(store);
  selectTool.onMouseDown(new Vec2(-10, -20), new Vec2(-10, -20));
  selectTool.onMouseMove(new Vec2(130, 30), new Vec2(130, 30));
  selectTool.onMouseUp(new Vec2(130, 30), new Vec2(130, 30));

  assert.equal(selectTool.getSelectedCount(), 3);
  assert.equal(store.bezierPaths.length, 0);

  assert.equal(selectTool.startSmooth(), true);
  selectTool.setSmoothAmount(0.65);
  selectTool.applySmooth();

  assert.equal(store.bezierPaths.length, 1);
  assert.ok(store.bezierPaths[0].anchors.length >= 2);
  assert.equal(selectTool.getSelectedCount(), store.bezierPaths[0].lineIds.length);
});
