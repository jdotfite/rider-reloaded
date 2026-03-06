import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { HANDLE_SIZE, HANDLE_HIT_SIZE, SNAP_RADIUS, SELECT_RADIUS } from '../../constants';
import { BezierPath, BezierAnchor } from '../../store/BezierPath';

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

  constructor(store: TrackStore, getZoom: () => number, getSnapEnabled: () => boolean) {
    this.store = store;
    this.getZoom = getZoom;
    this.getSnapEnabled = getSnapEnabled;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.shiftHeld = true;
      if (e.key === 'Alt') this.altHeld = true;
      if (e.code === 'KeyC' && this.state === 'idle') this.tryConvertToBezierPath();
      if (e.code === 'KeyF' && this.state === 'idle') this.tryFlipLine();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shiftHeld = false;
      if (e.key === 'Alt') this.altHeld = false;
    });
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

    // Check double-click on anchor
    if (now - this.lastClickTime < 300 && worldPos.distanceTo(this.lastClickPos) < 5 / this.getZoom()) {
      const anchorHit = this.findAnchorHit(worldPos, hitRadius);
      if (anchorHit) {
        this.toggleAnchorSmooth(anchorHit);
        this.lastClickTime = 0;
        return;
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
      this.dragStart = worldPos.clone();
      this.dragCurrent = worldPos.clone();
      this.store.beginTransaction();
      return;
    }

    // Priority 3: Non-bezier endpoint handles
    const handle = this.findNonBezierHandle(worldPos, hitRadius);
    if (handle) {
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
      // Update active path when clicking a line
      const path = this.store.findBezierPathForLine(line.id);
      this.activePathId = path ? path.id : null;

      this.state = 'dragging-line';
      this.dragLineId = line.id;
      this.dragLineStart = worldPos.clone();
      this.dragCurrent = worldPos.clone();
      this.store.beginTransaction();
      return;
    }

    // Click on empty space — deactivate path
    this.activePathId = null;
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
        this.store.moveLines(new Set([this.dragLineId]), dx, dy);
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

      if (anchor.smooth) {
        ctx.fillStyle = (isAnchorHovered || isAnchorDragging) ? '#2266aa' : '#4488cc';
        ctx.strokeStyle = '#2266aa';
      } else {
        ctx.fillStyle = (isAnchorHovered || isAnchorDragging) ? '#cccccc' : '#ffffff';
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

  private tryConvertToBezierPath() {
    if (this.hoveredLineId === null) return;

    // Don't convert if already in a bezier path
    if (this.store.findBezierPathForLine(this.hoveredLineId)) return;

    const line = this.store.lines.find(l => l.id === this.hoveredLineId);
    if (!line) return;

    const start = line.p1.clone();
    const end = line.p2.clone();

    this.store.beginTransaction();

    // Remove the original line
    this.store.removeLines(new Set([line.id]));

    // Create a BezierPath with 2 anchors (zero handles = straight, user can drag to curve)
    const anchors: BezierAnchor[] = [
      { position: start, handleIn: new Vec2(0, 0), handleOut: new Vec2(0, 0), smooth: true },
      { position: end, handleIn: new Vec2(0, 0), handleOut: new Vec2(0, 0), smooth: true },
    ];

    const newPath = this.store.addBezierPath(anchors, line.type, line.layer);
    this.activePathId = newPath.id;

    this.store.endTransaction();
    this.hoveredLineId = null;
  }

  private tryFlipLine() {
    if (this.hoveredLineId === null) return;
    this.store.flipLine(this.hoveredLineId);
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
