import { COLOR_ACC, COLOR_SCENERY, COLOR_SOLID, LINE_WIDTH } from '../../constants';
import {
  GeneratorAsset,
  GeneratorSettings,
  computeGeneratedSegmentBounds,
} from '../../generators/catalog';
import { Vec2 } from '../../math/Vec2';
import { LineType } from '../../physics/lines/LineTypes';
import { TrackStore } from '../../store/TrackStore';
import { PointSnapResult, renderPointSnapIndicator, resolvePointSnap } from './pointSnap';
import { Tool } from './Tool';

const TYPE_COLORS: Record<LineType, string> = {
  [LineType.SOLID]: COLOR_SOLID,
  [LineType.ACC]: COLOR_ACC,
  [LineType.SCENERY]: COLOR_SCENERY,
};

export class GeneratorTool implements Tool {
  name = 'generator';
  private asset: GeneratorAsset | null = null;
  private cursor = new Vec2();
  private snapPreview: PointSnapResult | null = null;
  onCancel: (() => void) | null = null;

  constructor(
    private store: TrackStore,
    private getLineType: () => LineType,
    private getSettings: () => GeneratorSettings | null,
    private getGridSnapEnabled: () => boolean = () => false,
    private getGridSize: () => number = () => 24,
    private getZoom: () => number = () => 1,
  ) {}

  setAsset(asset: GeneratorAsset) {
    this.asset = asset;
  }

  clearAsset() {
    this.asset = null;
    this.snapPreview = null;
  }

  onMouseDown(worldPos: Vec2) {
    const lines = this.createPlacedLines(worldPos);
    if (lines.length === 0) return;
    this.store.beginTransaction();
    this.store.pasteLines(lines);
    this.store.endTransaction();
  }

  onMouseMove(worldPos: Vec2) {
    this.cursor = this.resolveAnchor(worldPos);
  }

  onMouseUp() {}

  render(ctx: CanvasRenderingContext2D) {
    if (!this.asset) return;
    const settings = this.getSettings();
    if (!settings) return;

    const segments = this.asset.createSegments(settings);
    if (segments.length === 0) return;

    const color = TYPE_COLORS[this.getLineType()];
    const bounds = computeGeneratedSegmentBounds(segments);

    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.82);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const segment of segments) {
      ctx.moveTo(this.cursor.x + segment.p1.x, this.cursor.y + segment.p1.y);
      ctx.lineTo(this.cursor.x + segment.p2.x, this.cursor.y + segment.p2.y);
    }
    ctx.stroke();

    const zoom = this.getZoom();
    const labelWidth = Math.max(92 / zoom, bounds.width * 0.42);
    const labelHeight = 20 / zoom;
    const labelX = this.cursor.x - labelWidth / 2;
    const labelY = this.cursor.y + bounds.maxY + 12 / zoom;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(46, 52, 61, 0.24)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 6 / zoom);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(24, 26, 29, 0.74)';
    ctx.font = `${Math.max(9, 10 / zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.asset.name, this.cursor.x, labelY + labelHeight / 2);
    ctx.restore();

    renderPointSnapIndicator(ctx, this.snapPreview, zoom);
  }

  getCursor(): string | null {
    return this.asset ? 'crosshair' : null;
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Escape' && this.asset) {
      e.preventDefault();
      this.onCancel?.();
    }
  }

  private createPlacedLines(worldPos: Vec2) {
    if (!this.asset) return [];
    const settings = this.getSettings();
    if (!settings) return [];
    const anchor = this.resolveAnchor(worldPos);
    const type = this.getLineType();

    return this.asset.createSegments(settings).map((segment) => ({
      p1: segment.p1.add(anchor),
      p2: segment.p2.add(anchor),
      type,
      leftExtended: segment.leftExtended,
      rightExtended: segment.rightExtended,
      layer: this.store.activeLayerId,
    }));
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
    ? raw.split('').map((ch) => ch + ch).join('')
    : raw;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${normalized})`;
}
