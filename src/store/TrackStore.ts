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

export interface SerializedTrackLine {
  id: number;
  type: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flipped?: 1;
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
}

interface TrackSnapshot {
  lines: Line[];
  startPosition: Vec2;
  layers: TrackLayer[];
  activeLayerId: number;
  bezierPaths: BezierPath[];
}

interface NormalizedTrackLine {
  type: LineType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flipped: boolean;
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

  flipLine(lineId: number): Line | null {
    const existing = this.lines.find(l => l.id === lineId);
    if (!existing) return null;
    this.beginMutation();
    const flipped = this.createLine(existing.p1, existing.p2, existing.type, {
      id: existing.id,
      flipped: !existing.flipped,
      leftExtended: existing.leftExtended,
      rightExtended: existing.rightExtended,
      layer: existing.layer,
      multiplier: existing instanceof AccLine ? (existing as AccLine).multiplier : undefined,
    });
    this.lines = this.lines.map(l => l.id === lineId ? flipped : l);
    return flipped;
  }

  replaceLine(lineId: number, p1: Vec2, p2: Vec2): Line | null {
    const existing = this.lines.find(l => l.id === lineId);
    if (!existing) return null;
    this.beginMutation();
    const replacement = this.createLine(p1, p2, existing.type, {
      id: existing.id,
      flipped: existing.flipped,
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

  clear(): boolean {
    const mainLayer = this.layers[0];
    const alreadyDefault =
      this.lines.length === 0 &&
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
      version: '6.2',
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
        layer: p.layer,
        lineIds: [...p.lineIds],
      })),
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
        flipped: line.flipped,
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
          loadedPaths.push({
            id: sp.id,
            anchors: sp.anchors.map((a: any) => deserializeAnchor(a)),
            lineType,
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
            layer,
            lineIds: [...g.lineIds],
          });
        }
      }
    }

    this.beginMutation();
    this.startPosition = normalizedTrack.startPosition;
    this.layers = normalizedTrack.layers;
    this.activeLayerId = this.getPreferredActiveLayerId(normalizedTrack.layers);
    this.lines = loadedLines;
    this.bezierPaths = loadedPaths;
    this.nextBezierPathId = loadedPaths.reduce((max, p) => Math.max(max, p.id + 1), 0);
    return true;
  }

  // ── BezierPath methods ──

  addBezierPath(anchors: BezierAnchor[], lineType: LineType, layer: number): BezierPath {
    const path: BezierPath = {
      id: this.nextBezierPathId++,
      anchors,
      lineType,
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

  findBezierPathForLine(lineId: number): BezierPath | null {
    return this.bezierPaths.find(p => p.lineIds.includes(lineId)) ?? null;
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
    };
  }

  private applySnapshot(snapshot: TrackSnapshot) {
    this.lines = [...snapshot.lines];
    this.startPosition = snapshot.startPosition.clone();
    this.layers = snapshot.layers.map(layer => ({ ...layer }));
    this.activeLayerId = snapshot.activeLayerId;
    this.bezierPaths = snapshot.bezierPaths.map(cloneBezierPath);
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

      const extended = this.toBoolean(line.extended) ?? false;
      const leftExtended = this.toBoolean(line.leftExtended) ?? extended;
      const rightExtended = this.toBoolean(line.rightExtended) ?? extended;

      normalizedLines.push({
        type,
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        flipped: this.toBoolean(line.flipped) ?? false,
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

  findNearestEndpoint(point: Vec2, radius: number, excludeLineIds?: Set<number>): Vec2 | null {
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
