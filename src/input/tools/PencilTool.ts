import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { MIN_LINE_LENGTH, SNAP_RADIUS, CURVE_FIT_ERROR } from '../../constants';
import { fitCurve } from '../../math/curve-fit';
import { BezierAnchor } from '../../store/BezierPath';
import {
  PointSnapResult,
  renderPointSnapIndicator,
  resolvePointSnap,
} from './pointSnap';

export class PencilTool implements Tool {
  name = 'pencil';
  private store: TrackStore;
  private drawing = false;
  private lastPoint: Vec2 = new Vec2();
  private rawPoints: Vec2[] = [];
  private segments: Array<{ p1: Vec2; p2: Vec2 }> = [];
  private snapPreview: PointSnapResult | null = null;
  private shiftHeld = false;
  getLineType: () => LineType;
  private getEndpointSnapEnabled: () => boolean;
  private getGridSnapEnabled: () => boolean;
  private getGridSize: () => number;
  private getZoom: () => number;

  constructor(
    store: TrackStore,
    getLineType: () => LineType,
    getEndpointSnapEnabled: () => boolean = () => true,
    getGridSnapEnabled: () => boolean = () => false,
    getGridSize: () => number = () => 24,
    getZoom: () => number = () => 1,
  ) {
    this.store = store;
    this.getLineType = getLineType;
    this.getEndpointSnapEnabled = getEndpointSnapEnabled;
    this.getGridSnapEnabled = getGridSnapEnabled;
    this.getGridSize = getGridSize;
    this.getZoom = getZoom;
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.shiftHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.shiftHeld = false; });
  }

  private resolveSnap(pos: Vec2): Vec2 {
    if (this.shiftHeld) {
      this.snapPreview = null;
      return pos.clone();
    }

    const endpoint = this.getEndpointSnapEnabled()
      ? this.store.findNearestEndpoint(pos, SNAP_RADIUS)
      : null;
    const snap = resolvePointSnap(pos, {
      gridEnabled: this.getGridSnapEnabled(),
      gridSize: this.getGridSize(),
      endpoint,
    });
    this.snapPreview = snap.kind === 'none' ? null : snap;
    return snap.point;
  }

  onMouseDown(worldPos: Vec2) {
    this.drawing = true;
    const snapped = this.resolveSnap(worldPos);
    this.lastPoint = snapped.clone();
    this.rawPoints = [snapped.clone()];
    this.segments = [];
  }

  onMouseMove(worldPos: Vec2) {
    if (!this.drawing) return;
    const snapped = this.resolveSnap(worldPos);
    const dist = snapped.distanceTo(this.lastPoint);
    if (dist >= MIN_LINE_LENGTH) {
      this.segments.push({ p1: this.lastPoint.clone(), p2: snapped.clone() });
      this.rawPoints.push(snapped.clone());
      this.lastPoint = snapped.clone();
    }
  }

  onMouseUp(worldPos: Vec2) {
    if (!this.drawing) return;
    this.drawing = false;

    // Snap the endpoint
    const snappedEnd = this.resolveSnap(worldPos);
    const finalDist = snappedEnd.distanceTo(this.lastPoint);
    if (finalDist >= 1) {
      this.rawPoints.push(snappedEnd.clone());
    }

    if (this.rawPoints.length <= 2) {
      // Single line segment — no curve fitting needed
      if (this.rawPoints.length === 2) {
        this.store.addLine(this.rawPoints[0], this.rawPoints[1], this.getLineType());
      }
    } else {
      // Curve fit the raw points
      const beziers = fitCurve(this.rawPoints, CURVE_FIT_ERROR);
      if (beziers.length === 0) {
        // Fallback: add raw segments
        if (this.segments.length > 0) {
          this.store.addLines(this.segments, this.getLineType());
        }
      } else {
        // Convert fitted beziers to BezierAnchors
        const anchors: BezierAnchor[] = [];

        // First anchor
        anchors.push({
          position: beziers[0].start.clone(),
          handleIn: new Vec2(0, 0),
          handleOut: beziers[0].cp1.sub(beziers[0].start),
          smooth: true,
        });

        // Interior anchors (where consecutive beziers meet)
        for (let i = 1; i < beziers.length; i++) {
          const prev = beziers[i - 1];
          const curr = beziers[i];
          anchors.push({
            position: curr.start.clone(),
            handleIn: prev.cp2.sub(prev.end),
            handleOut: curr.cp1.sub(curr.start),
            smooth: true,
          });
        }

        // Last anchor
        const last = beziers[beziers.length - 1];
        anchors.push({
          position: last.end.clone(),
          handleIn: last.cp2.sub(last.end),
          handleOut: new Vec2(0, 0),
          smooth: true,
        });

        this.store.addBezierPath(anchors, this.getLineType(), this.store.activeLayerId);
      }
    }

    this.rawPoints = [];
    this.segments = [];
    this.snapPreview = null;
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.drawing && this.segments.length > 0) {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let previousEnd: Vec2 | null = null;
      for (const seg of this.segments) {
        const connected = previousEnd &&
          previousEnd.x === seg.p1.x &&
          previousEnd.y === seg.p1.y;

        if (!connected) {
          ctx.moveTo(seg.p1.x, seg.p1.y);
        }

        ctx.lineTo(seg.p2.x, seg.p2.y);
        previousEnd = seg.p2;
      }
      ctx.stroke();
    }

    renderPointSnapIndicator(ctx, this.snapPreview, this.getZoom());
  }
}
