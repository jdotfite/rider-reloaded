import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { HANDLE_SIZE, HANDLE_HIT_SIZE, SNAP_RADIUS, SELECT_RADIUS } from '../../constants';
import { BezierPath, BezierAnchor } from '../../store/BezierPath';
import { cubicBezierPoint } from '../../math/bezier';

type EditState = 'idle' | 'dragging-endpoint' | 'dragging-line' | 'dragging-anchor' | 'dragging-handle';

interface HandleHit {
  lineId: number;
  endpoint: 'p1' | 'p2';
  position: Vec2;
}

interface AnchorHit {
  pathId: number;
  anchorIndex: number;
}

interface BezierHandleHit {
  pathId: number;
  anchorIndex: number;
  handleType: 'in' | 'out';
}

export class EditTool implements Tool {
  name = 'edit';
  private store: TrackStore;
  private getZoom: () => number;
  private getSnapEnabled: () => boolean;

  private state: EditState = 'idle';
  private hoveredHandle: HandleHit | null = null;
  private dragHandle: HandleHit | null = null;
  private dragConnected: Array<{ lineId: number; endpoint: 'p1' | 'p2' }> = [];
  private dragStart = new Vec2();
  private dragCurrent = new Vec2();

  // Line body dragging
  private dragLineId: number | null = null;
  private dragLineStart = new Vec2();

  // BezierPath anchor dragging
  private dragAnchorHit: AnchorHit | null = null;

  // BezierPath handle dragging
  private dragBezierHandle: BezierHandleHit | null = null;
  private altHeld = false;

  // Hovered state
  private hoveredLineId: number | null = null;
  private hoveredAnchor: AnchorHit | null = null;
  private hoveredBezierHandle: BezierHandleHit | null = null;

  // Active path (the one whose handles are shown)
  private activePathId: number | null = null;

  // Double-click detection
  private lastClickTime = 0;
  private lastClickPos = new Vec2();

  private shiftHeld = false;

  // Selected anchor for deletion
  private selectedAnchor: AnchorHit | null = null;

  constructor(store: TrackStore, getZoom: () => number, getSnapEnabled: () => boolean) {
    this.store = store;
    this.getZoom = getZoom;
    this.getSnapEnabled = getSnapEnabled;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.shiftHeld = true;
      if (e.key === 'Alt') this.altHeld = true;
      if (e.code === 'KeyC' && this.state === 'idle') this.tryConvertToBezierPath();
      if (e.code === 'KeyF' && this.state === 'idle') this.tryFlipLine();
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.state === 'idle') this.tryDeleteAnchor();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shiftHeld = false;
      if (e.key === 'Alt') this.altHeld = false;
    });
  }

  /** Set the active bezier path (e.g. after CurveTool commits a new curve) */
  setActivePath(pathId: number) {
    this.activePathId = pathId;
    this.selectedAnchor = null;
  }

  private worldHandleRadius(): number {
    return HANDLE_HIT_SIZE / this.getZoom();
  }

  private shouldSnap(): boolean {
    const snapEnabled = this.getSnapEnabled();
    return snapEnabled !== this.shiftHeld;
  }

  private trySnap(pos: Vec2, excludeLineIds?: Set<number>): Vec2 {
    if (!this.shouldSnap()) return pos;
    const snap = this.store.findNearestEndpoint(pos, SNAP_RADIUS, excludeLineIds);
    return snap ?? pos;
  }

  onMouseDown(worldPos: Vec2) {
    const hitRadius = this.worldHandleRadius();
    const now = Date.now();

    // Check double-click
    if (now - this.lastClickTime < 300 && worldPos.distanceTo(this.lastClickPos) < 5 / this.getZoom()) {
      // Double-click on anchor: toggle smooth/corner
      const anchorHit = this.findAnchorHit(worldPos, hitRadius);
      if (anchorHit) {
        this.toggleAnchorSmooth(anchorHit);
        this.lastClickTime = 0;
        return;
      }
      // Double-click on path segment: add anchor point
      if (this.activePathId !== null) {
        const added = this.tryAddAnchorOnPath(worldPos);
        if (added) {
          this.lastClickTime = 0;
          return;
        }
      }
    }
    this.lastClickTime = now;
    this.lastClickPos = worldPos.clone();

    // Priority 1: BezierPath handle dots
    const handleHit = this.findBezierHandleHit(worldPos, hitRadius);
    if (handleHit) {
      this.state = 'dragging-handle';
      this.dragBezierHandle = handleHit;
      this.dragStart = worldPos.clone();
      this.store.beginTransaction();
      return;
    }

    // Priority 2: BezierPath anchor points
    const anchorHit = this.findAnchorHit(worldPos, hitRadius);
    if (anchorHit) {
      this.state = 'dragging-anchor';
      this.dragAnchorHit = anchorHit;
      this.selectedAnchor = anchorHit;
      this.dragStart = worldPos.clone();
      this.dragCurrent = worldPos.clone();
      this.store.beginTransaction();
      return;
    }

    // Priority 3: Non-bezier endpoint handles — auto-convert to bezier on click
    const handle = this.findNonBezierHandle(worldPos, hitRadius);
    if (handle) {
      // Auto-convert the plain line to a bezier path so user can pull handles
      const converted = this.autoConvertToBezier(handle.lineId);
      if (converted) {
        // Find the anchor that corresponds to the endpoint the user clicked
        const path = this.store.bezierPaths.find(p => p.id === converted.id);
        if (path) {
          const anchorIdx = handle.endpoint === 'p1' ? 0 : path.anchors.length - 1;
          this.activePathId = path.id;
          this.state = 'dragging-anchor';
          this.dragAnchorHit = { pathId: path.id, anchorIndex: anchorIdx };
          this.selectedAnchor = this.dragAnchorHit;
          this.dragStart = worldPos.clone();
          this.dragCurrent = worldPos.clone();
          // Transaction already started inside autoConvertToBezier
          return;
        }
      }
      // Fallback: plain drag if conversion failed
      this.state = 'dragging-endpoint';
      this.dragHandle = handle;
      this.dragStart = worldPos.clone();
      this.dragConnected = this.findCoincidentEndpoints(handle.position, handle.lineId);
      this.store.beginTransaction();
      return;
    }

    // Priority 4: Line body drag
    const line = this.store.getLineAt(worldPos, SELECT_RADIUS / this.getZoom());
    if (line) {
      // Auto-convert non-bezier lines to bezier on click so handles are available
      let path = this.store.findBezierPathForLine(line.id);
      if (!path) {
        const converted = this.autoConvertToBezier(line.id);
        if (converted) {
          path = converted;
        }
      }
      this.activePathId = path ? path.id : null;

      this.state = 'dragging-line';
      this.dragLineId = line.id;
      this.dragLineStart = worldPos.clone();
      this.dragCurrent = worldPos.clone();
      if (!path) this.store.beginTransaction();
      // If we auto-converted, transaction is already open
      return;
    }

    // Click on empty space — deactivate path and clear selection
    this.activePathId = null;
    this.selectedAnchor = null;
  }

  onMouseMove(worldPos: Vec2) {
    if (this.state === 'dragging-handle' && this.dragBezierHandle) {
      this.updateBezierHandle(worldPos);
      return;
    }

    if (this.state === 'dragging-anchor' && this.dragAnchorHit) {
      this.updateAnchorPosition(worldPos);
      return;
    }

    if (this.state === 'dragging-endpoint' && this.dragHandle) {
      const excludeIds = new Set([this.dragHandle.lineId, ...this.dragConnected.map(c => c.lineId)]);
      const snapped = this.trySnap(worldPos, excludeIds);

      const line = this.store.lines.find(l => l.id === this.dragHandle!.lineId);
      if (line) {
        const newP1 = this.dragHandle.endpoint === 'p1' ? snapped : line.p1;
        const newP2 = this.dragHandle.endpoint === 'p2' ? snapped : line.p2;
        this.store.replaceLine(this.dragHandle.lineId, newP1, newP2);
      }

      for (const conn of this.dragConnected) {
        const connLine = this.store.lines.find(l => l.id === conn.lineId);
        if (connLine) {
          const cP1 = conn.endpoint === 'p1' ? snapped : connLine.p1;
          const cP2 = conn.endpoint === 'p2' ? snapped : connLine.p2;
          this.store.replaceLine(conn.lineId, cP1, cP2);
        }
      }
      return;
    }

    if (this.state === 'dragging-line' && this.dragLineId !== null) {
      const dx = worldPos.x - this.dragCurrent.x;
      const dy = worldPos.y - this.dragCurrent.y;
      if (dx !== 0 || dy !== 0) {
        // If the line belongs to a bezier path, move all anchors and regenerate
        const path = this.store.findBezierPathForLine(this.dragLineId);
        if (path) {
          const offset = new Vec2(dx, dy);
          for (const anchor of path.anchors) {
            anchor.position = anchor.position.add(offset);
          }
          this.store.regenerateBezierPathLines(path.id);
        } else {
          this.store.moveLines(new Set([this.dragLineId]), dx, dy);
        }
        this.dragCurrent = worldPos.clone();
      }
      return;
    }

    // Idle: update hover state
    const hitRadius = this.worldHandleRadius();

    // Check bezier handle hover
    const handleHit = this.findBezierHandleHit(worldPos, hitRadius);
    this.hoveredBezierHandle = handleHit;

    // Check anchor hover
    const anchorHit = this.findAnchorHit(worldPos, hitRadius);
    this.hoveredAnchor = anchorHit;

    // Check non-bezier endpoint handle
    if (!handleHit && !anchorHit) {
      this.hoveredHandle = this.findNonBezierHandle(worldPos, hitRadius);
    } else {
      this.hoveredHandle = null;
    }

    // Check line body hover
    const line = this.store.getLineAt(worldPos, SELECT_RADIUS / this.getZoom());
    this.hoveredLineId = line ? line.id : null;

    // Update active path based on hovered line
    if (this.hoveredLineId !== null) {
      const path = this.store.findBezierPathForLine(this.hoveredLineId);
      if (path) {
        this.activePathId = path.id;
      }
    }
  }

  onMouseUp() {
    if (this.state !== 'idle') {
      this.store.endTransaction();
    }
    this.state = 'idle';
    this.dragHandle = null;
    this.dragConnected = [];
    this.dragLineId = null;
    this.dragAnchorHit = null;
    this.dragBezierHandle = null;
  }

  getCursor(): string | null {
    if (this.state === 'dragging-endpoint' || this.state === 'dragging-line' ||
        this.state === 'dragging-anchor' || this.state === 'dragging-handle') {
      return 'grabbing';
    }
    if (this.hoveredBezierHandle || this.hoveredAnchor || this.hoveredHandle) {
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

    // Draw BezierPath overlays for the active path
    if (this.activePathId !== null) {
      const path = this.store.bezierPaths.find(p => p.id === this.activePathId);
      if (path) {
        this.renderBezierPath(ctx, path, zoom);
      }
    }

    // Draw handles for non-bezier endpoints on active layer
    for (const line of this.store.lines) {
      if (line.layer !== this.store.activeLayerId) continue;
      // Skip lines that belong to a bezier path (their anchors are rendered separately)
      if (this.store.findBezierPathForLine(line.id)) continue;

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

    // Highlight hovered line (non-bezier only)
    if (this.hoveredLineId !== null && this.state === 'idle' && !this.store.findBezierPathForLine(this.hoveredLineId)) {
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
  }

  private renderBezierPath(ctx: CanvasRenderingContext2D, path: BezierPath, zoom: number) {
    const handleSize = HANDLE_SIZE / zoom;
    const half = handleSize / 2;
    const cpRadius = (HANDLE_SIZE - 1) / zoom;

    // Highlight all segments in this path
    ctx.strokeStyle = 'rgba(68, 136, 204, 0.35)';
    ctx.lineWidth = 3 / zoom;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const lineId of path.lineIds) {
      const line = this.store.lines.find(l => l.id === lineId);
      if (line) {
        ctx.moveTo(line.p1.x, line.p1.y);
        ctx.lineTo(line.p2.x, line.p2.y);
      }
    }
    ctx.stroke();

    // Draw anchors and handles
    for (let i = 0; i < path.anchors.length; i++) {
      const anchor = path.anchors[i];
      const pos = anchor.position;
      const handleInPos = pos.add(anchor.handleIn);
      const handleOutPos = pos.add(anchor.handleOut);
      const hasHandleIn = anchor.handleIn.lengthSq() > 0.01;
      const hasHandleOut = anchor.handleOut.lengthSq() > 0.01;

      // Dashed handle lines
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.3)';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      if (hasHandleIn) {
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(handleInPos.x, handleInPos.y);
      }
      if (hasHandleOut) {
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(handleOutPos.x, handleOutPos.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Handle dots
      if (hasHandleIn) {
        const isHovered = this.hoveredBezierHandle &&
          this.hoveredBezierHandle.pathId === path.id &&
          this.hoveredBezierHandle.anchorIndex === i &&
          this.hoveredBezierHandle.handleType === 'in';
        const isDragging = this.state === 'dragging-handle' &&
          this.dragBezierHandle &&
          this.dragBezierHandle.pathId === path.id &&
          this.dragBezierHandle.anchorIndex === i &&
          this.dragBezierHandle.handleType === 'in';
        ctx.fillStyle = (isHovered || isDragging) ? '#2266aa' : '#4488cc';
        ctx.strokeStyle = '#2266aa';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(handleInPos.x, handleInPos.y, cpRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (hasHandleOut) {
        const isHovered = this.hoveredBezierHandle &&
          this.hoveredBezierHandle.pathId === path.id &&
          this.hoveredBezierHandle.anchorIndex === i &&
          this.hoveredBezierHandle.handleType === 'out';
        const isDragging = this.state === 'dragging-handle' &&
          this.dragBezierHandle &&
          this.dragBezierHandle.pathId === path.id &&
          this.dragBezierHandle.anchorIndex === i &&
          this.dragBezierHandle.handleType === 'out';
        ctx.fillStyle = (isHovered || isDragging) ? '#aa2222' : '#cc4444';
        ctx.strokeStyle = '#aa2222';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(handleOutPos.x, handleOutPos.y, cpRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Anchor point (square)
      const isAnchorHovered = this.hoveredAnchor &&
        this.hoveredAnchor.pathId === path.id &&
        this.hoveredAnchor.anchorIndex === i;
      const isAnchorDragging = this.state === 'dragging-anchor' &&
        this.dragAnchorHit &&
        this.dragAnchorHit.pathId === path.id &&
        this.dragAnchorHit.anchorIndex === i;
      const isAnchorSelected = this.selectedAnchor &&
        this.selectedAnchor.pathId === path.id &&
        this.selectedAnchor.anchorIndex === i;

      if (anchor.smooth) {
        ctx.fillStyle = (isAnchorHovered || isAnchorDragging || isAnchorSelected) ? '#2266aa' : '#4488cc';
        ctx.strokeStyle = '#2266aa';
      } else {
        ctx.fillStyle = (isAnchorHovered || isAnchorDragging || isAnchorSelected) ? '#cccccc' : '#ffffff';
        ctx.strokeStyle = '#888888';
      }
      ctx.lineWidth = 1 / zoom;
      ctx.fillRect(pos.x - half, pos.y - half, handleSize, handleSize);
      ctx.strokeRect(pos.x - half, pos.y - half, handleSize, handleSize);
    }
  }

  // ── Hit testing ──

  private findBezierHandleHit(worldPos: Vec2, radius: number): BezierHandleHit | null {
    const radiusSq = radius * radius;
    // Only check handles for the active path
    if (this.activePathId === null) return null;
    const path = this.store.bezierPaths.find(p => p.id === this.activePathId);
    if (!path) return null;

    let bestDist = radiusSq;
    let best: BezierHandleHit | null = null;

    for (let i = 0; i < path.anchors.length; i++) {
      const anchor = path.anchors[i];
      const pos = anchor.position;

      if (anchor.handleIn.lengthSq() > 0.01) {
        const handleInPos = pos.add(anchor.handleIn);
        const d = worldPos.distanceToSq(handleInPos);
        if (d < bestDist) {
          bestDist = d;
          best = { pathId: path.id, anchorIndex: i, handleType: 'in' };
        }
      }

      if (anchor.handleOut.lengthSq() > 0.01) {
        const handleOutPos = pos.add(anchor.handleOut);
        const d = worldPos.distanceToSq(handleOutPos);
        if (d < bestDist) {
          bestDist = d;
          best = { pathId: path.id, anchorIndex: i, handleType: 'out' };
        }
      }
    }
    return best;
  }

  private findAnchorHit(worldPos: Vec2, radius: number): AnchorHit | null {
    const radiusSq = radius * radius;
    if (this.activePathId === null) return null;
    const path = this.store.bezierPaths.find(p => p.id === this.activePathId);
    if (!path) return null;

    let bestDist = radiusSq;
    let best: AnchorHit | null = null;

    for (let i = 0; i < path.anchors.length; i++) {
      const d = worldPos.distanceToSq(path.anchors[i].position);
      if (d < bestDist) {
        bestDist = d;
        best = { pathId: path.id, anchorIndex: i };
      }
    }
    return best;
  }

  private findNonBezierHandle(worldPos: Vec2, radius: number): HandleHit | null {
    let bestDist = radius * radius;
    let best: HandleHit | null = null;
    for (const line of this.store.lines) {
      if (line.layer !== this.store.activeLayerId) continue;
      // Skip lines owned by a bezier path
      if (this.store.findBezierPathForLine(line.id)) continue;

      const d1 = worldPos.distanceToSq(line.p1);
      if (d1 < bestDist) {
        bestDist = d1;
        best = { lineId: line.id, endpoint: 'p1', position: line.p1.clone() };
      }
      const d2 = worldPos.distanceToSq(line.p2);
      if (d2 < bestDist) {
        bestDist = d2;
        best = { lineId: line.id, endpoint: 'p2', position: line.p2.clone() };
      }
    }
    return best;
  }

  // ── Anchor dragging ──

  private updateAnchorPosition(worldPos: Vec2) {
    if (!this.dragAnchorHit) return;
    const path = this.store.bezierPaths.find(p => p.id === this.dragAnchorHit!.pathId);
    if (!path) return;

    const anchor = path.anchors[this.dragAnchorHit.anchorIndex];
    const delta = worldPos.sub(this.dragCurrent);
    anchor.position = anchor.position.add(delta);
    this.dragCurrent = worldPos.clone();

    // Move coincident anchors on other paths
    for (const otherPath of this.store.bezierPaths) {
      if (otherPath.id === path.id) continue;
      for (const otherAnchor of otherPath.anchors) {
        if (otherAnchor.position.distanceTo(anchor.position.sub(delta)) < 0.01) {
          otherAnchor.position = anchor.position.clone();
          this.store.regenerateBezierPathLines(otherPath.id);
        }
      }
    }

    this.store.regenerateBezierPathLines(path.id);
  }

  // ── Handle dragging ──

  private updateBezierHandle(worldPos: Vec2) {
    if (!this.dragBezierHandle) return;
    const path = this.store.bezierPaths.find(p => p.id === this.dragBezierHandle!.pathId);
    if (!path) return;

    const anchor = path.anchors[this.dragBezierHandle.anchorIndex];
    const newHandle = worldPos.sub(anchor.position);

    if (this.dragBezierHandle.handleType === 'in') {
      anchor.handleIn = newHandle;
      if (anchor.smooth && !this.altHeld) {
        // Mirror the opposite handle direction, keep its length
        const oppositeLen = anchor.handleOut.length();
        if (oppositeLen > 0 && newHandle.lengthSq() > 0.01) {
          const dir = newHandle.normalize().scale(-1);
          anchor.handleOut = dir.scale(oppositeLen);
        }
      }
    } else {
      anchor.handleOut = newHandle;
      if (anchor.smooth && !this.altHeld) {
        const oppositeLen = anchor.handleIn.length();
        if (oppositeLen > 0 && newHandle.lengthSq() > 0.01) {
          const dir = newHandle.normalize().scale(-1);
          anchor.handleIn = dir.scale(oppositeLen);
        }
      }
    }

    this.store.regenerateBezierPathLines(path.id);
  }

  // ── Double-click toggle smooth/corner ──

  private toggleAnchorSmooth(hit: AnchorHit) {
    const path = this.store.bezierPaths.find(p => p.id === hit.pathId);
    if (!path) return;

    this.store.beginTransaction();
    const anchor = path.anchors[hit.anchorIndex];
    anchor.smooth = !anchor.smooth;

    if (anchor.smooth) {
      // Make handles collinear by averaging angles
      const inLen = anchor.handleIn.length();
      const outLen = anchor.handleOut.length();
      if (inLen > 0.01 && outLen > 0.01) {
        const inDir = anchor.handleIn.normalize();
        const outDir = anchor.handleOut.normalize();
        // Average direction: handleOut direction, handleIn should be opposite
        const avgDir = outDir.sub(inDir).normalize();
        if (avgDir.lengthSq() > 0.01) {
          anchor.handleOut = avgDir.scale(outLen);
          anchor.handleIn = avgDir.scale(-inLen);
        }
      }
    }

    this.store.regenerateBezierPathLines(path.id);
    this.store.endTransaction();
  }

  // ── C key: convert line to BezierPath ──

  /** Build anchors for a straight line with handles along the line direction.
   *  Handles at 1/3 length preserve the straight shape but are visible and draggable. */
  private buildLineAnchors(start: Vec2, end: Vec2): BezierAnchor[] {
    const dir = end.sub(start);
    const third = dir.scale(1 / 3);
    return [
      { position: start, handleIn: new Vec2(0, 0), handleOut: third, smooth: true },
      { position: end, handleIn: third.scale(-1), handleOut: new Vec2(0, 0), smooth: true },
    ];
  }

  private tryConvertToBezierPath() {
    if (this.hoveredLineId === null) return;
    if (this.store.findBezierPathForLine(this.hoveredLineId)) return;

    const line = this.store.lines.find(l => l.id === this.hoveredLineId);
    if (!line) return;

    this.store.beginTransaction();
    this.store.removeLines(new Set([line.id]));

    const anchors = this.buildLineAnchors(line.p1.clone(), line.p2.clone());
    const newPath = this.store.addBezierPath(anchors, line.type, line.layer);
    this.activePathId = newPath.id;

    this.store.endTransaction();
    this.hoveredLineId = null;
  }

  /** Auto-convert a plain line to a BezierPath (returns the new path, or null).
   *  Leaves a transaction open so the caller can continue dragging. */
  private autoConvertToBezier(lineId: number): BezierPath | null {
    if (this.store.findBezierPathForLine(lineId)) return null;
    const line = this.store.lines.find(l => l.id === lineId);
    if (!line) return null;

    this.store.beginTransaction();
    this.store.removeLines(new Set([lineId]));

    const anchors = this.buildLineAnchors(line.p1.clone(), line.p2.clone());
    const newPath = this.store.addBezierPath(anchors, line.type, line.layer);
    this.activePathId = newPath.id;
    this.hoveredLineId = null;
    return newPath;
  }

  private tryFlipLine() {
    if (this.hoveredLineId === null) return;
    this.store.flipLine(this.hoveredLineId);
  }

  // ── Add anchor on path segment (double-click) ──

  private tryAddAnchorOnPath(worldPos: Vec2): boolean {
    if (this.activePathId === null) return false;
    const path = this.store.bezierPaths.find(p => p.id === this.activePathId);
    if (!path || path.anchors.length < 2) return false;

    const hitRadius = SELECT_RADIUS / this.getZoom();
    let bestDist = hitRadius;
    let bestSegment = -1;
    let bestT = 0.5;

    // For each pair of adjacent anchors, find closest point on the cubic bezier
    for (let i = 0; i < path.anchors.length - 1; i++) {
      const a0 = path.anchors[i];
      const a1 = path.anchors[i + 1];
      const p0 = a0.position;
      const p1 = p0.add(a0.handleOut);
      const p2 = a1.position.add(a1.handleIn);
      const p3 = a1.position;

      // Sample the curve at intervals to find closest t
      const steps = 32;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const pt = cubicBezierPoint(p0, p1, p2, p3, t);
        const d = worldPos.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          bestSegment = i;
          bestT = t;
        }
      }
    }

    if (bestSegment === -1) return false;

    // De Casteljau split at bestT
    const a0 = path.anchors[bestSegment];
    const a1 = path.anchors[bestSegment + 1];
    const p0 = a0.position;
    const p1 = p0.add(a0.handleOut);
    const p2 = a1.position.add(a1.handleIn);
    const p3 = a1.position;

    // De Casteljau subdivision
    const t = bestT;
    const q0 = p0.lerp(p1, t);
    const q1 = p1.lerp(p2, t);
    const q2 = p2.lerp(p3, t);
    const r0 = q0.lerp(q1, t);
    const r1 = q1.lerp(q2, t);
    const s0 = r0.lerp(r1, t); // point on curve

    this.store.beginTransaction();

    // Update existing anchor handles
    a0.handleOut = q0.sub(p0);
    a1.handleIn = q2.sub(p3);

    // Insert new anchor at the split point
    const newAnchor: BezierAnchor = {
      position: s0,
      handleIn: r0.sub(s0),
      handleOut: r1.sub(s0),
      smooth: true,
    };

    path.anchors.splice(bestSegment + 1, 0, newAnchor);
    this.store.regenerateBezierPathLines(path.id);
    this.store.endTransaction();

    // Select the new anchor
    this.selectedAnchor = { pathId: path.id, anchorIndex: bestSegment + 1 };
    return true;
  }

  // ── Delete selected anchor (Delete/Backspace) ──

  private tryDeleteAnchor() {
    if (!this.selectedAnchor) return;
    const path = this.store.bezierPaths.find(p => p.id === this.selectedAnchor!.pathId);
    if (!path) return;

    // Don't delete if only 2 anchors left (minimum for a path)
    if (path.anchors.length <= 2) return;

    const idx = this.selectedAnchor.anchorIndex;
    if (idx < 0 || idx >= path.anchors.length) return;

    this.store.beginTransaction();

    // If deleting an interior anchor, adjust neighbors to keep curve roughly smooth
    if (idx > 0 && idx < path.anchors.length - 1) {
      const prev = path.anchors[idx - 1];
      const next = path.anchors[idx + 1];
      // Extend handles toward each other to compensate
      const dist = prev.position.distanceTo(next.position);
      const dir = next.position.sub(prev.position).normalize();
      prev.handleOut = dir.scale(dist * 0.33);
      next.handleIn = dir.scale(-dist * 0.33);
    }

    path.anchors.splice(idx, 1);
    this.store.regenerateBezierPathLines(path.id);
    this.store.endTransaction();

    this.selectedAnchor = null;
  }

  /** Find all other endpoints that share the same position as the dragged one */
  private findCoincidentEndpoints(pos: Vec2, excludeLineId: number): Array<{ lineId: number; endpoint: 'p1' | 'p2' }> {
    const eps = 0.01;
    const result: Array<{ lineId: number; endpoint: 'p1' | 'p2' }> = [];
    for (const line of this.store.lines) {
      if (line.id === excludeLineId) continue;
      if (line.layer !== this.store.activeLayerId) continue;
      if (line.p1.distanceTo(pos) < eps) {
        result.push({ lineId: line.id, endpoint: 'p1' });
      } else if (line.p2.distanceTo(pos) < eps) {
        result.push({ lineId: line.id, endpoint: 'p2' });
      }
    }
    return result;
  }
}
