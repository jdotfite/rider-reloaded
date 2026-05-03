import { Vec2 } from '../math/Vec2';
import { Line } from '../physics/lines/Line';
import { LineOptions } from '../physics/lines/Line';
import { LineType } from '../physics/lines/LineTypes';
import { SolidLine } from '../physics/lines/SolidLine';
import { AccLine } from '../physics/lines/AccLine';
import { SceneryLine } from '../physics/lines/SceneryLine';
import {
  BezierPath, BezierAnchor,
  SerializedBezierPath, serializeAnchor, deserializeAnchor,
  cloneBezierPath,
} from './BezierPath';
import { generateSegmentsFromPath } from '../math/bezier-path';
import {
  PortalPair,
  PortalEndpointKey,
  PortalMode,
  PortalPhysics,
  PortalVisual,
  SerializedPortalPair,
  clonePortalPair,
  clonePortalEndpoint,
  createPortalEndpoint,
  serializePortalPair,
  MIN_PORTAL_LENGTH,
  MAX_PORTAL_LENGTH,
  MIN_PORTAL_RADIUS,
  MAX_PORTAL_RADIUS,
} from './PortalTypes';
import { distanceSqToPortalVisibleShape, rotateVec } from '../portal/portalMath';

export interface SerializedTrackLine {
  id: number;
  type: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flipped?: 1;
  accelFlipped?: 0 | 1;
  extended?: 1;
  leftExtended?: 1;
  rightExtended?: 1;
  layer: number;
  multiplier?: number;
}

export interface SerializedTrackLayer {
  id: number;
  name: string;
  visible: boolean;
  editable: boolean;
}

export interface TrackLayer {
  id: number;
  name: string;
  visible: boolean;
  editable: boolean;
}

// Legacy format for migration
interface SerializedCurveGroup {
  id: number;
  lineIds: number[];
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
}

export interface SerializedTrack {
  version: string;
  label: string;
  creator: string;
  startPosition: { x: number; y: number };
  riders?: Array<{ startPosition: { x: number; y: number } }>;
  layers: SerializedTrackLayer[];
  lines: SerializedTrackLine[];
  curveGroups?: SerializedCurveGroup[];
  bezierPaths?: SerializedBezierPath[];
  portals?: SerializedPortalPair[];
}

interface TrackSnapshot {
  lines: Line[];
  startPosition: Vec2;
  layers: TrackLayer[];
  activeLayerId: number;
  bezierPaths: BezierPath[];
  portals: PortalPair[];
}

interface NormalizedTrackLine {
  id?: number;
  type: LineType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flipped: boolean;
  accelFlipped: boolean;
  leftExtended: boolean;
  rightExtended: boolean;
  layer: number;
  multiplier?: number;
}

interface NormalizedTrack {
  startPosition: Vec2;
  layers: TrackLayer[];
  lines: NormalizedTrackLine[];
}

export class TrackStore {
  lines: Line[] = [];
  startPosition: Vec2 = new Vec2(0, 0);
  layers: TrackLayer[] = [this.createDefaultLayer()];
  activeLayerId = 0;
  bezierPaths: BezierPath[] = [];
  nextBezierPathId = 0;
  portals: PortalPair[] = [];
  nextPortalId = 0;

  /** Fires on every mutation (addLine, removeLines, replaceLine, etc.) */
  onMutation: (() => void) | null = null;

  private undoStack: TrackSnapshot[] = [];
  private redoStack: TrackSnapshot[] = [];
  private transactionSnapshot: TrackSnapshot | null = null;
  private transactionChanged = false;

  addLine(p1: Vec2, p2: Vec2, type: LineType): Line | null {
    if (!this.canEditActiveLayer()) return null;
    const line = this.createLine(p1, p2, type, { layer: this.activeLayerId });
    this.beginMutation();
    this.lines.push(line);
    return line;
  }

  addLines(segments: Array<{ p1: Vec2; p2: Vec2 }>, type: LineType): Line[] {
    if (segments.length === 0 || !this.canEditActiveLayer()) return [];
    this.beginMutation();
    const added: Line[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const line = this.createLine(seg.p1, seg.p2, type, {
        leftExtended: i > 0,
        rightExtended: i < segments.length - 1,
        layer: this.activeLayerId,
      });
      this.lines.push(line);
      added.push(line);
    }
    return added;
  }

  pasteLines(lines: Array<{
    p1: Vec2;
    p2: Vec2;
    type: LineType;
    flipped?: boolean;
    accelFlipped?: boolean;
    leftExtended?: boolean;
    rightExtended?: boolean;
    multiplier?: number;
    layer?: number;
  }>): Line[] {
    if (lines.length === 0 || !this.canEditActiveLayer()) return [];
    this.beginMutation();
    const added: Line[] = [];
    for (const line of lines) {
      const pastedLine = this.createLine(line.p1, line.p2, line.type, {
        flipped: line.flipped,
        accelFlipped: line.accelFlipped,
        leftExtended: line.leftExtended,
        rightExtended: line.rightExtended,
        layer: line.layer ?? this.activeLayerId,
        multiplier: line.multiplier,
      });
      this.lines.push(pastedLine);
      added.push(pastedLine);
    }
    return added;
  }

  flipLine(lineId: number): Line | null {
    const existing = this.lines.find(l => l.id === lineId);
    if (!existing) return null;
    this.beginMutation();
    const flipped = this.createLine(existing.p1, existing.p2, existing.type, {
      id: existing.id,
      flipped: !existing.flipped,
      accelFlipped: existing instanceof AccLine ? existing.accelFlipped : undefined,
      leftExtended: existing.leftExtended,
      rightExtended: existing.rightExtended,
      layer: existing.layer,
      multiplier: existing instanceof AccLine ? (existing as AccLine).multiplier : undefined,
    });
    this.lines = this.lines.map(l => l.id === lineId ? flipped : l);
    return flipped;
  }

  reverseAccelLine(lineId: number): Line | null {
    const existing = this.lines.find(l => l.id === lineId);
    if (!(existing instanceof AccLine)) return null;
    this.beginMutation();
    const reversed = this.createLine(existing.p1, existing.p2, existing.type, {
      id: existing.id,
      flipped: existing.flipped,
      accelFlipped: !existing.accelFlipped,
      leftExtended: existing.leftExtended,
      rightExtended: existing.rightExtended,
      layer: existing.layer,
      multiplier: existing.multiplier,
    });
    this.lines = this.lines.map(l => l.id === lineId ? reversed : l);
    return reversed;
  }

  replaceLine(lineId: number, p1: Vec2, p2: Vec2): Line | null {
    const existing = this.lines.find(l => l.id === lineId);
    if (!existing) return null;
    this.beginMutation();
    const replacement = this.createLine(p1, p2, existing.type, {
      id: existing.id,
      flipped: existing.flipped,
      accelFlipped: existing instanceof AccLine ? existing.accelFlipped : undefined,
      leftExtended: existing.leftExtended,
      rightExtended: existing.rightExtended,
      layer: existing.layer,
      multiplier: existing instanceof AccLine ? (existing as AccLine).multiplier : undefined,
    });
    this.lines = this.lines.map(l => l.id === lineId ? replacement : l);
    return replacement;
  }

  removeLinesNear(point: Vec2, radius: number): number {
    if (this.lines.length === 0 || !this.canEditActiveLayer()) return 0;

    const radiusSq = radius * radius;
    const nextLines = this.lines.filter(line => {
      if (line.layer !== this.activeLayerId) return true;
      return line.distanceToPointSq(point) > radiusSq;
    });
    const removed = this.lines.length - nextLines.length;
    if (removed === 0) return 0;

    const removedIds = new Set<number>();
    for (const line of this.lines) {
      if (line.layer === this.activeLayerId && line.distanceToPointSq(point) <= radiusSq) {
        removedIds.add(line.id);
      }
    }

    this.beginMutation();
    this.lines = nextLines;
    this.invalidateBezierPaths(removedIds);
    return removed;
  }

  removePortalsNear(point: Vec2, radius: number): number {
    if (this.portals.length === 0 || !this.canEditActiveLayer()) return 0;
    const toRemove = this.portals.filter(portal => {
      if (portal.layer !== this.activeLayerId) return false;
      return (
        distanceSqToPortalVisibleShape(point, portal.entry, radius) <= 0 ||
        distanceSqToPortalVisibleShape(point, portal.exit, radius) <= 0
      );
    });
    if (toRemove.length === 0) return 0;

    const removeIds = new Set(toRemove.map(portal => portal.id));
    this.beginMutation();
    this.portals = this.portals.filter(portal => !removeIds.has(portal.id));
    return removeIds.size;
  }

  clear(): boolean {
    const mainLayer = this.layers[0];
    const alreadyDefault =
      this.lines.length === 0 &&
      this.portals.length === 0 &&
      this.layers.length === 1 &&
      mainLayer.id === 0 &&
      mainLayer.name === 'Main' &&
      mainLayer.visible &&
      mainLayer.editable &&
      this.activeLayerId === 0;
    if (alreadyDefault) return false;

    this.beginMutation();
    this.lines = [];
    this.layers = [this.createDefaultLayer()];
    this.activeLayerId = 0;
    this.bezierPaths = [];
    this.nextBezierPathId = 0;
    this.portals = [];
    this.nextPortalId = 0;
    return true;
  }

  setStartPosition(position: Vec2): boolean {
    if (this.startPosition.distanceToSq(position) === 0) return false;
    this.beginMutation();
    this.startPosition = position.clone();
    return true;
  }

  getActiveLayer(): TrackLayer {
    return this.layers.find(layer => layer.id === this.activeLayerId) ?? this.layers[0];
  }

  getActiveLayerIndex(): number {
    return Math.max(0, this.layers.findIndex(layer => layer.id === this.activeLayerId));
  }

  createLayer(): TrackLayer {
    const nextId = this.layers.reduce((maxId, layer) => Math.max(maxId, layer.id), -1) + 1;
    const layer: TrackLayer = {
      id: nextId,
      name: `Layer ${this.layers.length + 1}`,
      visible: true,
      editable: true,
    };

    this.beginMutation();
    this.layers = [...this.layers, layer];
    this.activeLayerId = layer.id;
    return layer;
  }

  cycleActiveLayer(direction: 1 | -1): TrackLayer {
    const index = Math.max(0, this.layers.findIndex(layer => layer.id === this.activeLayerId));
    const nextIndex = (index + direction + this.layers.length) % this.layers.length;
    const nextLayer = this.layers[nextIndex];

    if (nextLayer.id === this.activeLayerId) {
      return nextLayer;
    }

    this.beginMutation();
    this.activeLayerId = nextLayer.id;
    return nextLayer;
  }

  toggleActiveLayerVisibility(): TrackLayer {
    const activeLayer = this.getActiveLayer();
    this.beginMutation();
    this.layers = this.layers.map(layer =>
      layer.id === activeLayer.id ? { ...layer, visible: !layer.visible } : layer
    );
    return this.getActiveLayer();
  }

  toggleActiveLayerEditability(): TrackLayer {
    const activeLayer = this.getActiveLayer();
    this.beginMutation();
    this.layers = this.layers.map(layer =>
      layer.id === activeLayer.id ? { ...layer, editable: !layer.editable } : layer
    );
    return this.getActiveLayer();
  }

  moveActiveLayer(direction: 1 | -1): TrackLayer {
    const currentIndex = this.getActiveLayerIndex();
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= this.layers.length) {
      return this.getActiveLayer();
    }

    this.beginMutation();
    const nextLayers = [...this.layers];
    const [activeLayer] = nextLayers.splice(currentIndex, 1);
    nextLayers.splice(targetIndex, 0, activeLayer);
    this.layers = nextLayers;
    return this.getActiveLayer();
  }

  deleteActiveLayer(): boolean {
    if (this.layers.length <= 1) return false; // Must keep at least one layer

    const activeId = this.activeLayerId;
    const activeIndex = this.getActiveLayerIndex();

    this.beginMutation();

    // Remove lines and bezier paths on this layer
    this.lines = this.lines.filter(l => l.layer !== activeId);
    this.bezierPaths = this.bezierPaths.filter(p => p.layer !== activeId);
    this.portals = this.portals.filter(p => p.layer !== activeId);

    // Remove the layer
    this.layers = this.layers.filter(l => l.id !== activeId);

    // Switch to nearest remaining layer
    const nextIndex = Math.min(activeIndex, this.layers.length - 1);
    this.activeLayerId = this.layers[nextIndex].id;

    return true;
  }

  reorderLayer(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= this.layers.length) return;
    if (toIndex < 0 || toIndex >= this.layers.length) return;
    if (fromIndex === toIndex) return;

    this.beginMutation();
    const nextLayers = [...this.layers];
    const [moved] = nextLayers.splice(fromIndex, 1);
    nextLayers.splice(toIndex, 0, moved);
    this.layers = nextLayers;
  }

  renameActiveLayer(name: string): TrackLayer {
    const nextName = name.trim();
    const activeLayer = this.getActiveLayer();
    if (!nextName || nextName === activeLayer.name) {
      return activeLayer;
    }

    this.beginMutation();
    this.layers = this.layers.map(layer =>
      layer.id === activeLayer.id ? { ...layer, name: nextName } : layer
    );
    return this.getActiveLayer();
  }

  serialize(): SerializedTrack {
    return {
      version: '6.5',
      label: 'Untitled Track',
      creator: 'Rider Reloaded',
      startPosition: {
        x: this.startPosition.x,
        y: this.startPosition.y,
      },
      riders: [{
        startPosition: {
          x: this.startPosition.x,
          y: this.startPosition.y,
        },
      }],
      layers: this.layers.map(layer => ({ ...layer })),
      lines: this.lines.map(line => ({
        id: line.id,
        type: this.encodeLineType(line.type),
        x1: line.p1.x,
        y1: line.p1.y,
        x2: line.p2.x,
        y2: line.p2.y,
        flipped: line.flipped ? 1 : undefined,
        accelFlipped: line instanceof AccLine ? (line.accelFlipped ? 1 : 0) : undefined,
        extended: line.leftExtended || line.rightExtended ? 1 : undefined,
        leftExtended: line.leftExtended ? 1 : undefined,
        rightExtended: line.rightExtended ? 1 : undefined,
        layer: line.layer,
        multiplier: line instanceof AccLine && line.multiplier !== 1 ? line.multiplier : undefined,
      })),
      bezierPaths: this.bezierPaths.map(p => ({
        id: p.id,
        anchors: p.anchors.map(serializeAnchor),
        lineType: this.encodeLineType(p.lineType),
        flipped: p.flipped,
        accelFlipped: p.accelFlipped,
        layer: p.layer,
        lineIds: [...p.lineIds],
      })),
      portals: this.portals.map(serializePortalPair),
    };
  }

  load(track: unknown): boolean {
    const normalizedTrack = this.normalizeTrack(track);
    if (!normalizedTrack) return false;

    const loadedLines = normalizedTrack.lines.map(line => this.createLine(
      new Vec2(line.x1, line.y1),
      new Vec2(line.x2, line.y2),
      line.type,
      {
        id: line.id,
        flipped: line.flipped,
        accelFlipped: line.accelFlipped,
        leftExtended: line.leftExtended,
        rightExtended: line.rightExtended,
        layer: line.layer,
        multiplier: line.multiplier,
      }
    ));

    const candidate = track as Record<string, unknown>;

    // Load new bezierPaths format
    let loadedPaths: BezierPath[] = [];
    if (Array.isArray(candidate.bezierPaths)) {
      for (const sp of candidate.bezierPaths) {
        if (sp && typeof sp === 'object' &&
          typeof sp.id === 'number' &&
          Array.isArray(sp.anchors) &&
          Array.isArray(sp.lineIds)) {
          const lineType = this.decodeLineType(sp.lineType);
          if (!lineType) continue;
          const firstLine = loadedLines.find(l => sp.lineIds.includes(l.id));
          const inferredFlipped = firstLine?.flipped ?? false;
          const inferredAccelFlipped = firstLine instanceof AccLine ? firstLine.accelFlipped : inferredFlipped;
          loadedPaths.push({
            id: sp.id,
            anchors: sp.anchors.map((a: any) => deserializeAnchor(a)),
            lineType,
            flipped: typeof sp.flipped === 'boolean' ? sp.flipped : inferredFlipped,
            accelFlipped: typeof sp.accelFlipped === 'boolean' ? sp.accelFlipped : inferredAccelFlipped,
            layer: typeof sp.layer === 'number' ? sp.layer : 0,
            lineIds: sp.lineIds,
          });
        }
      }
    }
    // Migrate legacy curveGroups if no bezierPaths present
    else if (Array.isArray(candidate.curveGroups)) {
      for (const g of candidate.curveGroups as any[]) {
        if (g && typeof g === 'object' &&
          typeof g.id === 'number' &&
          Array.isArray(g.lineIds) &&
          g.startPoint && g.endPoint && g.cp1 && g.cp2) {
          // Find the line type from existing lines
          const firstLine = loadedLines.find(l => g.lineIds.includes(l.id));
          const lineType = firstLine?.type ?? LineType.SOLID;
          const flipped = firstLine?.flipped ?? false;
          const accelFlipped = firstLine instanceof AccLine ? firstLine.accelFlipped : flipped;
          const layer = firstLine?.layer ?? 0;

          const start = new Vec2(g.startPoint.x, g.startPoint.y);
          const end = new Vec2(g.endPoint.x, g.endPoint.y);
          const cp1 = new Vec2(g.cp1.x, g.cp1.y);
          const cp2 = new Vec2(g.cp2.x, g.cp2.y);

          loadedPaths.push({
            id: g.id,
            anchors: [
              {
                position: start,
                handleIn: new Vec2(0, 0),
                handleOut: cp1.sub(start),
                smooth: true,
              },
              {
                position: end,
                handleIn: cp2.sub(end),
                handleOut: new Vec2(0, 0),
                smooth: true,
              },
            ],
            lineType,
            flipped,
            accelFlipped,
            layer,
            lineIds: [...g.lineIds],
          });
        }
      }
    }

    const loadedPortals = this.normalizePortals(candidate.portals, normalizedTrack.layers);

    this.beginMutation();
    this.startPosition = normalizedTrack.startPosition;
    this.layers = normalizedTrack.layers;
    this.activeLayerId = this.getPreferredActiveLayerId(normalizedTrack.layers);
    this.lines = loadedLines;
    this.bezierPaths = loadedPaths;
    this.nextBezierPathId = loadedPaths.reduce((max, p) => Math.max(max, p.id + 1), 0);
    this.portals = loadedPortals;
    this.nextPortalId = loadedPortals.reduce((max, p) => Math.max(max, p.id + 1), 0);
    return true;
  }

  // ── BezierPath methods ──

  addBezierPath(
    anchors: BezierAnchor[],
    lineType: LineType,
    layer: number,
    options: Partial<Pick<BezierPath, 'flipped' | 'accelFlipped'>> = {},
  ): BezierPath {
    const path: BezierPath = {
      id: this.nextBezierPathId++,
      anchors,
      lineType,
      flipped: options.flipped ?? false,
      accelFlipped: options.accelFlipped ?? false,
      layer,
      lineIds: [],
    };

    // Generate segments
    const segments = generateSegmentsFromPath(path);
    this.beginMutation();
    const added: number[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const line = this.createLine(seg.p1, seg.p2, lineType, {
        flipped: path.flipped,
        accelFlipped: path.accelFlipped,
        leftExtended: i > 0,
        rightExtended: i < segments.length - 1,
        layer,
      });
      this.lines.push(line);
      added.push(line.id);
    }
    path.lineIds = added;
    this.bezierPaths.push(path);
    return path;
  }

  regenerateBezierPathLines(pathId: number) {
    const pathIndex = this.bezierPaths.findIndex(p => p.id === pathId);
    if (pathIndex === -1) return;
    const path = this.bezierPaths[pathIndex];

    const segments = generateSegmentsFromPath(path);

    // Find the line type and layer from existing segments (in case they changed)
    const lineType = path.lineType;
    const layer = path.layer;

    // Detach path before removing to prevent invalidation from destroying it
    this.bezierPaths.splice(pathIndex, 1);

    // Remove old segments
    const oldIds = new Set(path.lineIds);
    this.lines = this.lines.filter(l => !oldIds.has(l.id));

    // Add new segments
    const added: number[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const line = this.createLine(seg.p1, seg.p2, lineType, {
        flipped: path.flipped,
        accelFlipped: path.accelFlipped,
        leftExtended: i > 0,
        rightExtended: i < segments.length - 1,
        layer,
      });
      this.lines.push(line);
      added.push(line.id);
    }

    path.lineIds = added;
    this.bezierPaths.push(path);
    this.onMutation?.();
  }

  flipBezierPath(pathId: number): boolean {
    const path = this.bezierPaths.find(p => p.id === pathId);
    if (!path) return false;
    this.beginMutation();
    path.flipped = !path.flipped;
    this.regenerateBezierPathLines(path.id);
    return true;
  }

  reverseBezierPathAccel(pathId: number): boolean {
    const path = this.bezierPaths.find(p => p.id === pathId);
    if (!path || path.lineType !== LineType.ACC) return false;
    this.beginMutation();
    path.accelFlipped = !path.accelFlipped;
    this.regenerateBezierPathLines(path.id);
    return true;
  }

  findBezierPathForLine(lineId: number): BezierPath | null {
    return this.bezierPaths.find(p => p.lineIds.includes(lineId)) ?? null;
  }

  getBezierPathsForLineSelection(lineIds: Iterable<number>): BezierPath[] {
    const selectedIds = lineIds instanceof Set ? lineIds : new Set(lineIds);
    return this.bezierPaths.filter(path => path.lineIds.some(id => selectedIds.has(id)));
  }

  expandLineSelectionToWholeBezierPaths(lineIds: Iterable<number>): Set<number> {
    const expanded = lineIds instanceof Set ? new Set(lineIds) : new Set(lineIds);
    for (const path of this.getBezierPathsForLineSelection(expanded)) {
      for (const id of path.lineIds) {
        expanded.add(id);
      }
    }
    return expanded;
  }

  // Portal methods

  addPortalPair(
    entryPosition: Vec2,
    exitPosition: Vec2,
    options: {
      entryRotation?: number;
      exitRotation?: number;
      mode?: PortalMode;
    } = {},
  ): PortalPair | null {
    if (!this.canEditActiveLayer()) return null;
    const pair: PortalPair = {
      id: this.nextPortalId++,
      layer: this.activeLayerId,
      name: `Portal ${this.nextPortalId}`,
      enabled: true,
      mode: options.mode ?? 'oneWay',
      entry: createPortalEndpoint(entryPosition, options.entryRotation ?? 0),
      exit: createPortalEndpoint(exitPosition, options.exitRotation ?? 0),
      physics: this.createDefaultPortalPhysics(),
      visual: this.createDefaultPortalVisual(),
    };
    this.beginMutation();
    this.portals = [...this.portals, pair];
    return pair;
  }

  getPortalById(id: number): PortalPair | null {
    return this.portals.find(portal => portal.id === id) ?? null;
  }

  removePortalPair(id: number): boolean {
    if (!this.portals.some(portal => portal.id === id)) return false;
    this.beginMutation();
    this.portals = this.portals.filter(portal => portal.id !== id);
    return true;
  }

  getPortalEndpointAt(
    point: Vec2,
    radius: number,
  ): { portalId: number; endpoint: PortalEndpointKey } | null {
    const radiusSq = radius * radius;
    let bestDist = radiusSq;
    let best: { portalId: number; endpoint: PortalEndpointKey } | null = null;
    for (const portal of this.portals) {
      if (portal.layer !== this.activeLayerId) continue;
      for (const endpointKey of ['entry', 'exit'] as const) {
        const endpoint = portal[endpointKey];
        const d = point.distanceToSq(endpoint.position);
        if (d < bestDist) {
          bestDist = d;
          best = { portalId: portal.id, endpoint: endpointKey };
        }
      }
    }
    return best;
  }

  getPortalAt(point: Vec2, radius: number): PortalPair | null {
    let bestPortal: PortalPair | null = null;
    let bestDist = radius * radius;
    for (const portal of this.portals) {
      if (portal.layer !== this.activeLayerId) continue;
      const entryDist = distanceSqToPortalVisibleShape(point, portal.entry, radius);
      if (entryDist <= bestDist) {
        bestDist = entryDist;
        bestPortal = portal;
      }
      const exitDist = distanceSqToPortalVisibleShape(point, portal.exit, radius);
      if (exitDist <= bestDist) {
        bestDist = exitDist;
        bestPortal = portal;
      }
    }
    return bestPortal;
  }

  updatePortalEndpoint(
    portalId: number,
    endpointKey: PortalEndpointKey,
    patch: Partial<{ position: Vec2; rotation: number; length: number; radius: number }>,
  ): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing) return null;
    const nextLength = patch.length == null ? existing[endpointKey].length : this.clamp(patch.length, MIN_PORTAL_LENGTH, MAX_PORTAL_LENGTH);
    const nextRadius = patch.radius == null ? existing[endpointKey].radius : this.clamp(patch.radius, MIN_PORTAL_RADIUS, MAX_PORTAL_RADIUS);
    this.beginMutation();
    this.portals = this.portals.map(portal => {
      if (portal.id !== portalId) return portal;
      return {
        ...portal,
        [endpointKey]: {
          ...portal[endpointKey],
          position: patch.position ? patch.position.clone() : portal[endpointKey].position,
          rotation: patch.rotation ?? portal[endpointKey].rotation,
          length: nextLength,
          radius: nextRadius,
        },
      };
    });
    return this.getPortalById(portalId);
  }

  movePortalPair(portalId: number, dx: number, dy: number): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing || (dx === 0 && dy === 0)) return existing;
    const offset = new Vec2(dx, dy);
    this.beginMutation();
    this.portals = this.portals.map(portal => {
      if (portal.id !== portalId) return portal;
      return {
        ...portal,
        entry: {
          ...portal.entry,
          position: portal.entry.position.add(offset),
        },
        exit: {
          ...portal.exit,
          position: portal.exit.position.add(offset),
        },
      };
    });
    return this.getPortalById(portalId);
  }

  rotatePortalPair(portalId: number, angleDelta: number, pivot?: Vec2): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing || angleDelta === 0) return existing;
    const center = pivot?.clone() ?? existing.entry.position.lerp(existing.exit.position, 0.5);
    this.beginMutation();
    this.portals = this.portals.map(portal => {
      if (portal.id !== portalId) return portal;
      const rotateEndpoint = (endpoint: PortalPair['entry']) => ({
        ...endpoint,
        position: center.add(rotateVec(endpoint.position.sub(center), angleDelta)),
        rotation: endpoint.rotation + angleDelta,
      });
      return {
        ...portal,
        entry: rotateEndpoint(portal.entry),
        exit: rotateEndpoint(portal.exit),
      };
    });
    return this.getPortalById(portalId);
  }

  swapPortalEndpoints(portalId: number): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing) return null;
    this.beginMutation();
    this.portals = this.portals.map(portal => {
      if (portal.id !== portalId) return portal;
      return {
        ...portal,
        entry: clonePortalEndpoint(portal.exit),
        exit: clonePortalEndpoint(portal.entry),
      };
    });
    return this.getPortalById(portalId);
  }

  duplicatePortalPair(portalId: number, dx: number, dy: number): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing || !this.canEditActiveLayer()) return null;
    const offset = new Vec2(dx, dy);
    const duplicate: PortalPair = {
      ...clonePortalPair(existing),
      id: this.nextPortalId++,
      layer: this.activeLayerId,
      name: `Portal ${this.nextPortalId}`,
      entry: {
        ...clonePortalPair(existing).entry,
        position: existing.entry.position.add(offset),
      },
      exit: {
        ...clonePortalPair(existing).exit,
        position: existing.exit.position.add(offset),
      },
    };
    this.beginMutation();
    this.portals = [...this.portals, duplicate];
    return duplicate;
  }

  setPortalMode(portalId: number, mode: PortalMode): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing || existing.mode === mode) return existing;
    this.beginMutation();
    this.portals = this.portals.map(portal => portal.id === portalId ? { ...portal, mode } : portal);
    return this.getPortalById(portalId);
  }

  updatePortalPhysics(portalId: number, patch: Partial<PortalPhysics>): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing) return null;
    const physics: PortalPhysics = {
      ...existing.physics,
      ...patch,
      speedMultiplier: patch.speedMultiplier == null
        ? existing.physics.speedMultiplier
        : this.clamp(patch.speedMultiplier, 0.25, 3),
      cooldownFrames: patch.cooldownFrames == null
        ? existing.physics.cooldownFrames
        : Math.round(this.clamp(patch.cooldownFrames, 0, 60)),
    };
    this.beginMutation();
    this.portals = this.portals.map(portal => portal.id === portalId ? { ...portal, physics } : portal);
    return this.getPortalById(portalId);
  }

  updatePortalVisual(portalId: number, patch: Partial<PortalVisual>): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing) return null;
    this.beginMutation();
    this.portals = this.portals.map(portal => portal.id === portalId
      ? { ...portal, visual: { ...portal.visual, ...patch } }
      : portal);
    return this.getPortalById(portalId);
  }

  setPortalEnabled(portalId: number, enabled: boolean): PortalPair | null {
    const existing = this.getPortalById(portalId);
    if (!existing || existing.enabled === enabled) return existing;
    this.beginMutation();
    this.portals = this.portals.map(portal => portal.id === portalId ? { ...portal, enabled } : portal);
    return this.getPortalById(portalId);
  }

  // ── Transactions & Undo ──

  beginTransaction() {
    if (this.transactionSnapshot) return;
    this.transactionSnapshot = this.captureSnapshot();
    this.transactionChanged = false;
  }

  endTransaction() {
    if (!this.transactionSnapshot) return;
    if (this.transactionChanged) {
      this.undoStack.push(this.transactionSnapshot);
      this.trimUndo();
      this.redoStack.length = 0;
    }
    this.transactionSnapshot = null;
    this.transactionChanged = false;
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.cancelTransaction();
    this.redoStack.push(this.captureSnapshot());
    this.applySnapshot(this.undoStack.pop()!);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.cancelTransaction();
    this.undoStack.push(this.captureSnapshot());
    this.applySnapshot(this.redoStack.pop()!);
  }

  private beginMutation() {
    if (this.transactionSnapshot) {
      this.transactionChanged = true;
    } else {
      this.undoStack.push(this.captureSnapshot());
      this.trimUndo();
      this.redoStack.length = 0;
    }
    this.onMutation?.();
  }

  private trimUndo() {
    if (this.undoStack.length > 200) {
      this.undoStack.shift();
    }
  }

  private cancelTransaction() {
    this.transactionSnapshot = null;
    this.transactionChanged = false;
  }

  private captureSnapshot(): TrackSnapshot {
    return {
      lines: [...this.lines],
      startPosition: this.startPosition.clone(),
      layers: this.layers.map(layer => ({ ...layer })),
      activeLayerId: this.activeLayerId,
      bezierPaths: this.bezierPaths.map(cloneBezierPath),
      portals: this.portals.map(clonePortalPair),
    };
  }

  private applySnapshot(snapshot: TrackSnapshot) {
    this.lines = [...snapshot.lines];
    this.startPosition = snapshot.startPosition.clone();
    this.layers = snapshot.layers.map(layer => ({ ...layer }));
    this.activeLayerId = snapshot.activeLayerId;
    this.bezierPaths = snapshot.bezierPaths.map(cloneBezierPath);
    this.portals = snapshot.portals.map(clonePortalPair);
  }

  createLinePublic(p1: Vec2, p2: Vec2, type: LineType, options: LineOptions = {}): Line {
    return this.createLine(p1, p2, type, options);
  }

  private createLine(p1: Vec2, p2: Vec2, type: LineType, options: LineOptions = {}): Line {
    switch (type) {
      case LineType.SOLID: return new SolidLine(p1, p2, options);
      case LineType.ACC: return new AccLine(p1, p2, options);
      case LineType.SCENERY: return new SceneryLine(p1, p2, options);
    }
  }

  private normalizeTrack(track: unknown): NormalizedTrack | null {
    if (!track || typeof track !== 'object') return null;

    const candidate = track as {
      startPosition?: { x?: unknown; y?: unknown };
      riders?: Array<{ startPosition?: { x?: unknown; y?: unknown } }>;
      layers?: Array<Record<string, unknown>>;
      lines?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(candidate.lines)) return null;

    // Support community format with riders array
    let x: number | undefined;
    let y: number | undefined;
    if (candidate.startPosition && typeof candidate.startPosition.x === 'number' && typeof candidate.startPosition.y === 'number') {
      x = candidate.startPosition.x;
      y = candidate.startPosition.y;
    } else if (Array.isArray(candidate.riders) && candidate.riders.length > 0) {
      const r = candidate.riders[0];
      if (r.startPosition && typeof r.startPosition.x === 'number' && typeof r.startPosition.y === 'number') {
        x = r.startPosition.x;
        y = r.startPosition.y;
      }
    }
    if (typeof x !== 'number' || typeof y !== 'number') return null;

    const layers = this.normalizeLayers(candidate.layers);
    if (!layers) return null;

    const normalizedLines: NormalizedTrackLine[] = [];
    const validLayerIds = new Set(layers.map(layer => layer.id));
    const fallbackLayerId = this.getPreferredActiveLayerId(layers);
    for (const line of candidate.lines) {
      if (!line || typeof line !== 'object') return null;

      const type = this.decodeLineType(line.type);
      if (!type) return null;

      if (
        typeof line.x1 !== 'number' ||
        typeof line.y1 !== 'number' ||
        typeof line.x2 !== 'number' ||
        typeof line.y2 !== 'number'
      ) {
        return null;
      }

      if (
        line.multiplier != null &&
        (typeof line.multiplier !== 'number' || !Number.isFinite(line.multiplier))
      ) {
        return null;
      }

      const accelFlipped = this.toBoolean(line.accelFlipped);
      if (line.accelFlipped != null && accelFlipped == null) {
        return null;
      }

      const extended = this.toBoolean(line.extended) ?? false;
      const leftExtended = this.toBoolean(line.leftExtended) ?? extended;
      const rightExtended = this.toBoolean(line.rightExtended) ?? extended;
      const flipped = this.toBoolean(line.flipped) ?? false;

      normalizedLines.push({
        id:
          typeof line.id === 'number' && Number.isFinite(line.id)
            ? line.id
            : undefined,
        type,
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        flipped,
        accelFlipped: type === LineType.ACC ? (accelFlipped ?? flipped) : false,
        leftExtended,
        rightExtended,
        layer:
          typeof line.layer === 'number' &&
          Number.isFinite(line.layer) &&
          validLayerIds.has(line.layer)
            ? line.layer
            : fallbackLayerId,
        multiplier: typeof line.multiplier === 'number' ? line.multiplier : undefined,
      });
    }

    return {
      startPosition: new Vec2(x, y),
      layers,
      lines: normalizedLines,
    };
  }

  private normalizeLayers(layers: Array<Record<string, unknown>> | undefined): TrackLayer[] | null {
    if (!layers || layers.length === 0) {
      return [this.createDefaultLayer()];
    }

    const normalizedLayers: TrackLayer[] = [];
    for (const layer of layers) {
      if (
        typeof layer.id !== 'number' ||
        !Number.isFinite(layer.id) ||
        typeof layer.name !== 'string'
      ) {
        return null;
      }

      normalizedLayers.push({
        id: layer.id,
        name: layer.name,
        visible: this.toBoolean(layer.visible) ?? true,
        editable: this.toBoolean(layer.editable) ?? true,
      });
    }

    if (normalizedLayers.length === 0) {
      return [this.createDefaultLayer()];
    }

    const fallbackLayer = normalizedLayers.find(layer => layer.visible && layer.editable)
      ?? normalizedLayers.find(layer => layer.editable)
      ?? normalizedLayers[0];
    fallbackLayer.visible = true;
    fallbackLayer.editable = true;

    return normalizedLayers;
  }

  private toBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return undefined;
  }

  private encodeLineType(type: LineType): number {
    switch (type) {
      case LineType.SOLID:
        return 0;
      case LineType.ACC:
        return 1;
      case LineType.SCENERY:
        return 2;
    }
  }

  private decodeLineType(type: unknown): LineType | null {
    if (type === LineType.SOLID || type === 0) return LineType.SOLID;
    if (type === LineType.ACC || type === 1) return LineType.ACC;
    if (type === LineType.SCENERY || type === 2) return LineType.SCENERY;
    return null;
  }

  private normalizePortals(portals: unknown, layers: TrackLayer[]): PortalPair[] {
    if (!Array.isArray(portals)) return [];
    const validLayerIds = new Set(layers.map(layer => layer.id));
    const fallbackLayerId = this.getPreferredActiveLayerId(layers);
    const normalized: PortalPair[] = [];
    for (const raw of portals) {
      if (!raw || typeof raw !== 'object') continue;
      const candidate = raw as SerializedPortalPair;
      const entry = this.normalizePortalEndpoint(candidate.entry);
      const exit = this.normalizePortalEndpoint(candidate.exit);
      if (!entry || !exit || typeof candidate.id !== 'number' || !Number.isFinite(candidate.id)) continue;
      normalized.push({
        id: candidate.id,
        layer: typeof candidate.layer === 'number' && validLayerIds.has(candidate.layer)
          ? candidate.layer
          : fallbackLayerId,
        name: typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name.trim()
          : `Portal ${candidate.id + 1}`,
        enabled: this.toBoolean(candidate.enabled) ?? true,
        mode: candidate.mode === 'twoWay' ? 'twoWay' : 'oneWay',
        entry,
        exit,
        physics: {
          velocityMode: candidate.physics?.velocityMode === 'world' ? 'world' : 'remap',
          speedMultiplier: this.clamp(
            typeof candidate.physics?.speedMultiplier === 'number' ? candidate.physics.speedMultiplier : 1,
            0.25,
            3,
          ),
          preserveLocalOffset: this.toBoolean(candidate.physics?.preserveLocalOffset) ?? false,
          entryDirectionRule:
            candidate.physics?.entryDirectionRule === 'frontOnly'
              ? 'frontOnly'
              : candidate.physics?.entryDirectionRule === 'backOnly'
                ? 'backOnly'
                : 'any',
          exitDirection:
            candidate.physics?.exitDirection === 'forward'
              ? 'forward'
              : candidate.physics?.exitDirection === 'backward'
                ? 'backward'
                : 'inherit',
          triggerBody:
            candidate.physics?.triggerBody === 'center'
              ? 'center'
              : candidate.physics?.triggerBody === 'front'
                ? 'front'
                : candidate.physics?.triggerBody === 'rear'
                  ? 'rear'
                  : 'auto',
          cooldownFrames: Math.round(this.clamp(
            typeof candidate.physics?.cooldownFrames === 'number' ? candidate.physics.cooldownFrames : 10,
            0,
            60,
          )),
          exitOffset: this.clamp(
            typeof candidate.physics?.exitOffset === 'number' ? candidate.physics.exitOffset : 3,
            0,
            30,
          ),
        },
        visual: {
          visibility:
            candidate.visual?.visibility === 'always'
              ? 'always'
              : candidate.visual?.visibility === 'activation'
                ? 'activation'
                : 'subtle',
          colorTheme:
            candidate.visual?.colorTheme === 'amber'
              ? 'amber'
              : candidate.visual?.colorTheme === 'mint'
                ? 'mint'
                : 'violet',
          showEditorLink: this.toBoolean(candidate.visual?.showEditorLink) ?? false,
          showDebug: this.toBoolean(candidate.visual?.showDebug) ?? false,
        },
      });
    }
    return normalized;
  }

  private normalizePortalEndpoint(endpoint: unknown) {
    if (!endpoint || typeof endpoint !== 'object') return null;
    const candidate = endpoint as {
      x?: unknown;
      y?: unknown;
      rotation?: unknown;
      length?: unknown;
      radius?: unknown;
    };
    if (
      typeof candidate.x !== 'number' ||
      typeof candidate.y !== 'number' ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y)
    ) {
      return null;
    }
    return {
      position: new Vec2(candidate.x, candidate.y),
      rotation: typeof candidate.rotation === 'number' && Number.isFinite(candidate.rotation) ? candidate.rotation : 0,
      length: this.clamp(
        typeof candidate.length === 'number' && Number.isFinite(candidate.length) ? candidate.length : 34,
        MIN_PORTAL_LENGTH,
        MAX_PORTAL_LENGTH,
      ),
      radius: this.clamp(
        typeof candidate.radius === 'number' && Number.isFinite(candidate.radius) ? candidate.radius : 10,
        MIN_PORTAL_RADIUS,
        MAX_PORTAL_RADIUS,
      ),
    };
  }

  private createDefaultPortalPhysics(): PortalPhysics {
    return {
      velocityMode: 'remap',
      speedMultiplier: 1,
      preserveLocalOffset: false,
      entryDirectionRule: 'any',
      exitDirection: 'inherit',
      triggerBody: 'auto',
      cooldownFrames: 10,
      exitOffset: 3,
    };
  }

  private createDefaultPortalVisual(): PortalVisual {
    return {
      visibility: 'subtle',
      colorTheme: 'violet',
      showEditorLink: false,
      showDebug: false,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private createDefaultLayer(): TrackLayer {
    return {
      id: 0,
      name: 'Main',
      visible: true,
      editable: true,
    };
  }

  private getPreferredActiveLayerId(layers: TrackLayer[]): number {
    return (
      layers.find(layer => layer.visible && layer.editable)
      ?? layers.find(layer => layer.visible)
      ?? layers.find(layer => layer.editable)
      ?? layers[0]
    ).id;
  }

  findNearestHandle(point: Vec2, radius: number): { lineId: number; endpoint: 'p1' | 'p2'; position: Vec2 } | null {
    let bestDist = radius * radius;
    let best: { lineId: number; endpoint: 'p1' | 'p2'; position: Vec2 } | null = null;
    for (const line of this.lines) {
      if (line.layer !== this.activeLayerId) continue;
      const d1 = point.distanceToSq(line.p1);
      if (d1 < bestDist) {
        bestDist = d1;
        best = { lineId: line.id, endpoint: 'p1', position: line.p1.clone() };
      }
      const d2 = point.distanceToSq(line.p2);
      if (d2 < bestDist) {
        bestDist = d2;
        best = { lineId: line.id, endpoint: 'p2', position: line.p2.clone() };
      }
    }
    return best;
  }

  findNearestEndpoint(
    point: Vec2,
    radius: number,
    excludeLineIds?: Set<number>,
    excludePortalIds?: Set<number>,
  ): Vec2 | null {
    let bestDist = radius * radius;
    let best: Vec2 | null = null;
    for (const line of this.lines) {
      if (excludeLineIds?.has(line.id)) continue;
      for (const p of [line.p1, line.p2]) {
        const d = point.distanceToSq(p);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
    }
    for (const portal of this.portals) {
      if (portal.layer !== this.activeLayerId) continue;
      if (excludePortalIds?.has(portal.id)) continue;
      for (const endpoint of [portal.entry, portal.exit]) {
        const d = point.distanceToSq(endpoint.position);
        if (d < bestDist) {
          bestDist = d;
          best = endpoint.position;
        }
      }
    }
    return best ? best.clone() : null;
  }

  getLineAt(point: Vec2, radius: number): Line | null {
    const radiusSq = radius * radius;
    let bestDist = radiusSq;
    let bestLine: Line | null = null;
    for (const line of this.lines) {
      if (line.layer !== this.activeLayerId) continue;
      const d = line.distanceToPointSq(point);
      if (d < bestDist) {
        bestDist = d;
        bestLine = line;
      }
    }
    return bestLine;
  }

  getLinesInRect(minX: number, minY: number, maxX: number, maxY: number): Line[] {
    return this.lines.filter(line => {
      if (line.layer !== this.activeLayerId) return false;
      const lx1 = Math.min(line.p1.x, line.p2.x);
      const lx2 = Math.max(line.p1.x, line.p2.x);
      const ly1 = Math.min(line.p1.y, line.p2.y);
      const ly2 = Math.max(line.p1.y, line.p2.y);
      return lx2 >= minX && lx1 <= maxX && ly2 >= minY && ly1 <= maxY;
    });
  }

  moveLines(lineIds: Set<number>, dx: number, dy: number) {
    if (lineIds.size === 0) return;
    this.beginMutation();
    const offset = new Vec2(dx, dy);
    this.lines = this.lines.map(line => {
      if (!lineIds.has(line.id)) return line;
      return this.createLine(
        line.p1.add(offset),
        line.p2.add(offset),
        line.type,
        {
          id: line.id,
          flipped: line.flipped,
          accelFlipped: line instanceof AccLine ? line.accelFlipped : undefined,
          leftExtended: line.leftExtended,
          rightExtended: line.rightExtended,
          layer: line.layer,
          multiplier: line instanceof AccLine ? (line as AccLine).multiplier : undefined,
        },
      );
    });
  }

  removeLines(lineIds: Set<number>) {
    if (lineIds.size === 0) return;
    this.beginMutation();
    this.lines = this.lines.filter(line => !lineIds.has(line.id));
    this.invalidateBezierPaths(lineIds);
  }

  /** Change the type of the given lines. Any touched bezier path is upgraded to a full-path change. */
  changeLineTypes(lineIds: Set<number>, newType: LineType) {
    const expandedIds = this.expandLineSelectionToWholeBezierPaths(lineIds);
    if (expandedIds.size === 0) return;
    const hasTypeChange = this.lines.some(line => expandedIds.has(line.id) && line.type !== newType);
    if (!hasTypeChange) return;
    const accelDefaults = new Map<number, boolean>();
    if (newType === LineType.ACC) {
      for (const line of this.lines) {
        if (!expandedIds.has(line.id)) continue;
        accelDefaults.set(
          line.id,
          line instanceof AccLine ? line.accelFlipped : line.flipped,
        );
      }
    }
    this.beginMutation();
    this.lines = this.lines.map(line => {
      if (!expandedIds.has(line.id) || line.type === newType) return line;
      return this.createLine(line.p1, line.p2, newType, {
        id: line.id,
        flipped: line.flipped,
        accelFlipped: accelDefaults.get(line.id),
        leftExtended: line.leftExtended,
        rightExtended: line.rightExtended,
        layer: line.layer,
        multiplier: line instanceof AccLine ? line.multiplier : undefined,
      });
    });
    this.bezierPaths = this.bezierPaths.filter(path => {
      const hasSelectedLine = path.lineIds.some(id => expandedIds.has(id));
      if (!hasSelectedLine) return true;
      path.lineType = newType;
      if (newType === LineType.ACC) {
        path.accelFlipped = path.flipped;
      }
      return true;
    });
  }

  /** Duplicate the given lines with an offset. Returns the duplicated lines. */
  duplicateLines(lineIds: Set<number>, dx: number, dy: number): Line[] {
    const toDuplicate = this.lines.filter(l => lineIds.has(l.id));
    if (toDuplicate.length === 0) return [];
    const offset = new Vec2(dx, dy);
    return this.pasteLines(toDuplicate.map(line => ({
      p1: line.p1.add(offset),
      p2: line.p2.add(offset),
      type: line.type,
      flipped: line.flipped,
      accelFlipped: line instanceof AccLine ? line.accelFlipped : undefined,
      leftExtended: line.leftExtended,
      rightExtended: line.rightExtended,
      multiplier: line instanceof AccLine ? line.multiplier : undefined,
    })));
  }

  private invalidateBezierPaths(removedIds: Set<number>) {
    this.bezierPaths = this.bezierPaths.filter(p =>
      !p.lineIds.some(id => removedIds.has(id))
    );
  }

  private canEditActiveLayer(): boolean {
    const activeLayer = this.getActiveLayer();
    return activeLayer.visible && activeLayer.editable;
  }
}
