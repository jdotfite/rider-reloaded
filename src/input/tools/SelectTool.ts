import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { LineType } from '../../physics/lines/LineTypes';
import { SELECT_RADIUS } from '../../constants';
import { chaikinSmooth } from '../../math/chaikin';
import { pointsToSegments } from '../../math/smooth';

type SelectState = 'idle' | 'box-selecting' | 'dragging' | 'smoothing';

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
  private smoothPending = false;
  private smoothOriginalChains: SmoothChain[] = [];
  private smoothPreviewPoints: Vec2[][] = [];
  private smoothAmount = 0;
  private smoothDragStartX = 0;

  constructor(store: TrackStore) {
    this.store = store;
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'KeyS' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (this.selectedIds.size > 0 && this.state === 'idle') {
        e.preventDefault();
        this.smoothPending = true;
        this.prepareSmoothChains();
      }
    }
    if (e.code === 'Escape' && (this.smoothPending || this.state === 'smoothing')) {
      e.preventDefault();
      this.cancelSmooth();
    }
  }

  onMouseDown(worldPos: Vec2, screenPos: Vec2) {
    // Start smoothing interaction
    if (this.smoothPending && this.smoothOriginalChains.length > 0) {
      this.state = 'smoothing';
      this.smoothDragStartX = screenPos.x;
      this.smoothAmount = 0;
      this.smoothPending = false;
      this.store.beginTransaction();
      return;
    }

    // Cancel smooth pending if clicking without chains
    if (this.smoothPending) {
      this.smoothPending = false;
    }

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
      this.selectedIds = new Set([hit.id]);
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
      this.selectedIds = new Set(lines.map(l => l.id));
      return;
    }

    if (this.state === 'dragging') {
      const dx = worldPos.x - this.dragCurrent.x;
      const dy = worldPos.y - this.dragCurrent.y;
      if (dx !== 0 || dy !== 0) {
        this.store.moveLines(this.selectedIds, dx, dy);
        this.dragCurrent = worldPos.clone();
        this.dragCommitted = true;
      }
      return;
    }

    if (this.state === 'smoothing') {
      const dx = screenPos.x - this.smoothDragStartX;
      // 200px of horizontal drag = full smoothing
      this.smoothAmount = Math.max(0, Math.min(1, dx / 200));
      this.updateSmoothPreview();
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

    if (this.state === 'smoothing') {
      this.commitSmooth();
      return;
    }
  }

  getCursor(): string | null {
    if (this.smoothPending || this.state === 'smoothing') return 'ew-resize';
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

      // Smooth pending indicator
      if (this.smoothPending) {
        ctx.fillStyle = 'rgba(68, 136, 204, 0.85)';
        ctx.font = '12px sans-serif';
        if (bounds) {
          ctx.fillText('Drag to smooth →', bounds.minX, bounds.minY - 8);
        }
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
    if (selectedLines.length === 0) {
      this.smoothPending = false;
      return;
    }

    // Group lines into connected chains by matching endpoints
    const visited = new Set<number>();
    this.smoothOriginalChains = [];

    for (const startLine of selectedLines) {
      if (visited.has(startLine.id)) continue;
      visited.add(startLine.id);

      // Build chain forward from startLine.p2
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

      // Build chain backward from startLine.p1
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
      // Remove original lines
      const allOldIds = new Set<number>();
      for (const chain of this.smoothOriginalChains) {
        for (const id of chain.lineIds) allOldIds.add(id);
      }
      this.store.removeLines(allOldIds);

      // Add smoothed lines
      const newIds = new Set<number>();
      for (let ci = 0; ci < this.smoothOriginalChains.length; ci++) {
        const chain = this.smoothOriginalChains[ci];
        const smoothed = this.smoothPreviewPoints[ci];
        const segments = pointsToSegments(smoothed);
        if (segments.length > 0) {
          const added = this.store.addLines(segments, chain.type);
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

  private cancelSmooth() {
    if (this.state === 'smoothing') {
      this.store.endTransaction();
      // Undo the transaction since we didn't make changes during drag
      // (endTransaction with no changes won't push to undo)
    }
    this.state = 'idle';
    this.smoothPending = false;
    this.smoothOriginalChains = [];
    this.smoothPreviewPoints = [];
    this.smoothAmount = 0;
  }
}
