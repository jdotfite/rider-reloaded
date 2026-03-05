import { Vec2 } from '../../math/Vec2';
import {
  COLOR_ACC,
  COLOR_SCENERY,
  COLOR_SOLID,
  MIN_LINE_LENGTH,
  SNAP_RADIUS,
} from '../../constants';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';

type CurveStage = 'idle' | 'setting-end' | 'setting-cp1' | 'setting-cp2';

export class CurveTool implements Tool {
  name = 'curve';
  private store: TrackStore;
  private stage: CurveStage = 'idle';
  private startPoint = new Vec2();
  private endPoint = new Vec2();
  private cp1 = new Vec2();
  private cp2 = new Vec2();
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
    if (this.stage === 'setting-cp1') {
      this.cp1 = worldPos.clone();
      this.cp2 = worldPos.clone();
      this.stage = 'setting-cp2';
      return;
    }

    if (this.stage === 'setting-cp2') {
      this.cp2 = worldPos.clone();
      this.commitCurve();
      return;
    }

    this.stage = 'setting-end';
    this.startPoint = this.trySnap(worldPos);
    this.endPoint = worldPos.clone();
    this.cp1 = worldPos.clone();
    this.cp2 = worldPos.clone();
  }

  onMouseMove(worldPos: Vec2) {
    if (this.stage === 'setting-end') {
      this.endPoint = this.trySnap(worldPos);
      return;
    }

    if (this.stage === 'setting-cp1') {
      this.cp1 = worldPos.clone();
      this.cp2 = worldPos.clone();
      return;
    }

    if (this.stage === 'setting-cp2') {
      this.cp2 = worldPos.clone();
    }
  }

  onMouseUp(worldPos: Vec2) {
    if (this.stage !== 'setting-end') return;

    this.endPoint = this.trySnap(worldPos);
    if (this.startPoint.distanceTo(this.endPoint) < 1) {
      this.reset();
      return;
    }

    // Default cp1/cp2 at 1/3 and 2/3 of the line
    this.cp1 = this.startPoint.lerp(this.endPoint, 1 / 3);
    this.cp2 = this.startPoint.lerp(this.endPoint, 2 / 3);
    this.stage = 'setting-cp1';
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.stage === 'idle') return;

    const color = this.getLineColor();
    const points = this.getPreviewPoints();
    if (points.length < 2) return;

    ctx.save();

    // Guide lines for control points
    if (this.stage === 'setting-cp1' || this.stage === 'setting-cp2') {
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(this.startPoint.x, this.startPoint.y);
      ctx.lineTo(this.cp1.x, this.cp1.y);
      ctx.lineTo(this.cp2.x, this.cp2.y);
      ctx.lineTo(this.endPoint.x, this.endPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Curve preview
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Anchors
    this.drawAnchor(ctx, this.startPoint, color);
    this.drawAnchor(ctx, this.endPoint, color);

    if (this.stage === 'setting-cp1') {
      this.drawAnchor(ctx, this.cp1, '#4488cc');
    } else if (this.stage === 'setting-cp2') {
      this.drawAnchor(ctx, this.cp1, '#4488cc');
      this.drawAnchor(ctx, this.cp2, '#cc4444');
    }

    // Snap indicator
    if (this.snapPoint) {
      ctx.strokeStyle = '#4488cc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.snapPoint.x, this.snapPoint.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private commitCurve() {
    const points = this.getPreviewPoints();
    if (points.length < 2) {
      this.reset();
      return;
    }

    const segments: Array<{ p1: Vec2; p2: Vec2 }> = [];
    for (let i = 1; i < points.length; i++) {
      segments.push({
        p1: points[i - 1],
        p2: points[i],
      });
    }

    this.store.addLines(segments, this.getLineType());
    this.reset();
  }

  private getPreviewPoints(): Vec2[] {
    if (this.stage === 'idle') return [];
    if (this.stage === 'setting-end') return [this.startPoint, this.endPoint];

    const approxLength =
      this.startPoint.distanceTo(this.cp1) +
      this.cp1.distanceTo(this.cp2) +
      this.cp2.distanceTo(this.endPoint);
    const steps = Math.max(8, Math.min(64, Math.ceil(approxLength / MIN_LINE_LENGTH)));
    const points: Vec2[] = [];

    for (let i = 0; i <= steps; i++) {
      points.push(this.sampleCubic(i / steps));
    }

    return points;
  }

  private sampleCubic(t: number): Vec2 {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    return new Vec2(
      mt3 * this.startPoint.x + 3 * mt2 * t * this.cp1.x + 3 * mt * t2 * this.cp2.x + t3 * this.endPoint.x,
      mt3 * this.startPoint.y + 3 * mt2 * t * this.cp1.y + 3 * mt * t2 * this.cp2.y + t3 * this.endPoint.y,
    );
  }

  private drawAnchor(ctx: CanvasRenderingContext2D, point: Vec2, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private getLineColor(): string {
    const type = this.getLineType();
    if (type === LineType.ACC) return COLOR_ACC;
    if (type === LineType.SCENERY) return COLOR_SCENERY;
    return COLOR_SOLID;
  }

  private reset() {
    this.stage = 'idle';
    this.snapPoint = null;
  }
}
