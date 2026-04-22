import { Vec2 } from '../math/Vec2';

export type PortalEndpointKey = 'entry' | 'exit';
export type PortalMode = 'oneWay' | 'twoWay';
export type PortalVelocityMode = 'remap' | 'world';
export type PortalDirectionRule = 'any' | 'frontOnly';
export type PortalVisibility = 'subtle' | 'always';

export interface PortalEndpoint {
  position: Vec2;
  rotation: number;
  length: number;
  radius: number;
}

export interface PortalPhysics {
  velocityMode: PortalVelocityMode;
  speedMultiplier: number;
  preserveLocalOffset: boolean;
  entryDirectionRule: PortalDirectionRule;
  cooldownFrames: number;
}

export interface PortalVisual {
  visibility: PortalVisibility;
  colorTheme: 'violet';
  showEditorLink: boolean;
}

export interface PortalPair {
  id: number;
  layer: number;
  name: string;
  enabled: boolean;
  mode: PortalMode;
  entry: PortalEndpoint;
  exit: PortalEndpoint;
  physics: PortalPhysics;
  visual: PortalVisual;
}

export interface SerializedPortalEndpoint {
  x: number;
  y: number;
  rotation: number;
  length: number;
  radius: number;
}

export interface SerializedPortalPair {
  id: number;
  layer: number;
  name?: string;
  enabled?: boolean;
  mode?: string;
  entry: SerializedPortalEndpoint;
  exit: SerializedPortalEndpoint;
  physics?: {
    velocityMode?: string;
    speedMultiplier?: number;
    preserveLocalOffset?: boolean;
    entryDirectionRule?: string;
    cooldownFrames?: number;
  };
  visual?: {
    visibility?: string;
    colorTheme?: string;
    showEditorLink?: boolean;
  };
}

export const DEFAULT_PORTAL_LENGTH = 34;
export const DEFAULT_PORTAL_RADIUS = 10;
export const MIN_PORTAL_LENGTH = 18;
export const MAX_PORTAL_LENGTH = 84;
export const MIN_PORTAL_RADIUS = 6;
export const MAX_PORTAL_RADIUS = 28;

export function createPortalEndpoint(position: Vec2, rotation = 0): PortalEndpoint {
  return {
    position: position.clone(),
    rotation,
    length: DEFAULT_PORTAL_LENGTH,
    radius: DEFAULT_PORTAL_RADIUS,
  };
}

export function clonePortalEndpoint(endpoint: PortalEndpoint): PortalEndpoint {
  return {
    position: endpoint.position.clone(),
    rotation: endpoint.rotation,
    length: endpoint.length,
    radius: endpoint.radius,
  };
}

export function clonePortalPair(pair: PortalPair): PortalPair {
  return {
    id: pair.id,
    layer: pair.layer,
    name: pair.name,
    enabled: pair.enabled,
    mode: pair.mode,
    entry: clonePortalEndpoint(pair.entry),
    exit: clonePortalEndpoint(pair.exit),
    physics: { ...pair.physics },
    visual: { ...pair.visual },
  };
}

export function serializePortalPair(pair: PortalPair): SerializedPortalPair {
  return {
    id: pair.id,
    layer: pair.layer,
    name: pair.name || undefined,
    enabled: pair.enabled,
    mode: pair.mode,
    entry: serializePortalEndpoint(pair.entry),
    exit: serializePortalEndpoint(pair.exit),
    physics: { ...pair.physics },
    visual: { ...pair.visual },
  };
}

export function serializePortalEndpoint(endpoint: PortalEndpoint): SerializedPortalEndpoint {
  return {
    x: endpoint.position.x,
    y: endpoint.position.y,
    rotation: endpoint.rotation,
    length: endpoint.length,
    radius: endpoint.radius,
  };
}
