import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { PhysicsEngine } from '../../src/physics/PhysicsEngine';
import { SolidLine } from '../../src/physics/lines/SolidLine';
import { Rider } from '../../src/physics/Rider';
import { SpatialGrid } from '../../src/physics/grid/SpatialGrid';
import { createPortalEndpoint } from '../../src/store/PortalTypes';
import { TrackStore } from '../../src/store/TrackStore';

test('portal exit safety nudges riders past blocking geometry', () => {
  const grid = new SpatialGrid();
  grid.rebuild([
    new SolidLine(new Vec2(-40, 14), new Vec2(40, 14)),
  ]);

  const engine = new PhysicsEngine(new Rider(new Vec2(0, 0)), grid, () => []);
  const endpoint = createPortalEndpoint(new Vec2(0, 0), 0);
  endpoint.radius = 10;

  const safePoint = (engine as any).resolveSafeExitPoint(endpoint, new Vec2(0, 12)) as Vec2;
  assert.ok(safePoint.y < 9, `expected safe point to move out through the portal opening, got y=${safePoint.y}`);
});

test('portal direction rules accept front and reject back movement as expected', () => {
  const engine = new PhysicsEngine(new Rider(new Vec2(0, 0)), new SpatialGrid(), () => []);
  const endpoint = createPortalEndpoint(new Vec2(0, 0), 0);

  assert.equal((engine as any).passesDirectionRule(new Vec2(0, 4), endpoint, 'frontOnly'), true);
  assert.equal((engine as any).passesDirectionRule(new Vec2(0, -4), endpoint, 'frontOnly'), false);
  assert.equal((engine as any).passesDirectionRule(new Vec2(0, -4), endpoint, 'backOnly'), true);
  assert.equal((engine as any).passesDirectionRule(new Vec2(0, 4), endpoint, 'backOnly'), false);
});

test('portal exit heading can force forward or backward travel along the destination tangent', () => {
  const engine = new PhysicsEngine(new Rider(new Vec2(0, 0)), new SpatialGrid(), () => []);
  const store = new TrackStore();
  const pair = store.addPortalPair(new Vec2(0, 0), new Vec2(50, 0), {
    entryRotation: 0,
    exitRotation: Math.PI / 2,
  });
  assert.ok(pair);

  const forward = store.updatePortalPhysics(pair!.id, { exitDirection: 'forward' });
  const forwardVelocity = (engine as any).mapPortalExitVelocity(
    new Vec2(6, 0),
    new Vec2(6, 0),
    new Vec2(0, 1),
    new Vec2(-1, 0),
    forward,
  ) as Vec2;
  assert.ok(forwardVelocity.y > 5.9, `expected forward exit along +tangent, got ${forwardVelocity.x}, ${forwardVelocity.y}`);
  assert.ok(Math.abs(forwardVelocity.x) < 1e-6);

  const backward = store.updatePortalPhysics(pair!.id, { exitDirection: 'backward' });
  const backwardVelocity = (engine as any).mapPortalExitVelocity(
    new Vec2(6, 0),
    new Vec2(6, 0),
    new Vec2(0, 1),
    new Vec2(-1, 0),
    backward,
  ) as Vec2;
  assert.ok(backwardVelocity.y < -5.9, `expected backward exit along -tangent, got ${backwardVelocity.x}, ${backwardVelocity.y}`);
  assert.ok(Math.abs(backwardVelocity.x) < 1e-6);
});
