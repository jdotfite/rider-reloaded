import test from 'node:test';
import assert from 'node:assert/strict';

import { Vec2 } from '../../src/math/Vec2';
import { PhysicsEngine } from '../../src/physics/PhysicsEngine';
import { SolidLine } from '../../src/physics/lines/SolidLine';
import { Rider } from '../../src/physics/Rider';
import { SpatialGrid } from '../../src/physics/grid/SpatialGrid';
import { createPortalEndpoint } from '../../src/store/PortalTypes';

test('portal exit safety nudges riders past blocking geometry', () => {
  const grid = new SpatialGrid();
  grid.rebuild([
    new SolidLine(new Vec2(-40, 14), new Vec2(40, 14)),
  ]);

  const engine = new PhysicsEngine(new Rider(new Vec2(0, 0)), grid, () => []);
  const endpoint = createPortalEndpoint(new Vec2(0, 0), 0);
  endpoint.radius = 10;

  const safePoint = (engine as any).resolveSafeExitPoint(endpoint, new Vec2(0, 12)) as Vec2;
  assert.ok(safePoint.y > 18, `expected safe point to move past blocking line, got y=${safePoint.y}`);
});

test('portal direction rules accept front and reject back movement as expected', () => {
  const engine = new PhysicsEngine(new Rider(new Vec2(0, 0)), new SpatialGrid(), () => []);
  const endpoint = createPortalEndpoint(new Vec2(0, 0), 0);

  assert.equal((engine as any).passesDirectionRule(new Vec2(0, 4), endpoint, 'frontOnly'), true);
  assert.equal((engine as any).passesDirectionRule(new Vec2(0, -4), endpoint, 'frontOnly'), false);
  assert.equal((engine as any).passesDirectionRule(new Vec2(0, -4), endpoint, 'backOnly'), true);
  assert.equal((engine as any).passesDirectionRule(new Vec2(0, 4), endpoint, 'backOnly'), false);
});
