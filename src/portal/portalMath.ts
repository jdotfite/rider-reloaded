import { Vec2 } from '../math/Vec2';
import type { PortalEndpoint } from '../store/PortalTypes';

export function rotateVec(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

export function portalTangent(rotation: number): Vec2 {
  return Vec2.fromAngle(rotation);
}

export function portalNormal(rotation: number): Vec2 {
  return portalTangent(rotation).perpCCW();
}

export function worldToPortalLocal(point: Vec2, endpoint: PortalEndpoint): Vec2 {
  const tangent = portalTangent(endpoint.rotation);
  const normal = portalNormal(endpoint.rotation);
  const delta = point.sub(endpoint.position);
  return new Vec2(delta.dot(tangent), delta.dot(normal));
}

export function portalLocalToWorld(local: Vec2, endpoint: PortalEndpoint): Vec2 {
  const tangent = portalTangent(endpoint.rotation);
  const normal = portalNormal(endpoint.rotation);
  return endpoint.position
    .add(tangent.scale(local.x))
    .add(normal.scale(local.y));
}

export function distanceSqToPortalCapsule(point: Vec2, endpoint: PortalEndpoint, padding = 0): number {
  const local = worldToPortalLocal(point, endpoint);
  const half = endpoint.length / 2;
  const clampedX = Math.max(-half, Math.min(half, local.x));
  const dx = local.x - clampedX;
  const dy = local.y;
  const radius = endpoint.radius + padding;
  const distSq = dx * dx + dy * dy;
  if (distSq <= radius * radius) return 0;
  return distSq - radius * radius;
}

export function pointInsidePortalCapsule(point: Vec2, endpoint: PortalEndpoint, padding = 0): boolean {
  return distanceSqToPortalCapsule(point, endpoint, padding) <= 0;
}
