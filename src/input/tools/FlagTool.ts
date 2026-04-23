import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import {
  PointSnapResult,
  renderPointSnapIndicator,
  resolvePointSnap,
} from './pointSnap';

export class FlagTool implements Tool {
  name = 'flag';
  private hoverVisible = false;
  private isDragging = false;
  private cursor = new Vec2();
  private snapPreview: PointSnapResult | null = null;
  private onPlace: (position: Vec2) => void;
  private getGridSnapEnabled: () => boolean;
  private getGridSize: () => number;
  private getZoom: () => number;

  constructor(
    onPlace: (position: Vec2) => void,
    getGridSnapEnabled: () => boolean = () => false,
    getGridSize: () => number = () => 24,
    getZoom: () => number = () => 1,
  ) {
    this.onPlace = onPlace;
    this.getGridSnapEnabled = getGridSnapEnabled;
    this.getGridSize = getGridSize;
    this.getZoom = getZoom;
  }

  private resolvePosition(worldPos: Vec2): Vec2 {
    const snap = resolvePointSnap(worldPos, {
      gridEnabled: this.getGridSnapEnabled(),
      gridSize: this.getGridSize(),
      endpoint: null,
    });
    this.snapPreview = snap.kind === 'none' ? null : snap;
    return snap.point;
  }

  onMouseDown(worldPos: Vec2) {
    this.hoverVisible = true;
    this.isDragging = true;
    this.cursor = this.resolvePosition(worldPos);
    this.onPlace(this.cursor.clone());
  }

  onMouseMove(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = this.resolvePosition(worldPos);
    if (this.isDragging) {
      this.onPlace(this.cursor.clone());
    }
  }

  onMouseUp(worldPos: Vec2) {
    this.hoverVisible = true;
    this.cursor = this.resolvePosition(worldPos);
    if (this.isDragging) {
      this.onPlace(this.cursor.clone());
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

    renderPointSnapIndicator(ctx, this.snapPreview, this.getZoom());
    ctx.restore();
  }
}
