import { Vec2 } from '../math/Vec2';
import { Line } from '../physics/lines/Line';
import { LineOptions } from '../physics/lines/Line';
import { LineType } from '../physics/lines/LineTypes';
import { SolidLine } from '../physics/lines/SolidLine';
import { AccLine } from '../physics/lines/AccLine';
import { SceneryLine } from '../physics/lines/SceneryLine';

export interface SerializedTrackLine {
  type: LineType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flipped?: boolean;
  leftExtended?: boolean;
  rightExtended?: boolean;
  multiplier?: number;
}

export interface SerializedTrack {
  version: 1;
  startPosition: { x: number; y: number };
  lines: SerializedTrackLine[];
}

interface TrackSnapshot {
  lines: Line[];
  startPosition: Vec2;
}

export class TrackStore {
  lines: Line[] = [];
  startPosition: Vec2 = new Vec2(0, 0);

  private undoStack: TrackSnapshot[] = [];
  private redoStack: TrackSnapshot[] = [];
  private transactionSnapshot: TrackSnapshot | null = null;
  private transactionChanged = false;

  addLine(p1: Vec2, p2: Vec2, type: LineType): Line {
    const line = this.createLine(p1, p2, type);
    this.beginMutation();
    this.lines.push(line);
    return line;
  }

  addLines(segments: Array<{ p1: Vec2; p2: Vec2 }>, type: LineType): Line[] {
    if (segments.length === 0) return [];
    this.beginMutation();
    const added: Line[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const line = this.createLine(seg.p1, seg.p2, type, {
        leftExtended: i > 0,
        rightExtended: i < segments.length - 1,
      });
      this.lines.push(line);
      added.push(line);
    }
    return added;
  }

  removeLinesNear(point: Vec2, radius: number): number {
    if (this.lines.length === 0) return 0;

    const radiusSq = radius * radius;
    const nextLines = this.lines.filter(line => line.distanceToPointSq(point) > radiusSq);
    const removed = this.lines.length - nextLines.length;
    if (removed === 0) return 0;

    this.beginMutation();
    this.lines = nextLines;
    return removed;
  }

  clear(): boolean {
    if (this.lines.length === 0) return false;
    this.beginMutation();
    this.lines = [];
    return true;
  }

  serialize(): SerializedTrack {
    return {
      version: 1,
      startPosition: {
        x: this.startPosition.x,
        y: this.startPosition.y,
      },
      lines: this.lines.map(line => ({
        type: line.type,
        x1: line.p1.x,
        y1: line.p1.y,
        x2: line.p2.x,
        y2: line.p2.y,
        flipped: line.flipped || undefined,
        leftExtended: line.leftExtended || undefined,
        rightExtended: line.rightExtended || undefined,
        multiplier: line instanceof AccLine && line.multiplier !== 1 ? line.multiplier : undefined,
      })),
    };
  }

  load(track: SerializedTrack): boolean {
    if (!this.isValidTrack(track)) return false;

    const loadedLines = track.lines.map(line => this.createLine(
      new Vec2(line.x1, line.y1),
      new Vec2(line.x2, line.y2),
      line.type,
      {
        flipped: line.flipped,
        leftExtended: line.leftExtended,
        rightExtended: line.rightExtended,
        multiplier: line.multiplier,
      }
    ));

    this.beginMutation();
    this.startPosition = new Vec2(track.startPosition.x, track.startPosition.y);
    this.lines = loadedLines;
    return true;
  }

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
    };
  }

  private applySnapshot(snapshot: TrackSnapshot) {
    this.lines = [...snapshot.lines];
    this.startPosition = snapshot.startPosition.clone();
  }

  private createLine(p1: Vec2, p2: Vec2, type: LineType, options: LineOptions = {}): Line {
    switch (type) {
      case LineType.SOLID: return new SolidLine(p1, p2, options);
      case LineType.ACC: return new AccLine(p1, p2, options);
      case LineType.SCENERY: return new SceneryLine(p1, p2, options);
    }
  }

  private isValidTrack(track: unknown): track is SerializedTrack {
    if (!track || typeof track !== 'object') return false;

    const candidate = track as Partial<SerializedTrack>;
    if (!candidate.startPosition || !Array.isArray(candidate.lines)) return false;

    const start = candidate.startPosition as { x?: unknown; y?: unknown };
    if (typeof start.x !== 'number' || typeof start.y !== 'number') return false;

    for (const line of candidate.lines) {
      if (!line || typeof line !== 'object') return false;
      const candidateLine = line as Partial<SerializedTrackLine>;
      if (!Object.values(LineType).includes(candidateLine.type as LineType)) return false;
      if (
        typeof candidateLine.x1 !== 'number' ||
        typeof candidateLine.y1 !== 'number' ||
        typeof candidateLine.x2 !== 'number' ||
        typeof candidateLine.y2 !== 'number'
      ) {
          return false;
      }

      if (
        candidateLine.multiplier != null &&
        (typeof candidateLine.multiplier !== 'number' || !Number.isFinite(candidateLine.multiplier))
      ) {
        return false;
      }
    }

    return true;
  }
}
