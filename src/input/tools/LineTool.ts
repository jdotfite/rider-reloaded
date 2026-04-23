import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY, SNAP_RADIUS } from '../../constants';
import {
  PointSnapResult,
  renderPointSnapIndicator,
  resolvePointSnap,
} from './pointSnap';

export class LineTool implements Tool {
  name = 'line';
  private store: TrackStore;
  private drawing = false;
  private startPoint: Vec2 = new Vec2();
  private endPoint: Vec2 = new Vec2();
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
    this.startPoint = snapped.clone();
    this.endPoint = snapped.clone();
  }

  onMouseMove(worldPos: Vec2) {
    if (!this.drawing) return;
    this.endPoint = this.resolveSnap(worldPos);
  }

  onMouseUp(worldPos: Vec2) {
    if (!this.drawing) return;
    this.endPoint = this.resolveSnap(worldPos);
    this.drawing = false;
    const dist = this.startPoint.distanceTo(this.endPoint);
    if (dist >= 1) {
      this.store.addLine(this.startPoint, this.endPoint, this.getLineType());
    }
    this.snapPreview = null;
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

    renderPointSnapIndicator(ctx, this.snapPreview, this.getZoom());
  }
}
