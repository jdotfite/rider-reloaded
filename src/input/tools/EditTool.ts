import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { HANDLE_SIZE, HANDLE_HIT_SIZE, SNAP_RADIUS, SELECT_RADIUS } from '../../constants';
import { sampleCubicBezier } from '../../math/bezier';

type EditState = 'idle' | 'dragging-endpoint' | 'dragging-line' | 'dragging-cp';

interface HandleHit {
  lineId: number;
  endpoint: 'p1' | 'p2';
  position: Vec2;
}

export class EditTool implements Tool {
  name = 'edit';
  private store: TrackStore;
  private getZoom: () => number;
  private getSnapEnabled: () => boolean;

  private state: EditState = 'idle';
  private hoveredHandle: HandleHit | null = null;
  private dragHandle: HandleHit | null = null;
  private dragStart = new Vec2();
  private dragCurrent = new Vec2();

  // Line body dragging
  private dragLineId: number | null = null;
  private dragLineStart = new Vec2();

  // Curve CP dragging
  private dragCurveGroupId: number | null = null;
  private dragCpIndex: 0 | 1 = 0;

  // Hovered line (for C-key conversion + line body drag)
  private hoveredLineId: number | null = null;

  private shiftHeld = false;

  constructor(store: TrackStore, getZoom: () => number, getSnapEnabled: () => boolean) {
    this.store = store;
    this.getZoom = getZoom;
    this.getSnapEnabled = getSnapEnabled;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.shiftHeld = true;
      if (e.code === 'KeyC' && this.state === 'idle') this.tryConvertToCurve();
      if (e.code === 'KeyF' && this.state === 'idle') this.tryFlipLine();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shiftHeld = false;
    });
  }

  private worldHandleRadius(): number {
    return HANDLE_HIT_SIZE / this.getZoom();
  }

  private shouldSnap(): boolean {
    const snapEnabled = this.getSnapEnabled();
    // Shift inverts the snap behavior
    return snapEnabled !== this.shiftHeld;
  }

  private trySnap(pos: Vec2, excludeLineIds?: Set<number>): Vec2 {
    if (!this.shouldSnap()) return pos;
    const snap = this.store.findNearestEndpoint(pos, SNAP_RADIUS, excludeLineIds);
    return snap ?? pos;
  }

  onMouseDown(worldPos: Vec2) {
    const hitRadius = this.worldHandleRadius();

    // Check curve CP handles first
    const cpHit = this.findCpHandle(worldPos, hitRadius);
    if (cpHit) {
      this.state = 'dragging-cp';
      this.dragCurveGroupId = cpHit.groupId;
      this.dragCpIndex = cpHit.cpIndex;
      this.dragStart = worldPos.clone();
      this.store.beginTransaction();
      return;
    }

    // Check endpoint handles
    const handle = this.store.findNearestHandle(worldPos, hitRadius);
    if (handle) {
      this.state = 'dragging-endpoint';
      this.dragHandle = handle;
      this.dragStart = worldPos.clone();
      this.store.beginTransaction();
      return;
    }

    // Check line body for dragging
    const line = this.store.getLineAt(worldPos, SELECT_RADIUS / this.getZoom());
    if (line) {
      this.state = 'dragging-line';
      this.dragLineId = line.id;
      this.dragLineStart = worldPos.clone();
      this.dragCurrent = worldPos.clone();
      this.store.beginTransaction();
      return;
    }
  }

  onMouseMove(worldPos: Vec2) {
    if (this.state === 'dragging-endpoint' && this.dragHandle) {
      const excludeIds = new Set([this.dragHandle.lineId]);
      const snapped = this.trySnap(worldPos, excludeIds);
      const line = this.store.lines.find(l => l.id === this.dragHandle!.lineId);
      if (line) {
        const newP1 = this.dragHandle.endpoint === 'p1' ? snapped : line.p1;
        const newP2 = this.dragHandle.endpoint === 'p2' ? snapped : line.p2;
        this.store.replaceLine(this.dragHandle.lineId, newP1, newP2);
      }
      return;
    }

    if (this.state === 'dragging-line' && this.dragLineId !== null) {
      const dx = worldPos.x - this.dragCurrent.x;
      const dy = worldPos.y - this.dragCurrent.y;
      if (dx !== 0 || dy !== 0) {
        this.store.moveLines(new Set([this.dragLineId]), dx, dy);
        this.dragCurrent = worldPos.clone();
      }
      return;
    }

    if (this.state === 'dragging-cp' && this.dragCurveGroupId !== null) {
      this.updateCurveCp(worldPos);
      return;
    }

    // Idle: update hover state
    const hitRadius = this.worldHandleRadius();

    // Check CP handles first
    const cpHit = this.findCpHandle(worldPos, hitRadius);
    if (cpHit) {
      this.hoveredHandle = null;
      this.hoveredLineId = null;
      return;
    }

    const handle = this.store.findNearestHandle(worldPos, hitRadius);
    this.hoveredHandle = handle;

    // Check line body hover
    const line = this.store.getLineAt(worldPos, SELECT_RADIUS / this.getZoom());
    this.hoveredLineId = line ? line.id : null;
  }

  onMouseUp() {
    if (this.state === 'dragging-endpoint' || this.state === 'dragging-line' || this.state === 'dragging-cp') {
      this.store.endTransaction();
    }
    this.state = 'idle';
    this.dragHandle = null;
    this.dragLineId = null;
    this.dragCurveGroupId = null;
  }

  getCursor(): string | null {
    if (this.state === 'dragging-endpoint' || this.state === 'dragging-line' || this.state === 'dragging-cp') {
      return 'grabbing';
    }
    if (this.hoveredHandle || this.findCpHandleHovered()) {
      return 'grab';
    }
    if (this.hoveredLineId !== null) {
      return 'grab';
    }
    return null;
  }

  render(ctx: CanvasRenderingContext2D) {
    const zoom = this.getZoom();
    const handleSize = HANDLE_SIZE / zoom;
    const half = handleSize / 2;

    // Draw handles for all endpoints on active layer
    for (const line of this.store.lines) {
      if (line.layer !== this.store.activeLayerId) continue;

      for (const endpoint of ['p1', 'p2'] as const) {
        const p = line[endpoint];
        const isHovered = this.hoveredHandle &&
          this.hoveredHandle.lineId === line.id &&
          this.hoveredHandle.endpoint === endpoint;
        const isDragging = this.state === 'dragging-endpoint' &&
          this.dragHandle &&
          this.dragHandle.lineId === line.id &&
          this.dragHandle.endpoint === endpoint;

        if (isHovered || isDragging) {
          ctx.fillStyle = '#4488cc';
          ctx.strokeStyle = '#2266aa';
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#888888';
        }
        ctx.lineWidth = 1 / zoom;
        ctx.fillRect(p.x - half, p.y - half, handleSize, handleSize);
        ctx.strokeRect(p.x - half, p.y - half, handleSize, handleSize);
      }
    }

    // Highlight hovered line
    if (this.hoveredLineId !== null && this.state === 'idle') {
      const line = this.store.lines.find(l => l.id === this.hoveredLineId);
      if (line) {
        ctx.strokeStyle = 'rgba(68, 136, 204, 0.5)';
        ctx.lineWidth = 3 / zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.p1.x, line.p1.y);
        ctx.lineTo(line.p2.x, line.p2.y);
        ctx.stroke();
      }
    }

    // Draw curve group CP handles
    this.renderCurveHandles(ctx, zoom);
  }

  private renderCurveHandles(ctx: CanvasRenderingContext2D, zoom: number) {
    const cpRadius = HANDLE_SIZE / zoom;

    for (const group of this.store.curveGroups) {
      // Only show CP handles when hovering a line in this group
      const isGroupHovered = this.hoveredLineId !== null &&
        group.lineIds.includes(this.hoveredLineId);
      const isGroupDragging = this.state === 'dragging-cp' &&
        this.dragCurveGroupId === group.id;

      if (!isGroupHovered && !isGroupDragging) continue;

      // Highlight all segments in this group
      ctx.strokeStyle = 'rgba(68, 136, 204, 0.4)';
      ctx.lineWidth = 3 / zoom;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const lineId of group.lineIds) {
        const line = this.store.lines.find(l => l.id === lineId);
        if (line) {
          ctx.moveTo(line.p1.x, line.p1.y);
          ctx.lineTo(line.p2.x, line.p2.y);
        }
      }
      ctx.stroke();

      // Dashed guide lines
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.2)';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([6 / zoom, 6 / zoom]);
      ctx.beginPath();
      ctx.moveTo(group.startPoint.x, group.startPoint.y);
      ctx.lineTo(group.cp1.x, group.cp1.y);
      ctx.lineTo(group.cp2.x, group.cp2.y);
      ctx.lineTo(group.endPoint.x, group.endPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // CP1 (blue circle)
      ctx.fillStyle = '#4488cc';
      ctx.strokeStyle = '#2266aa';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(group.cp1.x, group.cp1.y, cpRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // CP2 (red circle)
      ctx.fillStyle = '#cc4444';
      ctx.strokeStyle = '#aa2222';
      ctx.beginPath();
      ctx.arc(group.cp2.x, group.cp2.y, cpRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private findCpHandle(worldPos: Vec2, radius: number): { groupId: number; cpIndex: 0 | 1 } | null {
    const radiusSq = radius * radius;
    for (const group of this.store.curveGroups) {
      // Only interactive when hovering a line in the group or already dragging
      const isVisible = this.hoveredLineId !== null && group.lineIds.includes(this.hoveredLineId);
      const isDragging = this.state === 'dragging-cp' && this.dragCurveGroupId === group.id;
      if (!isVisible && !isDragging) continue;

      if (worldPos.distanceToSq(group.cp1) < radiusSq) {
        return { groupId: group.id, cpIndex: 0 };
      }
      if (worldPos.distanceToSq(group.cp2) < radiusSq) {
        return { groupId: group.id, cpIndex: 1 };
      }
    }
    return null;
  }

  private findCpHandleHovered(): boolean {
    // Quick check used by getCursor
    const hitRadius = this.worldHandleRadius();
    for (const group of this.store.curveGroups) {
      const isVisible = this.hoveredLineId !== null && group.lineIds.includes(this.hoveredLineId);
      if (!isVisible) continue;
      return true; // If group is visible, CP handles are shown
    }
    return false;
  }

  private updateCurveCp(worldPos: Vec2) {
    const groupIndex = this.store.curveGroups.findIndex(g => g.id === this.dragCurveGroupId);
    if (groupIndex === -1) return;
    const group = this.store.curveGroups[groupIndex];

    // Update the control point
    if (this.dragCpIndex === 0) {
      group.cp1 = worldPos.clone();
    } else {
      group.cp2 = worldPos.clone();
    }

    // Resample the curve
    const segments = sampleCubicBezier(group.startPoint, group.cp1, group.cp2, group.endPoint);

    // Find the line type from existing segments
    const existingLine = this.store.lines.find(l => group.lineIds.includes(l.id));
    if (!existingLine) return;
    const lineType = existingLine.type;
    const layer = existingLine.layer;

    // Detach group before removeLines to prevent invalidateCurveGroups from destroying it
    this.store.curveGroups.splice(groupIndex, 1);

    // Remove old segments
    this.store.removeLines(new Set(group.lineIds));

    // Add new segments with extensions
    const added: number[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const line = this.store.createLinePublic(seg.p1, seg.p2, lineType, {
        leftExtended: i > 0,
        rightExtended: i < segments.length - 1,
        layer,
      });
      this.store.lines.push(line);
      added.push(line.id);
    }

    // Reattach group with updated line IDs
    group.lineIds = added;
    this.store.curveGroups.push(group);
  }

  private tryConvertToCurve() {
    if (this.hoveredLineId === null) return;

    // Don't convert if already in a curve group
    const existingGroup = this.store.curveGroups.find(g => g.lineIds.includes(this.hoveredLineId!));
    if (existingGroup) return;

    const line = this.store.lines.find(l => l.id === this.hoveredLineId);
    if (!line) return;

    const start = line.p1.clone();
    const end = line.p2.clone();
    const cp1 = start.lerp(end, 1 / 3);
    const cp2 = start.lerp(end, 2 / 3);

    this.store.beginTransaction();

    // Remove the original line
    this.store.removeLines(new Set([line.id]));

    // Create curve segments
    const segments = sampleCubicBezier(start, cp1, cp2, end);
    const added: number[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const newLine = this.store.createLinePublic(seg.p1, seg.p2, line.type, {
        leftExtended: i > 0,
        rightExtended: i < segments.length - 1,
        layer: line.layer,
      });
      this.store.lines.push(newLine);
      added.push(newLine.id);
    }

    // Add curve group
    this.store.curveGroups.push({
      id: this.store.nextCurveGroupId++,
      lineIds: added,
      startPoint: start,
      endPoint: end,
      cp1,
      cp2,
    });

    this.store.endTransaction();
    this.hoveredLineId = null;
  }

  private tryFlipLine() {
    if (this.hoveredLineId === null) return;
    this.store.flipLine(this.hoveredLineId);
  }
}
