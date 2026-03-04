import { Vec2 } from '../../math/Vec2';
import {
  COLOR_ACC,
  COLOR_SCENERY,
  COLOR_SOLID,
  MIN_LINE_LENGTH,
} from '../../constants';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';

type CurveStage = 'idle' | 'setting-end' | 'setting-control';

export class CurveTool implements Tool {
  name = 'curve';
  private store: TrackStore;
  private stage: CurveStage = 'idle';
  private startPoint = new Vec2();
  private endPoint = new Vec2();
  private controlPoint = new Vec2();
  getLineType: () => LineType;

  constructor(store: TrackStore, getLineType: () => LineType) {
    this.store = store;
    this.getLineType = getLineType;
  }

  onMouseDown(worldPos: Vec2) {
    if (this.stage === 'setting-control') {
      this.controlPoint = worldPos.clone();
      this.commitCurve();
      return;
    }

    this.stage = 'setting-end';
    this.startPoint = worldPos.clone();
    this.endPoint = worldPos.clone();
    this.controlPoint = worldPos.clone();
  }

  onMouseMove(worldPos: Vec2) {
    if (this.stage === 'setting-end') {
      this.endPoint = worldPos.clone();
      return;
    }

    if (this.stage === 'setting-control') {
      this.controlPoint = worldPos.clone();
    }
  }

  onMouseUp(worldPos: Vec2) {
    if (this.stage !== 'setting-end') return;

    this.endPoint = worldPos.clone();
    if (this.startPoint.distanceTo(this.endPoint) < 1) {
      this.reset();
      return;
    }

    this.controlPoint = this.startPoint.lerp(this.endPoint, 0.5);
    this.stage = 'setting-control';
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.stage === 'idle') return;

    const color = this.getLineColor();
    const points = this.getPreviewPoints();
    if (points.length < 2) return;

    ctx.save();

    if (this.stage === 'setting-control') {
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(this.startPoint.x, this.startPoint.y);
      ctx.lineTo(this.controlPoint.x, this.controlPoint.y);
      ctx.lineTo(this.endPoint.x, this.endPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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

    this.drawAnchor(ctx, this.startPoint, color);
    this.drawAnchor(ctx, this.endPoint, color);

    if (this.stage === 'setting-control') {
      this.drawAnchor(ctx, this.controlPoint, '#141414');
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
      this.startPoint.distanceTo(this.controlPoint) +
      this.controlPoint.distanceTo(this.endPoint);
    const steps = Math.max(8, Math.min(48, Math.ceil(approxLength / MIN_LINE_LENGTH)));
    const points: Vec2[] = [];

    for (let i = 0; i <= steps; i++) {
      points.push(this.sampleCurvePoint(i / steps));
    }

    return points;
  }

  private sampleCurvePoint(t: number): Vec2 {
    const mt = 1 - t;
    const x =
      mt * mt * this.startPoint.x +
      2 * mt * t * this.controlPoint.x +
      t * t * this.endPoint.x;
    const y =
      mt * mt * this.startPoint.y +
      2 * mt * t * this.controlPoint.y +
      t * t * this.endPoint.y;
    return new Vec2(x, y);
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
  }
}
