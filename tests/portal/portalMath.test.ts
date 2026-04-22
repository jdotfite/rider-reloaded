import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import {
  pointInsidePortalCapsule,
  portalLocalToWorld,
  worldToPortalLocal,
} from '../../src/portal/portalMath';
import { createPortalEndpoint } from '../../src/store/PortalTypes';

function approx(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

test('portal local/world transforms round-trip cleanly', () => {
  const endpoint = createPortalEndpoint(new Vec2(18, -7), Math.PI / 5);
  endpoint.length = 46;
  endpoint.radius = 13;

  const local = new Vec2(9, -4);
  const world = portalLocalToWorld(local, endpoint);
  const roundTrip = worldToPortalLocal(world, endpoint);

  approx(roundTrip.x, local.x);
  approx(roundTrip.y, local.y);
});

test('portal capsule hit detection respects rotation and bounds', () => {
  const endpoint = createPortalEndpoint(new Vec2(50, 60), Math.PI / 2);
  endpoint.length = 40;
  endpoint.radius = 8;

  assert.equal(pointInsidePortalCapsule(new Vec2(50, 68), endpoint), true);
  assert.equal(pointInsidePortalCapsule(new Vec2(50, 89), endpoint), false);
});
