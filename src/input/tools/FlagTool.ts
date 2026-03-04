import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';

export class FlagTool implements Tool {
  name = 'flag';
  private hoverVisible = false;
  private cursor = new Vec2();
  private onPlace: (position: Vec2) => void;

  constructor(onPlace: (position: Vec2) => void) {
    this.onPlace = onPlace;
  }

  onMouseDown(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
  }

  onMouseMove(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
  }

  onMouseUp(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
    this.onPlace(worldPos.clone());
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.hoverVisible) return;

    const x = this.cursor.x;
    const y = this.cursor.y;
    const poleHeight = 40;

    ctx.save();
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(209, 74, 55, 0.8)';
    ctx.beginPath();
    ctx.moveTo(x, y - poleHeight);
    ctx.lineTo(x + 16, y - poleHeight + 5);
    ctx.lineTo(x, y - poleHeight + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
