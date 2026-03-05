import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { MIN_LINE_LENGTH, SNAP_RADIUS } from '../../constants';

export class PencilTool implements Tool {
  name = 'pencil';
  private store: TrackStore;
  private drawing = false;
  private lastPoint: Vec2 = new Vec2();
  private segments: Array<{ p1: Vec2; p2: Vec2 }> = [];
  private snapPoint: Vec2 | null = null;
  private shiftHeld = false;
  getLineType: () => LineType;

  constructor(store: TrackStore, getLineType: () => LineType) {
    this.store = store;
    this.getLineType = getLineType;
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.shiftHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.shiftHeld = false; });
  }

  private trySnap(pos: Vec2): Vec2 {
    if (this.shiftHeld) { this.snapPoint = null; return pos; }
    const snap = this.store.findNearestEndpoint(pos, SNAP_RADIUS);
    this.snapPoint = snap;
    return snap ?? pos;
  }

  onMouseDown(worldPos: Vec2) {
    this.drawing = true;
    const snapped = this.trySnap(worldPos);
    this.lastPoint = snapped;
    this.segments = [];
  }

  onMouseMove(worldPos: Vec2) {
    if (!this.drawing) return;
    this.snapPoint = null; // don't show snap indicator mid-draw
    const dist = worldPos.distanceTo(this.lastPoint);
    if (dist >= MIN_LINE_LENGTH) {
      this.segments.push({ p1: this.lastPoint.clone(), p2: worldPos.clone() });
      this.lastPoint = worldPos.clone();
    }
  }

  onMouseUp(worldPos: Vec2) {
    if (!this.drawing) return;
    this.drawing = false;

    // Snap the endpoint
    const snappedEnd = this.trySnap(worldPos);
    const finalDist = snappedEnd.distanceTo(this.lastPoint);
    if (finalDist >= 1) {
      this.segments.push({ p1: this.lastPoint.clone(), p2: snappedEnd.clone() });
    }

    if (this.segments.length > 0) {
      this.store.addLines(this.segments, this.getLineType());
    }
    this.segments = [];
    this.snapPoint = null;
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.drawing || this.segments.length === 0) return;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let previousEnd: Vec2 | null = null;
    for (const seg of this.segments) {
      const connected = previousEnd &&
        previousEnd.x === seg.p1.x &&
        previousEnd.y === seg.p1.y;

      if (!connected) {
        ctx.moveTo(seg.p1.x, seg.p1.y);
      }

      ctx.lineTo(seg.p2.x, seg.p2.y);
      previousEnd = seg.p2;
    }
    ctx.stroke();

    // Snap indicator on start point
    if (this.snapPoint) {
      ctx.strokeStyle = '#4488cc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.snapPoint.x, this.snapPoint.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
