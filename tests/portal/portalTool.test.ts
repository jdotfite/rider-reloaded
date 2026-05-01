import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { PortalTool } from '../../src/input/tools/PortalTool';
import { TrackStore } from '../../src/store/TrackStore';

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

test('portal endpoint rotation drag stays relative to the current portal angle', () => {
  installWindowStub();

  const store = new TrackStore();
  const pair = store.addPortalPair(new Vec2(0, 0), new Vec2(40, 0), {
    entryRotation: 0,
    exitRotation: 0,
  });
  assert.ok(pair);

  const tool = new PortalTool(
    store,
    () => 1,
    () => false,
    () => false,
    () => 24,
  );

  tool.onMouseDown(new Vec2(12, 0));
  tool.onMouseUp();

  const rotateHandle = new Vec2(0, pair!.entry.radius + 18);
  tool.onMouseDown(rotateHandle);

  const dragTarget = new Vec2(5, 27);
  tool.onMouseMove(dragTarget);
  tool.onMouseUp();

  const updated = store.getPortalById(pair!.id);
  assert.ok(updated);

  const expected = Math.atan2(dragTarget.y, dragTarget.x) - Math.PI / 2;
  assert.ok(Math.abs(updated!.entry.rotation - expected) < 1e-6);
  assert.ok(Math.abs(updated!.entry.rotation) < 0.5, `expected a small relative adjustment, got ${updated!.entry.rotation}`);
});
