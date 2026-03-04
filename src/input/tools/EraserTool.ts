import { Vec2 } from '../../math/Vec2';
import { ERASER_RADIUS } from '../../constants';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';

export class EraserTool implements Tool {
  name = 'eraser';
  private store: TrackStore;
  private erasing = false;
  private hoverVisible = false;
  private cursor = new Vec2();

  constructor(store: TrackStore) {
    this.store = store;
  }

  onMouseDown(worldPos: Vec2) {
    this.erasing = true;
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
    this.store.beginTransaction();
    this.eraseAt(worldPos);
  }

  onMouseMove(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
    if (!this.erasing) return;
    this.eraseAt(worldPos);
  }

  onMouseUp() {
    if (!this.erasing) return;
    this.erasing = false;
    this.store.endTransaction();
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.hoverVisible) return;

    ctx.save();
    ctx.strokeStyle = '#cc5500';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(this.cursor.x, this.cursor.y, ERASER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private eraseAt(worldPos: Vec2) {
    this.store.removeLinesNear(worldPos, ERASER_RADIUS);
  }
}
