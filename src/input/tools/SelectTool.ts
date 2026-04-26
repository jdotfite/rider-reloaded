import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { BezierAnchor, cloneAnchor } from '../../store/BezierPath';
import { LineType } from '../../physics/lines/LineTypes';
import { AccLine } from '../../physics/lines/AccLine';
import { CURVE_FIT_ERROR, SELECT_RADIUS } from '../../constants';
import { chaikinSmooth } from '../../math/chaikin';
import { pointsToSegments } from '../../math/smooth';
import { fitCurve } from '../../math/curve-fit';
import { snapToGrid } from '../../editor/GridMath';

type SelectState =
  | 'idle'
  | 'box-selecting'
  | 'dragging'
  | 'scaling'
  | 'rotating'
  | 'smoothing';
type ScaleCorner = 'nw' | 'ne' | 'se' | 'sw';

interface ClipboardLine {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  type: LineType;
  flipped: boolean;
  leftExtended: boolean;
  rightExtended: boolean;
  multiplier?: number;
}

interface ClipboardBezierAnchor {
  position: { x: number; y: number };
  handleIn: { x: number; y: number };
  handleOut: { x: number; y: number };
  smooth: boolean;
}

interface ClipboardBezierPath {
  anchors: ClipboardBezierAnchor[];
  type: LineType;
}

interface ClipboardSelection {
  lines: ClipboardLine[];
  bezierPaths: ClipboardBezierPath[];
}

interface SmoothChain {
  lineIds: number[];
  points: Vec2[];
  type: LineType;
  layer: number;
}

interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface TransformLineSnapshot {
  lineId: number;
  p1: Vec2;
  p2: Vec2;
}

interface TransformPathSnapshot {
  pathId: number;
  anchors: BezierAnchor[];
}

type TransformHandle =
  | {
      kind: 'scale';
      corner: ScaleCorner;
      point: Vec2;
      cursor: string;
    }
  | {
      kind: 'rotate';
      point: Vec2;
      cursor: string;
    };

const ENDPOINT_EPSILON = 0.01;
const HANDLE_SIZE_PX = 11;
const HANDLE_HIT_PX = 14;
const ROTATE_HANDLE_RADIUS_PX = 7;
const ROTATE_HANDLE_OFFSET_PX = 28;
const MIN_SCALE = 0.05;
const ROTATION_SNAP_STEP = Math.PI / 12;
const ROTATE_CURSOR = createSvgCursor(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">',
    '<g transform="translate(2.4 2.4) scale(0.8)" fill="none" stroke="#111111" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M22 12l-3 3-3-3"/>',
      '<path d="M2 12l3-3 3 3"/>',
      '<path d="M19.016 14v-1.95A7.05 7.05 0 0 0 8 6.22"/>',
      '<path d="M16.016 17.845A7.05 7.05 0 0 1 5 12.015V10"/>',
      '<path d="M5 10V9"/>',
      '<path d="M19 15v-1"/>',
    '</g>',
    '<g transform="translate(2.4 2.4) scale(0.8)" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">',
    '<path d="M22 12l-3 3-3-3"/>',
    '<path d="M2 12l3-3 3 3"/>',
    '<path d="M19.016 14v-1.95A7.05 7.05 0 0 0 8 6.22"/>',
    '<path d="M16.016 17.845A7.05 7.05 0 0 1 5 12.015V10"/>',
    '<path d="M5 10V9"/>',
    '<path d="M19 15v-1"/>',
    '</g>',
    '</svg>',
  ].join(''),
  16,
  16,
  'crosshair',
);

export class SelectTool implements Tool {
  name = 'select';
  private store: TrackStore;
  private state: SelectState = 'idle';
  private selectedIds: Set<number> = new Set();
  private boxStart = new Vec2();
  private boxEnd = new Vec2();
  private dragStart = new Vec2();
  private dragCurrent = new Vec2();
  private dragCommitted = false;
  private hoveredHandle: TransformHandle | null = null;
  private activeHandle: TransformHandle | null = null;
  private transformLineSnapshots: TransformLineSnapshot[] = [];
  private transformPathSnapshots: TransformPathSnapshot[] = [];
  private transformOrigin = new Vec2();
  private transformReferencePoint = new Vec2();
  private transformStartAngle = 0;
  private shiftHeld = false;
  private ctrlHeld = false;
  private altHeld = false;
  private metaHeld = false;

  private smoothOriginalChains: SmoothChain[] = [];
  private smoothPreviewPoints: Vec2[][] = [];
  private smoothAmount = 0;

  private clipboard: ClipboardSelection = { lines: [], bezierPaths: [] };
  private pasteOffset = 0;

  onSmoothRequest: (() => void) | null = null;
  onSmoothEnd: (() => void) | null = null;

  constructor(
    store: TrackStore,
    private getGridSnapEnabled: () => boolean = () => false,
    private getGridSize: () => number = () => 24,
    private getZoom: () => number = () => 1,
  ) {
    this.store = store;
    const target = getGlobalKeyTarget();
    target?.addEventListener('keydown', this.onWindowKeyDown as EventListener);
    target?.addEventListener('keyup', this.onWindowKeyUp as EventListener);
  }

  onKeyDown(e: KeyboardEvent) {
    this.syncModifierState(e);
    const primaryModifier = e.ctrlKey || e.metaKey;
    const canEditSelection = this.state === 'idle' && this.selectedIds.size > 0;

    if (e.code === 'KeyS' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (canEditSelection) {
        e.preventDefault();
        this.onSmoothRequest?.();
      }
    }
    if (e.code === 'Escape' && this.state === 'smoothing') {
      e.preventDefault();
      this.cancelSmooth();
    }

    if (primaryModifier && !e.altKey && e.code === 'KeyC' && canEditSelection) {
      e.preventDefault();
      this.copySelected();
    }
    if (primaryModifier && !e.altKey && e.code === 'KeyX' && canEditSelection) {
      e.preventDefault();
      this.copySelected();
      this.deleteSelected();
    }
    if (primaryModifier && !e.altKey && e.code === 'KeyV' && this.state === 'idle' && this.hasClipboardContent()) {
      e.preventDefault();
      this.pasteClipboard();
    }
    if (primaryModifier && !e.altKey && e.code === 'KeyD' && canEditSelection) {
      e.preventDefault();
      this.duplicateSelected();
    }

    if ((e.code === 'Delete' || e.code === 'Backspace') && canEditSelection) {
      e.preventDefault();
      this.deleteSelected();
    }

    if (!primaryModifier && !e.altKey && e.code === 'KeyF' && canEditSelection) {
      e.preventDefault();
      this.flipSelected();
      return;
    }

    if (!primaryModifier && !e.altKey && canEditSelection) {
      if (e.code === 'KeyQ') this.changeSelectedType(LineType.SOLID);
      if (e.code === 'KeyW') this.changeSelectedType(LineType.ACC);
      if (e.code === 'KeyE') this.changeSelectedType(LineType.SCENERY);
    }
  }

  onMouseDown(worldPos: Vec2) {
    if (this.state === 'smoothing') return;

    if (this.selectedIds.size > 0) {
      const handle = this.getHandleAt(worldPos);
      if (handle?.kind === 'scale') {
        this.beginScale(handle.corner);
        return;
      }
      if (handle?.kind === 'rotate') {
        this.beginRotate(worldPos);
        return;
      }

      const hit = this.store.getLineAt(worldPos, SELECT_RADIUS);
      if (hit && this.selectedIds.has(hit.id)) {
        this.state = 'dragging';
        this.dragStart = worldPos.clone();
        this.dragCurrent = worldPos.clone();
        this.dragCommitted = false;
        this.store.beginTransaction();
        return;
      }
    }

    const hit = this.store.getLineAt(worldPos, SELECT_RADIUS);
    if (hit) {
      this.selectedIds = this.expandSelection(new Set([hit.id]));
      this.hoveredHandle = this.getHandleAt(worldPos);
      this.state = 'idle';
      return;
    }

    this.state = 'box-selecting';
    this.boxStart = worldPos.clone();
    this.boxEnd = worldPos.clone();
    this.selectedIds.clear();
    this.hoveredHandle = null;
  }

  onMouseMove(worldPos: Vec2) {
    if (this.state === 'box-selecting') {
      this.boxEnd = worldPos.clone();
      const minX = Math.min(this.boxStart.x, this.boxEnd.x);
      const minY = Math.min(this.boxStart.y, this.boxEnd.y);
      const maxX = Math.max(this.boxStart.x, this.boxEnd.x);
      const maxY = Math.max(this.boxStart.y, this.boxEnd.y);
      const lines = this.store.getLinesInRect(minX, minY, maxX, maxY);
      this.selectedIds = this.expandSelection(new Set(lines.map((line) => line.id)));
      return;
    }

    if (this.state === 'dragging') {
      this.selectedIds = this.expandSelection(this.selectedIds);
      const dx = worldPos.x - this.dragCurrent.x;
      const dy = worldPos.y - this.dragCurrent.y;
      if (dx !== 0 || dy !== 0) {
        const offset = new Vec2(dx, dy);
        for (const path of this.store.bezierPaths) {
          const allSelected = path.lineIds.every((id) => this.selectedIds.has(id));
          if (!allSelected || path.lineIds.length === 0) continue;
          for (const anchor of path.anchors) {
            anchor.position = anchor.position.add(offset);
          }
        }

        this.store.moveLines(this.selectedIds, dx, dy);
        this.dragCurrent = worldPos.clone();
        this.dragCommitted = true;
      }
      return;
    }

    if (this.state === 'scaling') {
      this.updateScaledSelection(worldPos);
      return;
    }

    if (this.state === 'rotating') {
      this.updateRotatedSelection(worldPos);
      return;
    }

    this.hoveredHandle = this.getHandleAt(worldPos);
  }

  onMouseUp(worldPos: Vec2) {
    if (this.state === 'box-selecting') {
      this.state = 'idle';
      this.hoveredHandle = this.getHandleAt(worldPos);
      return;
    }

    if (this.state === 'dragging') {
      this.store.endTransaction();
      this.state = 'idle';
      this.hoveredHandle = this.getHandleAt(worldPos);
      return;
    }

    if (this.state === 'scaling' || this.state === 'rotating') {
      this.store.endTransaction();
      this.state = 'idle';
      this.activeHandle = null;
      this.hoveredHandle = this.getHandleAt(worldPos);
      return;
    }
  }

  getCursor(): string | null {
    if (this.state === 'scaling' && this.activeHandle?.kind === 'scale') {
      return this.activeHandle.cursor;
    }
    if (this.state === 'rotating') {
      return ROTATE_CURSOR;
    }
    return this.hoveredHandle?.cursor ?? null;
  }

  clearSelection() {
    this.selectedIds.clear();
    this.state = 'idle';
    this.hoveredHandle = null;
    this.activeHandle = null;
    this.cancelSmooth();
  }

  deleteSelected() {
    if (this.selectedIds.size === 0) return;
    this.store.removeLines(this.selectedIds);
    this.selectedIds.clear();
    this.hoveredHandle = null;
    this.activeHandle = null;
  }

  flipSelected() {
    if (this.selectedIds.size === 0 || this.state !== 'idle') return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    this.store.beginTransaction();
    for (const lineId of this.selectedIds) {
      this.store.flipLine(lineId);
    }
    this.store.endTransaction();
  }

  getSelectedCount(): number {
    return this.selectedIds.size;
  }

  copySelected() {
    if (this.selectedIds.size === 0) return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    this.clipboard = this.captureSelection(this.selectedIds);
    this.pasteOffset = 0;
  }

  pasteClipboard() {
    if (!this.hasClipboardContent()) return;
    const nextOffset = this.pasteOffset + 20;
    const newIds = this.pasteSelection(this.clipboard, nextOffset, nextOffset);
    if (newIds.size === 0) return;
    this.pasteOffset = nextOffset;
    this.selectedIds = newIds;
    this.hoveredHandle = null;
  }

  duplicateSelected() {
    if (this.selectedIds.size === 0) return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    const captured = this.captureSelection(this.selectedIds);
    const newIds = this.pasteSelection(captured, 20, 20);
    if (newIds.size === 0) return;
    this.selectedIds = newIds;
    this.hoveredHandle = null;
  }

  changeSelectedType(newType: LineType) {
    if (this.selectedIds.size === 0 || this.state !== 'idle') return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    this.store.changeLineTypes(this.selectedIds, newType);
  }

  startSmooth(): boolean {
    if (this.selectedIds.size === 0 || this.state !== 'idle') return false;
    this.prepareSmoothChains();
    if (this.smoothOriginalChains.length === 0) return false;
    this.state = 'smoothing';
    this.smoothAmount = 0;
    this.store.beginTransaction();
    return true;
  }

  setSmoothAmount(amount: number) {
    if (this.state !== 'smoothing') return;
    this.smoothAmount = Math.max(0, Math.min(1, amount));
    this.updateSmoothPreview();
  }

  applySmooth() {
    if (this.state !== 'smoothing') return;
    this.commitSmooth();
  }

  cancelSmooth() {
    if (this.state !== 'smoothing') {
      this.smoothOriginalChains = [];
      this.smoothPreviewPoints = [];
      this.smoothAmount = 0;
      return;
    }
    this.store.endTransaction();
    this.state = 'idle';
    this.smoothOriginalChains = [];
    this.smoothPreviewPoints = [];
    this.smoothAmount = 0;
    this.onSmoothEnd?.();
  }

  isSmoothing(): boolean {
    return this.state === 'smoothing';
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.state === 'smoothing' && this.smoothPreviewPoints.length > 0) {
      ctx.strokeStyle = 'rgba(68, 136, 204, 0.2)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const chain of this.smoothOriginalChains) {
        for (let i = 0; i < chain.points.length - 1; i++) {
          ctx.moveTo(chain.points[i].x, chain.points[i].y);
          ctx.lineTo(chain.points[i + 1].x, chain.points[i + 1].y);
        }
      }
      ctx.stroke();

      ctx.strokeStyle = '#4488cc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const pts of this.smoothPreviewPoints) {
        if (pts.length < 2) continue;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.stroke();
      return;
    }

    if (this.selectedIds.size > 0) {
      ctx.strokeStyle = '#4488cc';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const line of this.store.lines) {
        if (!this.selectedIds.has(line.id)) continue;
        ctx.moveTo(line.p1.x, line.p1.y);
        ctx.lineTo(line.p2.x, line.p2.y);
      }
      ctx.stroke();

      const bounds = this.getSelectionBounds();
      if (bounds) {
        ctx.strokeStyle = 'rgba(68, 136, 204, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          bounds.minX - 2,
          bounds.minY - 2,
          bounds.maxX - bounds.minX + 4,
          bounds.maxY - bounds.minY + 4,
        );
        ctx.setLineDash([]);
        this.renderTransformHandles(ctx, bounds);
      }
    }

    if (this.state === 'box-selecting') {
      const x = Math.min(this.boxStart.x, this.boxEnd.x);
      const y = Math.min(this.boxStart.y, this.boxEnd.y);
      const w = Math.abs(this.boxEnd.x - this.boxStart.x);
      const h = Math.abs(this.boxEnd.y - this.boxStart.y);
      ctx.fillStyle = 'rgba(68, 136, 204, 0.1)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(68, 136, 204, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  private getSelectionBounds(): SelectionBounds | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;

    for (const line of this.store.lines) {
      if (!this.selectedIds.has(line.id)) continue;
      found = true;
      minX = Math.min(minX, line.p1.x, line.p2.x);
      minY = Math.min(minY, line.p1.y, line.p2.y);
      maxX = Math.max(maxX, line.p1.x, line.p2.x);
      maxY = Math.max(maxY, line.p1.y, line.p2.y);
    }

    return found ? { minX, minY, maxX, maxY } : null;
  }

  private prepareSmoothChains() {
    const selectedLines = this.store.lines.filter((line) => this.selectedIds.has(line.id));
    if (selectedLines.length === 0) return;

    const visited = new Set<number>();
    this.smoothOriginalChains = [];

    for (const startLine of selectedLines) {
      if (visited.has(startLine.id)) continue;
      visited.add(startLine.id);

      const forwardIds: number[] = [startLine.id];
      const forwardPoints: Vec2[] = [startLine.p1.clone(), startLine.p2.clone()];
      let tip = startLine.p2;

      let found = true;
      while (found) {
        found = false;
        for (const line of selectedLines) {
          if (visited.has(line.id)) continue;
          if (line.p1.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(line.id);
            forwardIds.push(line.id);
            forwardPoints.push(line.p2.clone());
            tip = line.p2;
            found = true;
            break;
          }
          if (line.p2.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(line.id);
            forwardIds.push(line.id);
            forwardPoints.push(line.p1.clone());
            tip = line.p1;
            found = true;
            break;
          }
        }
      }

      const backwardIds: number[] = [];
      const backwardPoints: Vec2[] = [];
      tip = startLine.p1;
      found = true;
      while (found) {
        found = false;
        for (const line of selectedLines) {
          if (visited.has(line.id)) continue;
          if (line.p2.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(line.id);
            backwardIds.unshift(line.id);
            backwardPoints.unshift(line.p1.clone());
            tip = line.p1;
            found = true;
            break;
          }
          if (line.p1.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(line.id);
            backwardIds.unshift(line.id);
            backwardPoints.unshift(line.p2.clone());
            tip = line.p2;
            found = true;
            break;
          }
        }
      }

      this.smoothOriginalChains.push({
        lineIds: [...backwardIds, ...forwardIds],
        points: [...backwardPoints, ...forwardPoints],
        type: startLine.type,
        layer: startLine.layer,
      });
    }

    this.smoothPreviewPoints = this.smoothOriginalChains.map((chain) =>
      chain.points.map((point) => point.clone()),
    );
  }

  private updateSmoothPreview() {
    this.smoothPreviewPoints = this.smoothOriginalChains.map((chain) =>
      chaikinSmooth(chain.points, this.smoothAmount),
    );
  }

  private commitSmooth() {
    if (this.smoothAmount > 0) {
      const allOldIds = new Set<number>();
      for (const chain of this.smoothOriginalChains) {
        for (const id of chain.lineIds) {
          allOldIds.add(id);
        }
      }
      this.store.removeLines(allOldIds);

      const newIds = new Set<number>();
      for (let ci = 0; ci < this.smoothOriginalChains.length; ci++) {
        const chain = this.smoothOriginalChains[ci];
        const smoothed = this.smoothPreviewPoints[ci];
        const anchors = this.fitBezierAnchors(smoothed);
        if (anchors) {
          const addedPath = this.store.addBezierPath(anchors, chain.type, chain.layer);
          for (const id of addedPath.lineIds) {
            newIds.add(id);
          }
          continue;
        }

        const segments = pointsToSegments(smoothed);
        if (segments.length > 0) {
          const added = this.store.pasteLines(segments.map((segment, index) => ({
            p1: segment.p1,
            p2: segment.p2,
            type: chain.type,
            leftExtended: index > 0,
            rightExtended: index < segments.length - 1,
            layer: chain.layer,
          })));
          for (const line of added) {
            newIds.add(line.id);
          }
        }
      }
      this.selectedIds = newIds;
    }

    this.store.endTransaction();
    this.state = 'idle';
    this.smoothOriginalChains = [];
    this.smoothPreviewPoints = [];
    this.smoothAmount = 0;
  }

  private renderTransformHandles(ctx: CanvasRenderingContext2D, bounds: SelectionBounds) {
    const handles = this.buildTransformHandles(bounds);
    const zoom = this.getZoom();
    const squareSize = HANDLE_SIZE_PX / zoom;
    const rotateRadius = ROTATE_HANDLE_RADIUS_PX / zoom;

    const rotateHandle = handles.find((handle) => handle.kind === 'rotate');
    if (rotateHandle) {
      const topCenter = new Vec2((bounds.minX + bounds.maxX) * 0.5, bounds.minY);
      ctx.save();
      ctx.strokeStyle = 'rgba(68, 136, 204, 0.65)';
      ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath();
      ctx.moveTo(topCenter.x, topCenter.y);
      ctx.lineTo(rotateHandle.point.x, rotateHandle.point.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const handle of handles) {
      const isHovered = handle.kind === 'scale'
        ? this.hoveredHandle?.kind === 'scale' && this.hoveredHandle.corner === handle.corner
        : this.hoveredHandle?.kind === 'rotate';
      const isActive = handle.kind === 'scale'
        ? this.activeHandle?.kind === 'scale' && this.activeHandle.corner === handle.corner
        : this.activeHandle?.kind === 'rotate';

      ctx.save();
      ctx.lineWidth = 1.2 / zoom;
      ctx.strokeStyle = 'rgba(68, 136, 204, 0.92)';
      ctx.fillStyle = isHovered || isActive
        ? 'rgba(68, 136, 204, 0.96)'
        : 'rgba(255, 255, 255, 0.96)';

      if (handle.kind === 'rotate') {
        ctx.beginPath();
        ctx.arc(handle.point.x, handle.point.y, rotateRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(
          handle.point.x - squareSize / 2,
          handle.point.y - squareSize / 2,
          squareSize,
          squareSize,
        );
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private beginScale(corner: ScaleCorner) {
    const bounds = this.getSelectionBounds();
    if (!bounds) return;
    this.captureTransformSelection();
    this.transformOrigin = this.getCornerPoint(bounds, oppositeCorner(corner));
    this.transformReferencePoint = this.getCornerPoint(bounds, corner);
    this.activeHandle = {
      kind: 'scale',
      corner,
      point: this.transformReferencePoint.clone(),
      cursor: scaleCursorForCorner(corner),
    };
    this.hoveredHandle = null;
    this.state = 'scaling';
    this.store.beginTransaction();
  }

  private beginRotate(worldPos: Vec2) {
    const bounds = this.getSelectionBounds();
    if (!bounds) return;
    this.captureTransformSelection();
    this.transformOrigin = new Vec2(
      (bounds.minX + bounds.maxX) * 0.5,
      (bounds.minY + bounds.maxY) * 0.5,
    );
    this.transformStartAngle = angleBetween(worldPos.sub(this.transformOrigin));
    const rotateHandle = this.buildTransformHandles(bounds).find(
      (handle) => handle.kind === 'rotate',
    );
    this.activeHandle = rotateHandle ?? {
      kind: 'rotate',
      point: worldPos.clone(),
      cursor: ROTATE_CURSOR,
    };
    this.hoveredHandle = null;
    this.state = 'rotating';
    this.store.beginTransaction();
  }

  private captureTransformSelection() {
    this.selectedIds = this.expandSelection(this.selectedIds);
    const selectedPaths = this.store.getBezierPathsForLineSelection(this.selectedIds);
    const pathLineIds = new Set<number>();
    for (const path of selectedPaths) {
      for (const id of path.lineIds) {
        pathLineIds.add(id);
      }
    }

    this.transformLineSnapshots = this.store.lines
      .filter((line) => this.selectedIds.has(line.id) && !pathLineIds.has(line.id))
      .map((line) => ({
        lineId: line.id,
        p1: line.p1.clone(),
        p2: line.p2.clone(),
      }));

    this.transformPathSnapshots = selectedPaths.map((path) => ({
      pathId: path.id,
      anchors: path.anchors.map((anchor) => cloneAnchor(anchor)),
    }));
  }

  private updateScaledSelection(worldPos: Vec2) {
    const currentHandle = this.getGridSnapEnabled()
      ? snapToGrid(worldPos, this.getGridSize())
      : worldPos.clone();
    const startVector = this.transformReferencePoint.sub(this.transformOrigin);
    const currentVector = currentHandle.sub(this.transformOrigin);

    let scaleX = 1;
    let scaleY = 1;
    if (this.shiftHeld) {
      scaleX = resolveAxisScale(startVector.x, currentVector.x);
      scaleY = resolveAxisScale(startVector.y, currentVector.y);
    } else {
      const uniform = resolveUniformScale(startVector, currentVector);
      scaleX = uniform;
      scaleY = uniform;
    }

    this.applySelectionTransform(
      (point) => transformPointScale(point, this.transformOrigin, scaleX, scaleY),
      (vector) => transformVectorScale(vector, scaleX, scaleY),
    );
  }

  private updateRotatedSelection(worldPos: Vec2) {
    let angle = angleBetween(worldPos.sub(this.transformOrigin)) - this.transformStartAngle;
    angle = normalizeAngle(angle);
    if (this.isRotationSnapModifierHeld()) {
      angle = Math.round(angle / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP;
    }

    this.applySelectionTransform(
      (point) => rotatePoint(point, this.transformOrigin, angle),
      (vector) => rotateVector(vector, angle),
    );
  }

  private applySelectionTransform(
    transformPoint: (point: Vec2) => Vec2,
    transformVector: (vector: Vec2) => Vec2,
  ) {
    const nextIds = new Set<number>();

    for (const lineSnapshot of this.transformLineSnapshots) {
      const replaced = this.store.replaceLine(
        lineSnapshot.lineId,
        transformPoint(lineSnapshot.p1),
        transformPoint(lineSnapshot.p2),
      );
      if (replaced) {
        nextIds.add(replaced.id);
      }
    }

    for (const pathSnapshot of this.transformPathSnapshots) {
      const path = this.store.bezierPaths.find((candidate) => candidate.id === pathSnapshot.pathId);
      if (!path || path.anchors.length !== pathSnapshot.anchors.length) continue;

      for (let i = 0; i < pathSnapshot.anchors.length; i++) {
        const original = pathSnapshot.anchors[i];
        path.anchors[i] = {
          position: transformPoint(original.position),
          handleIn: transformVector(original.handleIn),
          handleOut: transformVector(original.handleOut),
          smooth: original.smooth,
        };
      }

      this.store.regenerateBezierPathLines(path.id);
      const updatedPath = this.store.bezierPaths.find((candidate) => candidate.id === path.id);
      if (!updatedPath) continue;
      for (const id of updatedPath.lineIds) {
        nextIds.add(id);
      }
    }

    this.selectedIds = nextIds;
  }

  private buildTransformHandles(bounds: SelectionBounds): TransformHandle[] {
    const topCenter = new Vec2((bounds.minX + bounds.maxX) * 0.5, bounds.minY);
    const rotateHandle = new Vec2(
      topCenter.x,
      bounds.minY - ROTATE_HANDLE_OFFSET_PX / this.getZoom(),
    );

    return [
      {
        kind: 'scale',
        corner: 'nw',
        point: new Vec2(bounds.minX, bounds.minY),
        cursor: scaleCursorForCorner('nw'),
      },
      {
        kind: 'scale',
        corner: 'ne',
        point: new Vec2(bounds.maxX, bounds.minY),
        cursor: scaleCursorForCorner('ne'),
      },
      {
        kind: 'scale',
        corner: 'se',
        point: new Vec2(bounds.maxX, bounds.maxY),
        cursor: scaleCursorForCorner('se'),
      },
      {
        kind: 'scale',
        corner: 'sw',
        point: new Vec2(bounds.minX, bounds.maxY),
        cursor: scaleCursorForCorner('sw'),
      },
      {
        kind: 'rotate',
        point: rotateHandle,
        cursor: ROTATE_CURSOR,
      },
    ];
  }

  private getHandleAt(worldPos: Vec2): TransformHandle | null {
    if (this.selectedIds.size === 0) return null;
    const bounds = this.getSelectionBounds();
    if (!bounds) return null;

    const hitRadius = HANDLE_HIT_PX / this.getZoom();
    for (const handle of this.buildTransformHandles(bounds)) {
      if (handle.point.distanceToSq(worldPos) <= hitRadius * hitRadius) {
        return handle;
      }
    }
    return null;
  }

  private getCornerPoint(bounds: SelectionBounds, corner: ScaleCorner): Vec2 {
    if (corner === 'nw') return new Vec2(bounds.minX, bounds.minY);
    if (corner === 'ne') return new Vec2(bounds.maxX, bounds.minY);
    if (corner === 'se') return new Vec2(bounds.maxX, bounds.maxY);
    return new Vec2(bounds.minX, bounds.maxY);
  }

  private expandSelection(lineIds: Set<number>): Set<number> {
    return this.store.expandLineSelectionToWholeBezierPaths(lineIds);
  }

  private hasClipboardContent(): boolean {
    return this.clipboard.lines.length > 0 || this.clipboard.bezierPaths.length > 0;
  }

  private captureSelection(lineIds: Set<number>): ClipboardSelection {
    const selectedPaths = this.store.getBezierPathsForLineSelection(lineIds);
    const pathLineIds = new Set<number>();
    for (const path of selectedPaths) {
      for (const id of path.lineIds) {
        pathLineIds.add(id);
      }
    }

    return {
      lines: this.store.lines
        .filter((line) => lineIds.has(line.id) && !pathLineIds.has(line.id))
        .map((line) => ({
          p1: { x: line.p1.x, y: line.p1.y },
          p2: { x: line.p2.x, y: line.p2.y },
          type: line.type,
          flipped: line.flipped,
          leftExtended: line.leftExtended,
          rightExtended: line.rightExtended,
          multiplier: line instanceof AccLine ? line.multiplier : undefined,
        })),
      bezierPaths: selectedPaths.map((path) => ({
        anchors: path.anchors.map((anchor) => ({
          position: { x: anchor.position.x, y: anchor.position.y },
          handleIn: { x: anchor.handleIn.x, y: anchor.handleIn.y },
          handleOut: { x: anchor.handleOut.x, y: anchor.handleOut.y },
          smooth: anchor.smooth,
        })),
        type: path.lineType,
      })),
    };
  }

  private pasteSelection(selection: ClipboardSelection, dx: number, dy: number): Set<number> {
    const newIds = new Set<number>();
    if (selection.lines.length === 0 && selection.bezierPaths.length === 0) {
      return newIds;
    }

    this.store.beginTransaction();
    const addedLines = this.store.pasteLines(selection.lines.map((line) => ({
      p1: new Vec2(line.p1.x + dx, line.p1.y + dy),
      p2: new Vec2(line.p2.x + dx, line.p2.y + dy),
      type: line.type,
      flipped: line.flipped,
      leftExtended: line.leftExtended,
      rightExtended: line.rightExtended,
      multiplier: line.multiplier,
    })));
    for (const line of addedLines) {
      newIds.add(line.id);
    }

    for (const path of selection.bezierPaths) {
      const anchors = path.anchors.map((anchor) => this.createClipboardAnchor(anchor, dx, dy));
      const addedPath = this.store.addBezierPath(anchors, path.type, this.store.activeLayerId);
      for (const id of addedPath.lineIds) {
        newIds.add(id);
      }
    }
    this.store.endTransaction();
    return newIds;
  }

  private createClipboardAnchor(anchor: ClipboardBezierAnchor, dx: number, dy: number): BezierAnchor {
    return {
      position: new Vec2(anchor.position.x + dx, anchor.position.y + dy),
      handleIn: new Vec2(anchor.handleIn.x, anchor.handleIn.y),
      handleOut: new Vec2(anchor.handleOut.x, anchor.handleOut.y),
      smooth: anchor.smooth,
    };
  }

  private fitBezierAnchors(points: Vec2[]): BezierAnchor[] | null {
    if (points.length < 3) return null;
    const beziers = fitCurve(points, CURVE_FIT_ERROR);
    if (beziers.length === 0) return null;

    const anchors: BezierAnchor[] = [
      {
        position: beziers[0].start.clone(),
        handleIn: new Vec2(0, 0),
        handleOut: beziers[0].cp1.sub(beziers[0].start),
        smooth: true,
      },
    ];

    for (let i = 1; i < beziers.length; i++) {
      const previous = beziers[i - 1];
      const current = beziers[i];
      anchors.push({
        position: current.start.clone(),
        handleIn: previous.cp2.sub(previous.end),
        handleOut: current.cp1.sub(current.start),
        smooth: true,
      });
    }

    const last = beziers[beziers.length - 1];
    anchors.push({
        position: last.end.clone(),
        handleIn: last.cp2.sub(last.end),
        handleOut: new Vec2(0, 0),
        smooth: true,
      });
    return anchors;
  }

  private syncModifierState(event: Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>) {
    this.shiftHeld = event.shiftKey;
    this.ctrlHeld = event.ctrlKey;
    this.altHeld = event.altKey;
    this.metaHeld = event.metaKey;
  }

  private isRotationSnapModifierHeld(): boolean {
    return this.ctrlHeld || this.altHeld || this.metaHeld;
  }

  private onWindowKeyDown = (event: KeyboardEvent) => {
    this.syncModifierState(event);
    if (event.key === 'Shift') this.shiftHeld = true;
    if (event.key === 'Control') this.ctrlHeld = true;
    if (event.key === 'Alt') this.altHeld = true;
    if (event.key === 'Meta') this.metaHeld = true;
  };

  private onWindowKeyUp = (event: KeyboardEvent) => {
    this.syncModifierState(event);
    if (event.key === 'Shift') this.shiftHeld = false;
    if (event.key === 'Control') this.ctrlHeld = false;
    if (event.key === 'Alt') this.altHeld = false;
    if (event.key === 'Meta') this.metaHeld = false;
  };
}

function scaleCursorForCorner(corner: ScaleCorner): string {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
}

function oppositeCorner(corner: ScaleCorner): ScaleCorner {
  if (corner === 'nw') return 'se';
  if (corner === 'ne') return 'sw';
  if (corner === 'se') return 'nw';
  return 'ne';
}

function resolveAxisScale(startAxis: number, currentAxis: number): number {
  if (Math.abs(startAxis) < ENDPOINT_EPSILON) {
    return 1;
  }
  return Math.max(MIN_SCALE, currentAxis / startAxis);
}

function resolveUniformScale(startVector: Vec2, currentVector: Vec2): number {
  const lenSq = startVector.lengthSq();
  if (lenSq < ENDPOINT_EPSILON) return 1;
  const projected = currentVector.dot(startVector) / lenSq;
  return Math.max(MIN_SCALE, projected);
}

function transformPointScale(point: Vec2, origin: Vec2, scaleX: number, scaleY: number): Vec2 {
  const local = point.sub(origin);
  return new Vec2(
    origin.x + local.x * scaleX,
    origin.y + local.y * scaleY,
  );
}

function transformVectorScale(vector: Vec2, scaleX: number, scaleY: number): Vec2 {
  return new Vec2(vector.x * scaleX, vector.y * scaleY);
}

function angleBetween(vector: Vec2): number {
  return Math.atan2(vector.y, vector.x);
}

function normalizeAngle(angle: number): number {
  if (angle <= -Math.PI || angle > Math.PI) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }
  return angle;
}

function rotatePoint(point: Vec2, origin: Vec2, angle: number): Vec2 {
  return rotateVector(point.sub(origin), angle).add(origin);
}

function rotateVector(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new Vec2(
    vector.x * cos - vector.y * sin,
    vector.x * sin + vector.y * cos,
  );
}

function getGlobalKeyTarget(): Pick<Window, 'addEventListener'> | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.addEventListener !== 'function') return null;
  return window;
}

function createSvgCursor(svg: string, hotspotX: number, hotspotY: number, fallback: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/%0A/g, '')
    .replace(/%20/g, ' ');
  return `url("data:image/svg+xml,${encoded}") ${hotspotX} ${hotspotY}, ${fallback}`;
}
