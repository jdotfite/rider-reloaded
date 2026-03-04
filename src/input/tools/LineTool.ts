import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY } from '../../constants';

export class LineTool implements Tool {
  name = 'line';
  private store: TrackStore;
  private drawing = false;
  private startPoint: Vec2 = new Vec2();
  private endPoint: Vec2 = new Vec2();
  getLineType: () => LineType;

  constructor(store: TrackStore, getLineType: () => LineType) {
    this.store = store;
    this.getLineType = getLineType;
  }

  onMouseDown(worldPos: Vec2) {
    this.drawing = true;
    this.startPoint = worldPos.clone();
    this.endPoint = worldPos.clone();
  }

  onMouseMove(worldPos: Vec2) {
    if (!this.drawing) return;
    this.endPoint = worldPos.clone();
  }

  onMouseUp() {
    if (!this.drawing) return;
    this.drawing = false;
    const dist = this.startPoint.distanceTo(this.endPoint);
    if (dist >= 1) {
      this.store.addLine(this.startPoint, this.endPoint, this.getLineType());
    }
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
  }
}
