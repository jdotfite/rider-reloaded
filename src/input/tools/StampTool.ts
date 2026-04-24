import { Vec2 } from '../../math/Vec2';
import { COLOR_SCENERY, LINE_WIDTH } from '../../constants';
import { LineType } from '../../physics/lines/LineTypes';
import { TrackStore } from '../../store/TrackStore';
import { Tool } from './Tool';
import { PointSnapResult, renderPointSnapIndicator, resolvePointSnap } from './pointSnap';
import type { StampAsset } from '../../stamps/cloudAssets';

export class StampTool implements Tool {
  name = 'stamp';
  private asset: StampAsset | null = null;
  private cursor = new Vec2();
  private snapPreview: PointSnapResult | null = null;
  onCancel: (() => void) | null = null;

  constructor(
    private store: TrackStore,
    private getGridSnapEnabled: () => boolean = () => false,
    private getGridSize: () => number = () => 24,
    private getZoom: () => number = () => 1,
  ) {}

  setAsset(asset: StampAsset) {
    this.asset = asset;
  }

  clearAsset() {
    this.asset = null;
    this.snapPreview = null;
  }

  onMouseDown(worldPos: Vec2) {
    if (!this.asset) return;
    const anchor = this.resolveAnchor(worldPos);
    const placed = this.asset.segments.map((segment) => ({
      p1: segment.p1.add(anchor),
      p2: segment.p2.add(anchor),
      type: LineType.SCENERY,
      leftExtended: segment.leftExtended,
      rightExtended: segment.rightExtended,
      layer: this.store.activeLayerId,
    }));
    this.store.beginTransaction();
    this.store.pasteLines(placed);
    this.store.endTransaction();
  }

  onMouseMove(worldPos: Vec2) {
    this.cursor = this.resolveAnchor(worldPos);
  }

  onMouseUp() {}

  render(ctx: CanvasRenderingContext2D) {
    if (!this.asset) return;
    const previewAlpha = 0.78;
    ctx.save();
    ctx.strokeStyle = withAlpha(COLOR_SCENERY, previewAlpha);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const segment of this.asset.segments) {
      ctx.moveTo(this.cursor.x + segment.p1.x, this.cursor.y + segment.p1.y);
      ctx.lineTo(this.cursor.x + segment.p2.x, this.cursor.y + segment.p2.y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = 'rgba(46, 52, 61, 0.24)';
    ctx.lineWidth = 1 / this.getZoom();
    const labelWidth = Math.max(46, this.asset.width * 0.45);
    const labelHeight = 18 / this.getZoom();
    const labelX = this.cursor.x - labelWidth / 2;
    const labelY = this.cursor.y + this.asset.height / 2 + 10 / this.getZoom();
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 6 / this.getZoom());
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(24, 26, 29, 0.74)';
    ctx.font = `${Math.max(9, 10 / this.getZoom())}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Scenery Stamp', this.cursor.x, labelY + labelHeight / 2);
    ctx.restore();

    renderPointSnapIndicator(ctx, this.snapPreview, this.getZoom());
  }

  getCursor(): string | null {
    return this.asset ? 'copy' : null;
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Escape' && this.asset) {
      e.preventDefault();
      this.onCancel?.();
    }
  }

  private resolveAnchor(worldPos: Vec2): Vec2 {
    const snap = resolvePointSnap(worldPos, {
      gridEnabled: this.getGridSnapEnabled(),
      gridSize: this.getGridSize(),
      endpoint: null,
    });
    this.snapPreview = snap.kind === 'none' ? null : snap;
    return snap.point;
  }
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha));
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  const expanded = raw.length === 3
    ? raw.split('').map(ch => ch + ch).join('')
    : raw;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${normalized})`;
}
