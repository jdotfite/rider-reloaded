import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY, SNAP_RADIUS } from '../../constants';

export class LineTool implements Tool {
  name = 'line';
  private store: TrackStore;
  private drawing = false;
  private startPoint: Vec2 = new Vec2();
  private endPoint: Vec2 = new Vec2();
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
    this.startPoint = this.trySnap(worldPos);
    this.endPoint = worldPos.clone();
  }

  onMouseMove(worldPos: Vec2) {
    if (!this.drawing) return;
    this.endPoint = this.trySnap(worldPos);
  }

  onMouseUp() {
    if (!this.drawing) return;
    this.drawing = false;
    const dist = this.startPoint.distanceTo(this.endPoint);
    if (dist >= 1) {
      this.store.addLine(this.startPoint, this.endPoint, this.getLineType());
    }
    this.snapPoint = null;
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.drawing) return;
    const type = this.getLineType();
    const color = type === LineType.SOLID ? COLOR_SOLID
      : type === LineType.ACC ? COLOR_ACC : COLOR_SCENERY;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(this.endPoint.x, this.endPoint.y);
    ctx.stroke();

    // Snap indicator
    if (this.snapPoint) {
      ctx.strokeStyle = '#4488cc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.snapPoint.x, this.snapPoint.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
