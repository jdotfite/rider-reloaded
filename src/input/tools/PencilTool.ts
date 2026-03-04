import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { MIN_LINE_LENGTH } from '../../constants';

export class PencilTool implements Tool {
  name = 'pencil';
  private store: TrackStore;
  private drawing = false;
  private lastPoint: Vec2 = new Vec2();
  private segments: Array<{ p1: Vec2; p2: Vec2 }> = [];
  getLineType: () => LineType;

  constructor(store: TrackStore, getLineType: () => LineType) {
    this.store = store;
    this.getLineType = getLineType;
  }

  onMouseDown(worldPos: Vec2) {
    this.drawing = true;
    this.lastPoint = worldPos.clone();
    this.segments = [];
  }

  onMouseMove(worldPos: Vec2) {
    if (!this.drawing) return;
    const dist = worldPos.distanceTo(this.lastPoint);
    if (dist >= MIN_LINE_LENGTH) {
      this.segments.push({ p1: this.lastPoint.clone(), p2: worldPos.clone() });
      this.lastPoint = worldPos.clone();
    }
  }

  onMouseUp(worldPos: Vec2) {
    if (!this.drawing) return;
    this.drawing = false;
    const finalDist = worldPos.distanceTo(this.lastPoint);
    if (finalDist >= 1) {
      this.segments.push({ p1: this.lastPoint.clone(), p2: worldPos.clone() });
    }
    if (this.segments.length > 0) {
      this.store.addLines(this.segments, this.getLineType());
    }
    this.segments = [];
  }

  render(ctx: CanvasRenderingContext2D) {
    // Draw in-progress segments
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
  }
}
