import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { BezierAnchor } from '../../store/BezierPath';
import { LineType } from '../../physics/lines/LineTypes';
import { AccLine } from '../../physics/lines/AccLine';
import { CURVE_FIT_ERROR, SELECT_RADIUS } from '../../constants';
import { chaikinSmooth } from '../../math/chaikin';
import { pointsToSegments } from '../../math/smooth';
import { fitCurve } from '../../math/curve-fit';

type SelectState = 'idle' | 'box-selecting' | 'dragging' | 'smoothing';

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

const ENDPOINT_EPSILON = 0.01;

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

  // Smooth state
  private smoothOriginalChains: SmoothChain[] = [];
  private smoothPreviewPoints: Vec2[][] = [];
  private smoothAmount = 0;

  // Clipboard for copy/paste
  private clipboard: ClipboardSelection = { lines: [], bezierPaths: [] };
  private pasteOffset = 0; // increases with each paste so successive pastes don't stack

  // Callback when S key requests smooth (so toolbar can show slider)
  onSmoothRequest: (() => void) | null = null;
  // Callback when smooth ends (so toolbar can hide slider)
  onSmoothEnd: (() => void) | null = null;

  constructor(store: TrackStore) {
    this.store = store;
  }

  onKeyDown(e: KeyboardEvent) {
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

    // Copy
    if (primaryModifier && !e.altKey && e.code === 'KeyC' && canEditSelection) {
      e.preventDefault();
      this.copySelected();
    }
    // Cut
    if (primaryModifier && !e.altKey && e.code === 'KeyX' && canEditSelection) {
      e.preventDefault();
      this.copySelected();
      this.deleteSelected();
    }
    // Paste
    if (primaryModifier && !e.altKey && e.code === 'KeyV' && this.state === 'idle' && this.hasClipboardContent()) {
      e.preventDefault();
      this.pasteClipboard();
    }
    // Duplicate (Ctrl+D)
    if (primaryModifier && !e.altKey && e.code === 'KeyD' && canEditSelection) {
      e.preventDefault();
      this.duplicateSelected();
    }

    // Delete selected
    if ((e.code === 'Delete' || e.code === 'Backspace') && canEditSelection) {
      e.preventDefault();
      this.deleteSelected();
    }

    // Change type of selected lines (Q/W/E)
    if (!primaryModifier && !e.altKey && canEditSelection) {
      if (e.code === 'KeyQ') { this.changeSelectedType(LineType.SOLID); }
      if (e.code === 'KeyW') { this.changeSelectedType(LineType.ACC); }
      if (e.code === 'KeyE') { this.changeSelectedType(LineType.SCENERY); }
    }
  }

  onMouseDown(worldPos: Vec2, screenPos: Vec2) {
    // Block normal interaction while smoothing — user must use slider
    if (this.state === 'smoothing') return;

    // If clicking on an already selected line, start dragging
    if (this.selectedIds.size > 0) {
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

    // Try single-click select
    const hit = this.store.getLineAt(worldPos, SELECT_RADIUS);
    if (hit) {
      this.selectedIds = this.expandSelection(new Set([hit.id]));
      this.state = 'idle';
      return;
    }

    // Start box selection
    this.state = 'box-selecting';
    this.boxStart = worldPos.clone();
    this.boxEnd = worldPos.clone();
    this.selectedIds.clear();
  }

  onMouseMove(worldPos: Vec2, screenPos: Vec2) {
    if (this.state === 'box-selecting') {
      this.boxEnd = worldPos.clone();
      const minX = Math.min(this.boxStart.x, this.boxEnd.x);
      const minY = Math.min(this.boxStart.y, this.boxEnd.y);
      const maxX = Math.max(this.boxStart.x, this.boxEnd.x);
      const maxY = Math.max(this.boxStart.y, this.boxEnd.y);
      const lines = this.store.getLinesInRect(minX, minY, maxX, maxY);
      this.selectedIds = this.expandSelection(new Set(lines.map(l => l.id)));
      return;
    }

    if (this.state === 'dragging') {
      this.selectedIds = this.expandSelection(this.selectedIds);
      const dx = worldPos.x - this.dragCurrent.x;
      const dy = worldPos.y - this.dragCurrent.y;
      if (dx !== 0 || dy !== 0) {
        // Move bezier path anchors if all lines in the path are selected
        const offset = new Vec2(dx, dy);
        const movedPaths = new Set<number>();
        for (const path of this.store.bezierPaths) {
          const allSelected = path.lineIds.every(id => this.selectedIds.has(id));
          if (allSelected && path.lineIds.length > 0) {
            for (const anchor of path.anchors) {
              anchor.position = anchor.position.add(offset);
            }
            movedPaths.add(path.id);
          }
        }

        this.store.moveLines(this.selectedIds, dx, dy);
        this.dragCurrent = worldPos.clone();
        this.dragCommitted = true;
      }
      return;
    }
  }

  onMouseUp(worldPos: Vec2, screenPos: Vec2) {
    if (this.state === 'box-selecting') {
      this.state = 'idle';
      return;
    }

    if (this.state === 'dragging') {
      this.store.endTransaction();
      this.state = 'idle';
      return;
    }
  }

  getCursor(): string | null {
    return null;
  }

  clearSelection() {
    this.selectedIds.clear();
    this.state = 'idle';
    this.cancelSmooth();
  }

  deleteSelected() {
    if (this.selectedIds.size === 0) return;
    this.store.removeLines(this.selectedIds);
    this.selectedIds.clear();
  }

  getSelectedCount(): number {
    return this.selectedIds.size;
  }

  /** Copy selected lines to internal clipboard */
  copySelected() {
    if (this.selectedIds.size === 0) return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    this.clipboard = this.captureSelection(this.selectedIds);
    this.pasteOffset = 0;
  }

  /** Paste clipboard lines with a small offset */
  pasteClipboard() {
    if (!this.hasClipboardContent()) return;
    const nextOffset = this.pasteOffset + 20;
    const newIds = this.pasteSelection(this.clipboard, nextOffset, nextOffset);
    if (newIds.size === 0) return;
    this.pasteOffset = nextOffset;
    this.selectedIds = newIds;
  }

  /** Duplicate selected lines in-place with offset */
  duplicateSelected() {
    if (this.selectedIds.size === 0) return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    const captured = this.captureSelection(this.selectedIds);
    const newIds = this.pasteSelection(captured, 20, 20);
    if (newIds.size === 0) return;
    this.selectedIds = newIds;
  }

  /** Change the type of all selected lines */
  changeSelectedType(newType: LineType) {
    if (this.selectedIds.size === 0 || this.state !== 'idle') return;
    this.selectedIds = this.expandSelection(this.selectedIds);
    this.store.changeLineTypes(this.selectedIds, newType);
  }

  // ── Public smooth API (driven by toolbar slider) ──

  /** Begin smoothing. Returns false if nothing to smooth. */
  startSmooth(): boolean {
    if (this.selectedIds.size === 0 || this.state !== 'idle') return false;
    this.prepareSmoothChains();
    if (this.smoothOriginalChains.length === 0) return false;
    this.state = 'smoothing';
    this.smoothAmount = 0;
    this.store.beginTransaction();
    return true;
  }

  /** Set smooth amount (0–1) and update live preview. */
  setSmoothAmount(amount: number) {
    if (this.state !== 'smoothing') return;
    this.smoothAmount = Math.max(0, Math.min(1, amount));
    this.updateSmoothPreview();
  }

  /** Commit the current smooth and return to idle. */
  applySmooth() {
    if (this.state !== 'smoothing') return;
    this.commitSmooth();
  }

  /** Cancel smoothing and return to idle. */
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
    // Smooth preview
    if (this.state === 'smoothing' && this.smoothPreviewPoints.length > 0) {
      // Faint original lines
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

      // Blue smoothed preview
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

    // Draw selected lines with highlight
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

      // Bounding box
      const bounds = this.getSelectionBounds();
      if (bounds) {
        ctx.strokeStyle = 'rgba(68, 136, 204, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.minX - 2, bounds.minY - 2, bounds.maxX - bounds.minX + 4, bounds.maxY - bounds.minY + 4);
        ctx.setLineDash([]);
      }
    }

    // Box selection rectangle
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

  private getSelectionBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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

  // ── Smooth helpers ──

  private prepareSmoothChains() {
    const selectedLines = this.store.lines.filter(l => this.selectedIds.has(l.id));
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
        for (const l of selectedLines) {
          if (visited.has(l.id)) continue;
          if (l.p1.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(l.id);
            forwardIds.push(l.id);
            forwardPoints.push(l.p2.clone());
            tip = l.p2;
            found = true;
            break;
          }
          if (l.p2.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(l.id);
            forwardIds.push(l.id);
            forwardPoints.push(l.p1.clone());
            tip = l.p1;
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
        for (const l of selectedLines) {
          if (visited.has(l.id)) continue;
          if (l.p2.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(l.id);
            backwardIds.unshift(l.id);
            backwardPoints.unshift(l.p1.clone());
            tip = l.p1;
            found = true;
            break;
          }
          if (l.p1.distanceTo(tip) < ENDPOINT_EPSILON) {
            visited.add(l.id);
            backwardIds.unshift(l.id);
            backwardPoints.unshift(l.p2.clone());
            tip = l.p2;
            found = true;
            break;
          }
        }
      }

      const chainIds = [...backwardIds, ...forwardIds];
      const chainPoints = [...backwardPoints, ...forwardPoints];

      this.smoothOriginalChains.push({
        lineIds: chainIds,
        points: chainPoints,
        type: startLine.type,
        layer: startLine.layer,
      });
    }

    this.smoothPreviewPoints = this.smoothOriginalChains.map(c => c.points.map(p => p.clone()));
  }

  private updateSmoothPreview() {
    this.smoothPreviewPoints = this.smoothOriginalChains.map(chain =>
      chaikinSmooth(chain.points, this.smoothAmount)
    );
  }

  private commitSmooth() {
    if (this.smoothAmount > 0) {
      const allOldIds = new Set<number>();
      for (const chain of this.smoothOriginalChains) {
        for (const id of chain.lineIds) allOldIds.add(id);
      }
      this.store.removeLines(allOldIds);

      const newIds = new Set<number>();
      for (let ci = 0; ci < this.smoothOriginalChains.length; ci++) {
        const chain = this.smoothOriginalChains[ci];
        const smoothed = this.smoothPreviewPoints[ci];
        const anchors = this.fitBezierAnchors(smoothed);
        if (anchors) {
          const addedPath = this.store.addBezierPath(anchors, chain.type, chain.layer);
          for (const id of addedPath.lineIds) newIds.add(id);
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
          for (const line of added) newIds.add(line.id);
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
        .filter(line => lineIds.has(line.id) && !pathLineIds.has(line.id))
        .map(line => ({
          p1: { x: line.p1.x, y: line.p1.y },
          p2: { x: line.p2.x, y: line.p2.y },
          type: line.type,
          flipped: line.flipped,
          leftExtended: line.leftExtended,
          rightExtended: line.rightExtended,
          multiplier: line instanceof AccLine ? line.multiplier : undefined,
        })),
      bezierPaths: selectedPaths.map(path => ({
        anchors: path.anchors.map(anchor => ({
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
    const addedLines = this.store.pasteLines(selection.lines.map(line => ({
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
      const anchors = path.anchors.map(anchor => this.createClipboardAnchor(anchor, dx, dy));
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
}
