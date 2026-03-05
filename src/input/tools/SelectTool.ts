import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { Line } from '../../physics/lines/Line';
import { SELECT_RADIUS } from '../../constants';

type SelectState = 'idle' | 'box-selecting' | 'dragging';

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

  constructor(store: TrackStore) {
    this.store = store;
  }

  onMouseDown(worldPos: Vec2) {
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

  onMouseMove(worldPos: Vec2) {
    if (this.state === 'box-selecting') {
      this.boxEnd = worldPos.clone();
      // Live update selection
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
        // Update selectedIds to point to new line objects
        const newIds = new Set<number>();
        for (const line of this.store.lines) {
          // After moveLines, new lines were created with new IDs
          // We need to track by position instead — but since moveLines replaces,
          // let's just select all lines on the active layer (we'll refine below)
        }
        // Actually moveLines creates new Line objects with new IDs.
        // Let's track the new IDs by rebuilding after move.
        this.rebuildSelectionAfterMove();
      }
    }
  }

  onMouseUp(worldPos: Vec2) {
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

  clearSelection() {
    this.selectedIds.clear();
    this.state = 'idle';
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

  private rebuildSelectionAfterMove() {
    // After moveLines replaces lines, old IDs are gone.
    // moveLines creates new lines, so we need to find them.
    // Since moveLines processes all lines, new lines that were moved
    // will have new IDs. We track by counting lines on the active layer.
    // Better approach: moveLines should return new IDs.
    // For now, select all lines on active layer that aren't in the old set of non-selected lines.
    const oldNonSelected = new Set(
      this.store.lines
        .filter(l => !this.selectedIds.has(l.id))
        .map(l => l.id)
    );
    this.selectedIds = new Set(
      this.store.lines
        .filter(l => !oldNonSelected.has(l.id))
        .map(l => l.id)
    );
  }
}
