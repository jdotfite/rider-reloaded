import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';

export class FlagTool implements Tool {
  name = 'flag';
  private hoverVisible = false;
  private isDragging = false;
  private cursor = new Vec2();
  private onPlace: (position: Vec2) => void;

  constructor(onPlace: (position: Vec2) => void) {
    this.onPlace = onPlace;
  }

  onMouseDown(worldPos: Vec2) {
    this.hoverVisible = true;
    this.isDragging = true;
    this.cursor = worldPos.clone();
    this.onPlace(worldPos.clone());
  }

  onMouseMove(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
    if (this.isDragging) {
      this.onPlace(worldPos.clone());
    }
  }

  onMouseUp(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = worldPos.clone();
    if (this.isDragging) {
      this.onPlace(worldPos.clone());
      this.isDragging = false;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.hoverVisible) return;

    const x = this.cursor.x;
    const y = this.cursor.y;
    const poleHeight = 40;

    ctx.save();
    // Dashed preview pole
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Flag triangle
    ctx.fillStyle = this.isDragging ? 'rgba(209, 74, 55, 0.9)' : 'rgba(209, 74, 55, 0.6)';
    ctx.strokeStyle = 'rgba(150, 40, 30, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - poleHeight);
    ctx.lineTo(x + 16, y - poleHeight + 5);
    ctx.lineTo(x, y - poleHeight + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Base dot
    ctx.fillStyle = 'rgba(20, 20, 20, 0.4)';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
