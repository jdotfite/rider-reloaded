import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';
import { TrackStore } from '../../store/TrackStore';
import { SELECT_RADIUS, SNAP_RADIUS } from '../../constants';
import { LineType } from '../../physics/lines/LineTypes';
import {
  DEFAULT_PORTAL_LENGTH,
  DEFAULT_PORTAL_RADIUS,
  PortalColorTheme,
  PortalEndpointKey,
  PortalDirectionRule,
  PortalExitDirection,
  PortalMode,
  PortalPair,
  PortalTriggerBody,
  PortalVelocityMode,
  PortalVisibility,
  MIN_PORTAL_LENGTH,
  MAX_PORTAL_LENGTH,
  MIN_PORTAL_RADIUS,
  MAX_PORTAL_RADIUS,
} from '../../store/PortalTypes';
import {
  pointInsidePortalVisibleShape,
  portalNormal,
  portalTangent,
  worldToPortalLocal,
} from '../../portal/portalMath';
import {
  buildPortalArchPath,
  buildPortalLipPath,
  buildPortalSketchMetrics,
  getPortalFrontStubSegments,
  tracePortalPath,
} from '../../portal/portalSketch';
import {
  PointSnapResult,
  renderPointSnapIndicator,
  resolvePointSnap,
} from './pointSnap';

type PortalToolState = 'idle' | 'placing' | 'dragging-position' | 'dragging-rotation' | 'dragging-length';

interface HandleHit {
  portalId: number;
  endpoint: PortalEndpointKey;
  handle: 'position' | 'rotation' | 'length' | 'pair' | 'pair-rotate';
}

const HANDLE_RADIUS_PX = 9;
const BODY_HIT_PADDING_PX = 8;
const PORTAL_NUDGE = 2;

export class PortalTool implements Tool {
  name = 'portal';
  onPortalCreated: ((portal: PortalPair) => void) | null = null;
  private store: TrackStore;
  private getZoom: () => number;
  private getEndpointSnapEnabled: () => boolean;
  private getGridSnapEnabled: () => boolean;
  private getGridSize: () => number;
  private isIdlePreviewEnabled: () => boolean;
  private shiftHeld = false;
  private state: PortalToolState = 'idle';
  private pendingEntry: Vec2 | null = null;
  private pendingEntryRotation = 0;
  private previewPos = new Vec2();
  private idlePreviewPos: Vec2 | null = null;
  private idlePreviewRotation = 0;
  private selectedPortalId: number | null = null;
  private activeEndpoint: PortalEndpointKey = 'entry';
  private dragHandle: HandleHit | null = null;
  private hoveredHandle: HandleHit | null = null;
  private dragCurrent = new Vec2();
  private pairRotateAngle = 0;
  private endpointRotateStartAngle = 0;
  private endpointRotateStartRotation = 0;
  private snapPreview: PointSnapResult | null = null;

  constructor(
    store: TrackStore,
    getZoom: () => number,
    getEndpointSnapEnabled: () => boolean = () => false,
    getGridSnapEnabled: () => boolean = () => false,
    getGridSize: () => number = () => 24,
    isIdlePreviewEnabled: () => boolean = () => true,
  ) {
    this.store = store;
    this.getZoom = getZoom;
    this.getEndpointSnapEnabled = getEndpointSnapEnabled;
    this.getGridSnapEnabled = getGridSnapEnabled;
    this.getGridSize = getGridSize;
    this.isIdlePreviewEnabled = isIdlePreviewEnabled;
    window.addEventListener('keydown', this.onWindowKeyDown);
    window.addEventListener('keyup', this.onWindowKeyUp);
  }

  onMouseDown(worldPos: Vec2) {
    if (this.pendingEntry) {
      this.commitPortal(this.applySnap(worldPos));
      return;
    }

    const selectedHandle = this.findSelectedHandle(worldPos);
    if (selectedHandle) {
      this.selectPortal(selectedHandle.portalId, selectedHandle.endpoint);
      this.dragHandle = selectedHandle;
      this.dragCurrent = worldPos.clone();
      this.state = selectedHandle.handle === 'position'
        ? 'dragging-position'
        : selectedHandle.handle === 'rotation'
          ? 'dragging-rotation'
          : selectedHandle.handle === 'length'
            ? 'dragging-length'
            : 'idle';
      if (selectedHandle.handle === 'rotation') {
        const portal = this.store.getPortalById(selectedHandle.portalId);
        const endpoint = portal?.[selectedHandle.endpoint];
        if (endpoint) {
          this.endpointRotateStartAngle = Math.atan2(
            worldPos.y - endpoint.position.y,
            worldPos.x - endpoint.position.x,
          );
          this.endpointRotateStartRotation = endpoint.rotation;
        }
      }
      this.store.beginTransaction();
      return;
    }

    const pairHit = this.findPairHandle(worldPos);
    if (pairHit) {
      this.selectPortal(pairHit.portalId, pairHit.endpoint);
      this.dragHandle = pairHit;
      this.dragCurrent = worldPos.clone();
      this.state = pairHit.handle === 'pair-rotate' ? 'dragging-rotation' : 'idle';
      if (pairHit.handle === 'pair-rotate') {
        const portal = this.store.getPortalById(pairHit.portalId);
        if (portal) {
          this.pairRotateAngle = this.getPairRotationAngle(portal, worldPos);
        }
      }
      this.store.beginTransaction();
      return;
    }

    const endpointHit = this.store.getPortalEndpointAt(worldPos, this.worldHandleRadius());
    if (endpointHit) {
      this.selectPortal(endpointHit.portalId, endpointHit.endpoint);
      this.dragHandle = {
        portalId: endpointHit.portalId,
        endpoint: endpointHit.endpoint,
        handle: 'position',
      };
      this.dragCurrent = worldPos.clone();
      this.state = 'dragging-position';
      this.store.beginTransaction();
      return;
    }

    const bodyHit = this.store.getPortalAt(worldPos, this.worldBodyPadding());
    if (bodyHit) {
      const endpoint = this.pickNearestEndpoint(bodyHit, worldPos);
      this.selectPortal(bodyHit.id, endpoint);
      return;
    }

    this.clearSelection();
    const snapped = this.applySnap(worldPos);
    this.pendingEntry = snapped;
    this.pendingEntryRotation = this.getPlacementRotation(snapped, 0);
    this.previewPos = snapped.clone();
    this.state = 'placing';
  }

  canStartInteraction(worldPos: Vec2): boolean {
    if (this.pendingEntry) return false;
    if (this.findSelectedHandle(worldPos)) return true;
    if (this.findPairHandle(worldPos)) return true;
    if (this.store.getPortalEndpointAt(worldPos, this.worldHandleRadius())) return true;
    return this.store.getPortalAt(worldPos, this.worldBodyPadding()) !== null;
  }

  onMouseMove(worldPos: Vec2) {
    if (this.pendingEntry) {
      this.previewPos = this.applySnap(worldPos);
      return;
    }

    if (this.dragHandle) {
      this.applyDrag(worldPos);
      return;
    }

    if (this.selectedPortalId === null) {
      if (this.isIdlePreviewEnabled()) {
        const snapped = this.applySnap(worldPos);
        this.idlePreviewPos = snapped;
        this.idlePreviewRotation = this.getPreviewRotation(snapped);
      } else {
        this.idlePreviewPos = null;
        this.snapPreview = null;
      }

      const endpointHit = this.store.getPortalEndpointAt(worldPos, this.worldHandleRadius());
      if (endpointHit) {
        this.hoveredHandle = {
          portalId: endpointHit.portalId,
          endpoint: endpointHit.endpoint,
          handle: 'position',
        };
        return;
      }
      const bodyHit = this.store.getPortalAt(worldPos, this.worldBodyPadding());
      if (bodyHit) {
        this.hoveredHandle = {
          portalId: bodyHit.id,
          endpoint: this.pickNearestEndpoint(bodyHit, worldPos),
          handle: 'position',
        };
        return;
      }
    } else {
      this.idlePreviewPos = null;
      this.snapPreview = null;
    }
    this.hoveredHandle = this.findSelectedHandle(worldPos) ?? this.findPairHandle(worldPos);
  }

  onMouseUp() {
    if (this.dragHandle) {
      this.store.endTransaction();
      this.dragHandle = null;
      this.state = 'idle';
    }
    this.snapPreview = null;
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      if (this.pendingEntry) {
        e.preventDefault();
        this.pendingEntry = null;
        this.pendingEntryRotation = 0;
        this.state = 'idle';
        return;
      }
      if (this.selectedPortalId !== null) {
        e.preventDefault();
        this.clearSelection();
      }
    }

    if ((e.code === 'Delete' || e.code === 'Backspace') && this.selectedPortalId !== null) {
      e.preventDefault();
      this.store.removePortalPair(this.selectedPortalId);
      this.clearSelection();
    }

    const primaryModifier = e.ctrlKey || e.metaKey;
    if (primaryModifier && !e.altKey && e.code === 'KeyD' && this.selectedPortalId !== null) {
      e.preventDefault();
      const duplicated = this.store.duplicatePortalPair(this.selectedPortalId, 26, 26);
      if (duplicated) {
        this.selectPortal(duplicated.id, 'entry');
      }
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyT' && this.selectedPortalId !== null) {
      e.preventDefault();
      const portal = this.getSelectedPortal();
      if (portal) {
        this.store.setPortalMode(portal.id, portal.mode === 'oneWay' ? 'twoWay' : 'oneWay');
      }
    }

    if (this.selectedPortalId === null || this.state !== 'idle') return;

    if (e.code === 'Tab') {
      e.preventDefault();
      this.activeEndpoint = this.activeEndpoint === 'entry' ? 'exit' : 'entry';
      return;
    }

    if (!primaryModifier && !e.altKey && e.code === 'KeyX') {
      e.preventDefault();
      const swapped = this.store.swapPortalEndpoints(this.selectedPortalId);
      if (swapped) {
        this.activeEndpoint = this.activeEndpoint === 'entry' ? 'exit' : 'entry';
      }
      return;
    }

    const step = e.shiftKey ? PORTAL_NUDGE * 5 : PORTAL_NUDGE;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      const delta = new Vec2(
        e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0,
        e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0,
      );
      if (e.altKey) {
        this.store.movePortalPair(this.selectedPortalId, delta.x, delta.y);
      } else {
        const portal = this.getSelectedPortal();
        if (!portal) return;
        this.store.updatePortalEndpoint(
          portal.id,
          this.activeEndpoint,
          { position: portal[this.activeEndpoint].position.add(delta) },
        );
      }
      return;
    }

    const rotateStep = e.shiftKey ? Math.PI / 36 : Math.PI / 12;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      e.preventDefault();
      const direction = e.code === 'BracketLeft' ? -1 : 1;
      if (e.altKey) {
        this.store.rotatePortalPair(this.selectedPortalId, rotateStep * direction);
      } else {
        const portal = this.getSelectedPortal();
        if (!portal) return;
        const endpoint = portal[this.activeEndpoint];
        this.store.updatePortalEndpoint(portal.id, this.activeEndpoint, {
          rotation: endpoint.rotation + rotateStep * direction,
        });
      }
      return;
    }

    if (e.code === 'Equal' || e.code === 'Minus') {
      e.preventDefault();
      const direction = e.code === 'Equal' ? 1 : -1;
      if (e.shiftKey) {
        const portal = this.getSelectedPortal();
        if (!portal) return;
        this.setSelectedPortalRadius(((portal.entry.radius + portal.exit.radius) / 2) + direction);
      } else {
        const portal = this.getSelectedPortal();
        if (!portal) return;
        this.setSelectedPortalSize(((portal.entry.length + portal.exit.length) / 2) + direction * 2);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.pendingEntry && this.isIdlePreviewEnabled() && this.idlePreviewPos && this.selectedPortalId === null) {
      this.drawPreviewPortal(ctx, this.idlePreviewPos, this.idlePreviewRotation, '#111111', 0.42);
    }

    if (this.pendingEntry) {
      const fallbackAngle = this.previewPos.sub(this.pendingEntry).lengthSq() > 1
        ? this.quantizeAngle(Math.atan2(this.previewPos.y - this.pendingEntry.y, this.previewPos.x - this.pendingEntry.x))
        : this.pendingEntryRotation;
      const entryAngle = this.getPlacementRotation(this.pendingEntry, fallbackAngle);
      const exitAngle = this.getPlacementRotation(this.previewPos, fallbackAngle);
      this.drawPreviewLink(ctx, this.pendingEntry, this.previewPos);
      this.drawPreviewPortal(ctx, this.pendingEntry, entryAngle, '#6f6cff', 0.72);
      this.drawPreviewPortal(ctx, this.previewPos, exitAngle, '#36d1ff', 0.84);
    }

    const portal = this.getSelectedPortal();
    if (!portal) {
      renderPointSnapIndicator(ctx, this.snapPreview, this.getZoom());
      return;
    }

    for (const endpointKey of ['entry', 'exit'] as const) {
      const endpoint = portal[endpointKey];
      const active = this.activeEndpoint === endpointKey;
      const normal = portalNormal(endpoint.rotation);
      const tangent = portalTangent(endpoint.rotation);
      const center = endpoint.position;
      const rotationHandle = center.add(normal.scale(endpoint.radius + 18 / this.getZoom()));
      const lengthHandle = center.add(tangent.scale(endpoint.length / 2 + 12 / this.getZoom()));

      ctx.save();
      ctx.lineWidth = 1.5 / this.getZoom();
      ctx.strokeStyle = active ? 'rgba(44,44,44,0.75)' : 'rgba(44,44,44,0.4)';
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(rotationHandle.x, rotationHandle.y);
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(lengthHandle.x, lengthHandle.y);
      ctx.stroke();

      this.drawHandle(ctx, center, active ? '#111111' : '#444444', 4.5 / this.getZoom());
      this.drawHandle(ctx, rotationHandle, active ? '#6f6cff' : '#9090c8', 5.5 / this.getZoom());
      this.drawHandle(ctx, lengthHandle, active ? '#36d1ff' : '#7ab8d0', 5.5 / this.getZoom());
      ctx.restore();
    }

    const pairMid = portal.entry.position.lerp(portal.exit.position, 0.5);
    const pairRotateHandle = this.getPairRotationHandle(portal);
    ctx.save();
    ctx.lineWidth = 1.5 / this.getZoom();
    ctx.strokeStyle = 'rgba(44,44,44,0.34)';
    ctx.beginPath();
    ctx.moveTo(pairMid.x, pairMid.y);
    ctx.lineTo(pairRotateHandle.x, pairRotateHandle.y);
    ctx.stroke();
    this.drawHandle(ctx, pairMid, '#5e6475', 4.8 / this.getZoom());
    this.drawHandle(ctx, pairRotateHandle, '#f29d38', 5.5 / this.getZoom());
    ctx.restore();

    renderPointSnapIndicator(ctx, this.snapPreview, this.getZoom());
  }

  getCursor(): string | null {
    if (this.pendingEntry) return 'crosshair';
    if (!this.hoveredHandle) return null;
    if (this.hoveredHandle.handle === 'rotation' || this.hoveredHandle.handle === 'pair-rotate') return 'crosshair';
    if (this.hoveredHandle.handle === 'length') return 'ew-resize';
    if (this.hoveredHandle.handle === 'pair') return 'move';
    return 'move';
  }

  getSelectedPortal(): PortalPair | null {
    if (this.selectedPortalId === null) return null;
    return this.store.getPortalById(this.selectedPortalId);
  }

  getSelectedPortalId(): number | null {
    return this.selectedPortalId;
  }

  getActiveEndpoint(): PortalEndpointKey | null {
    return this.selectedPortalId === null ? null : this.activeEndpoint;
  }

  isPlacing(): boolean {
    return this.pendingEntry !== null;
  }

  cancelPlacement() {
    this.pendingEntry = null;
    this.pendingEntryRotation = 0;
    this.snapPreview = null;
    this.idlePreviewPos = null;
    this.state = 'idle';
  }

  clearSelection() {
    this.selectedPortalId = null;
    this.dragHandle = null;
    this.hoveredHandle = null;
    this.state = this.pendingEntry ? 'placing' : 'idle';
  }

  setSelectedPortalMode(mode: PortalMode) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.setPortalMode(portal.id, mode);
  }

  setSelectedVelocityMode(mode: PortalVelocityMode) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { velocityMode: mode });
  }

  setSelectedSpeedMultiplier(multiplier: number) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { speedMultiplier: multiplier });
  }

  setSelectedPreserveOffset(enabled: boolean) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { preserveLocalOffset: enabled });
  }

  setSelectedDirectionRule(rule: PortalDirectionRule) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { entryDirectionRule: rule });
  }

  setSelectedExitDirection(direction: PortalExitDirection) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { exitDirection: direction });
  }

  setSelectedTriggerBody(body: PortalTriggerBody) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { triggerBody: body });
  }

  setSelectedCooldownFrames(frames: number) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { cooldownFrames: frames });
  }

  setSelectedVisibility(visibility: PortalVisibility) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalVisual(portal.id, { visibility });
  }

  setSelectedExitOffset(offset: number) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalPhysics(portal.id, { exitOffset: Math.max(0, Math.min(30, offset)) });
  }

  setSelectedColorTheme(theme: PortalColorTheme) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalVisual(portal.id, { colorTheme: theme });
  }

  setSelectedShowEditorLink(enabled: boolean) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalVisual(portal.id, { showEditorLink: enabled });
  }

  setSelectedShowDebug(enabled: boolean) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.updatePortalVisual(portal.id, { showDebug: enabled });
  }

  setSelectedEnabled(enabled: boolean) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    this.store.setPortalEnabled(portal.id, enabled);
  }

  setSelectedPortalSize(length: number) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    const clamped = Math.max(MIN_PORTAL_LENGTH, Math.min(MAX_PORTAL_LENGTH, length));
    this.store.beginTransaction();
    this.store.updatePortalEndpoint(portal.id, 'entry', { length: clamped });
    this.store.updatePortalEndpoint(portal.id, 'exit', { length: clamped });
    this.store.endTransaction();
  }

  setSelectedPortalRadius(radius: number) {
    const portal = this.getSelectedPortal();
    if (!portal) return;
    const clamped = Math.max(MIN_PORTAL_RADIUS, Math.min(MAX_PORTAL_RADIUS, radius));
    this.store.beginTransaction();
    this.store.updatePortalEndpoint(portal.id, 'entry', { radius: clamped });
    this.store.updatePortalEndpoint(portal.id, 'exit', { radius: clamped });
    this.store.endTransaction();
  }

  getDiagnostics(): {
    messages: string[];
    warningEndpoints: Partial<Record<PortalEndpointKey, boolean>> | null;
  } {
    if (this.pendingEntry) {
      return this.collectDiagnostics(
        {
          position: this.pendingEntry,
          radius: DEFAULT_PORTAL_RADIUS,
        },
        {
          position: this.previewPos,
          radius: DEFAULT_PORTAL_RADIUS,
        },
      );
    }
    const portal = this.getSelectedPortal();
    if (!portal) {
      return { messages: [], warningEndpoints: null };
    }
    return this.collectDiagnostics(portal.entry, portal.exit, portal);
  }

  private commitPortal(exitPosition: Vec2) {
    if (!this.pendingEntry) return;
    const delta = exitPosition.sub(this.pendingEntry);
    const fallbackAngle = delta.lengthSq() > 1 ? this.quantizeAngle(Math.atan2(delta.y, delta.x)) : this.pendingEntryRotation;
    const entryRotation = this.getPlacementRotation(this.pendingEntry, fallbackAngle);
    const exitRotation = this.getPlacementRotation(exitPosition, fallbackAngle);
    const pair = this.store.addPortalPair(this.pendingEntry, exitPosition, {
      entryRotation,
      exitRotation,
    });
    this.pendingEntry = null;
    this.pendingEntryRotation = 0;
    this.state = 'idle';
    if (pair) {
      this.selectPortal(pair.id, 'exit');
      this.onPortalCreated?.(pair);
    }
  }

  private selectPortal(portalId: number, endpoint: PortalEndpointKey) {
    this.selectedPortalId = portalId;
    this.activeEndpoint = endpoint;
    this.hoveredHandle = null;
    this.idlePreviewPos = null;
  }

  private pickNearestEndpoint(portal: PortalPair, point: Vec2): PortalEndpointKey {
    return point.distanceToSq(portal.entry.position) <= point.distanceToSq(portal.exit.position) ? 'entry' : 'exit';
  }

  private applyDrag(worldPos: Vec2) {
    const handle = this.dragHandle;
    if (!handle) return;
    const portal = this.store.getPortalById(handle.portalId);
    if (!portal) return;
    if (handle.handle === 'pair') {
      this.snapPreview = null;
      const dx = worldPos.x - this.dragCurrent.x;
      const dy = worldPos.y - this.dragCurrent.y;
      this.store.movePortalPair(portal.id, dx, dy);
      this.dragCurrent = worldPos.clone();
      return;
    }
    if (handle.handle === 'pair-rotate') {
      this.snapPreview = null;
      const angle = this.getPairRotationAngle(portal, worldPos);
      const delta = this.normalizeAngleDelta(angle - this.pairRotateAngle);
      if (Math.abs(delta) > 0.0001) {
        this.store.rotatePortalPair(portal.id, delta);
        this.pairRotateAngle = angle;
      }
      this.dragCurrent = worldPos.clone();
      return;
    }
    const endpoint = portal[handle.endpoint];
    if (handle.handle === 'position') {
      const snapped = this.applySnap(worldPos, new Set([portal.id]));
      this.store.updatePortalEndpoint(portal.id, handle.endpoint, { position: snapped });
      this.dragCurrent = snapped;
      return;
    }
    this.snapPreview = null;
    if (handle.handle === 'rotation') {
      const delta = worldPos.sub(endpoint.position);
      const pointerAngle = Math.atan2(delta.y, delta.x);
      const angleDelta = this.normalizeAngleDelta(pointerAngle - this.endpointRotateStartAngle);
      const rotation = this.quantizeAngle(this.endpointRotateStartRotation + angleDelta);
      this.store.updatePortalEndpoint(portal.id, handle.endpoint, { rotation });
      this.dragCurrent = worldPos.clone();
      return;
    }

    const local = worldToPortalLocal(worldPos, endpoint);
    const nextLength = Math.max(MIN_PORTAL_LENGTH, Math.min(MAX_PORTAL_LENGTH, Math.abs(local.x) * 2));
    this.store.updatePortalEndpoint(portal.id, handle.endpoint, { length: nextLength });
    this.dragCurrent = worldPos.clone();
  }

  private findSelectedHandle(worldPos: Vec2): HandleHit | null {
    const portal = this.getSelectedPortal();
    if (!portal) return null;

    const candidates: PortalEndpointKey[] = this.activeEndpoint
      ? [this.activeEndpoint, this.activeEndpoint === 'entry' ? 'exit' : 'entry']
      : ['entry', 'exit'];

    for (const endpointKey of candidates) {
      const endpoint = portal[endpointKey];
      const rotationHandle = endpoint.position.add(portalNormal(endpoint.rotation).scale(endpoint.radius + 18 / this.getZoom()));
      const lengthHandle = endpoint.position.add(portalTangent(endpoint.rotation).scale(endpoint.length / 2 + 12 / this.getZoom()));
      const handleRadius = this.worldHandleRadius();

      if (worldPos.distanceToSq(rotationHandle) <= handleRadius * handleRadius) {
        return { portalId: portal.id, endpoint: endpointKey, handle: 'rotation' };
      }
      if (worldPos.distanceToSq(lengthHandle) <= handleRadius * handleRadius) {
        return { portalId: portal.id, endpoint: endpointKey, handle: 'length' };
      }
      if (pointInsidePortalVisibleShape(worldPos, endpoint, this.worldBodyPadding())) {
        return { portalId: portal.id, endpoint: endpointKey, handle: 'position' };
      }
    }

    return null;
  }

  private findPairHandle(worldPos: Vec2): HandleHit | null {
    const portals = this.selectedPortalId !== null
      ? [this.getSelectedPortal()].filter(Boolean) as PortalPair[]
      : this.store.portals;

    const maxDistSq = this.worldBodyPadding() * this.worldBodyPadding();
    let bestPortal: PortalPair | null = null;
    let bestDist = maxDistSq;
    for (const portal of portals) {
      if (portal.layer !== this.store.activeLayerId) continue;
      if (!portal.visual.showEditorLink && portal.id !== this.selectedPortalId) continue;
      const rotateHandle = this.getPairRotationHandle(portal);
      const rotateDist = worldPos.distanceToSq(rotateHandle);
      if (rotateDist <= maxDistSq) {
        return {
          portalId: portal.id,
          endpoint: this.pickNearestEndpoint(portal, worldPos),
          handle: 'pair-rotate',
        };
      }
      const distSq = this.distanceSqToSegment(worldPos, portal.entry.position, portal.exit.position);
      if (distSq <= bestDist) {
        bestDist = distSq;
        bestPortal = portal;
      }
    }
    if (!bestPortal) return null;
    return {
      portalId: bestPortal.id,
      endpoint: this.pickNearestEndpoint(bestPortal, worldPos),
      handle: 'pair',
    };
  }

  private worldHandleRadius() {
    return HANDLE_RADIUS_PX / this.getZoom();
  }

  private worldBodyPadding() {
    return BODY_HIT_PADDING_PX / this.getZoom();
  }

  private drawPreviewLink(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(111,108,255,0.32)';
    ctx.lineWidth = 2 / this.getZoom();
    ctx.setLineDash([8 / this.getZoom(), 6 / this.getZoom()]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawPreviewPortal(
    ctx: CanvasRenderingContext2D,
    position: Vec2,
    rotation: number,
    color: string,
    alpha: number,
  ) {
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(rotation);
    const metrics = buildPortalSketchMetrics(DEFAULT_PORTAL_LENGTH, DEFAULT_PORTAL_RADIUS);
    const arch = buildPortalArchPath(metrics);
    const backArch = buildPortalArchPath(metrics, metrics.backOffset);
    const lip = buildPortalLipPath(metrics);
    const stubs = getPortalFrontStubSegments(metrics);

    ctx.fillStyle = this.withAlpha('#111111', alpha * 0.06);
    ctx.beginPath();
    ctx.ellipse(
      metrics.shadowCenter.x,
      metrics.shadowCenter.y,
      metrics.shadowRx,
      metrics.shadowRy,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = this.withAlpha('#ffffff', alpha * 0.58);
    ctx.beginPath();
    ctx.ellipse(
      metrics.fieldCenter.x,
      metrics.fieldCenter.y,
      metrics.fieldRx,
      metrics.fieldRy,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    tracePortalPath(ctx, backArch);
    ctx.strokeStyle = this.withAlpha('#777777', alpha * 0.82);
    ctx.lineWidth = 2 / this.getZoom();
    ctx.stroke();

    ctx.beginPath();
    tracePortalPath(ctx, arch);
    ctx.strokeStyle = this.withAlpha('#111111', alpha * 0.92);
    ctx.lineWidth = 2.25 / this.getZoom();
    ctx.stroke();

    ctx.beginPath();
    tracePortalPath(ctx, lip);
    for (const stub of stubs) {
      ctx.moveTo(stub.start.x, stub.start.y);
      ctx.lineTo(stub.end.x, stub.end.y);
    }
    ctx.strokeStyle = this.withAlpha('#111111', alpha * 0.46);
    ctx.lineWidth = 1.25 / this.getZoom();
    ctx.stroke();
    ctx.restore();
  }

  private getPreviewRotation(worldPos: Vec2): number {
    const line = this.store.getLineAt(worldPos, (SELECT_RADIUS * 2.5) / this.getZoom());
    if (!line || line.length <= 0.0001) return 0;
    return this.quantizeAngle(Math.atan2(line.delta.y, line.delta.x));
  }

  private getPlacementRotation(worldPos: Vec2, fallback: number): number {
    const line = this.store.getLineAt(worldPos, (SELECT_RADIUS * 2.5) / this.getZoom());
    if (!line || line.length <= 0.0001) return fallback;
    return this.quantizeAngle(Math.atan2(line.delta.y, line.delta.x));
  }

  private drawHandle(ctx: CanvasRenderingContext2D, position: Vec2, color: string, radius: number) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / this.getZoom();
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private withAlpha(color: string, alpha: number): string {
    const normalized = Math.max(0, Math.min(1, alpha));
    if (color.startsWith('#') && color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${normalized})`;
    }
    return color;
  }

  private distanceSqToSegment(point: Vec2, start: Vec2, end: Vec2): number {
    const delta = end.sub(start);
    const lengthSq = delta.lengthSq();
    if (lengthSq <= 0.0001) return point.distanceToSq(start);
    const t = Math.max(0, Math.min(1, point.sub(start).dot(delta) / lengthSq));
    const projection = start.add(delta.scale(t));
    return point.distanceToSq(projection);
  }

  private applySnap(worldPos: Vec2, excludePortalIds?: Set<number>): Vec2 {
    const endpoint = this.getEndpointSnapEnabled()
      ? this.store.findNearestEndpoint(worldPos, SNAP_RADIUS, undefined, excludePortalIds)
      : null;
    const snap = resolvePointSnap(worldPos, {
      gridEnabled: this.getGridSnapEnabled(),
      gridSize: this.getGridSize(),
      endpoint,
    });
    this.snapPreview = snap.kind === 'none' ? null : snap;
    return snap.point;
  }

  private collectDiagnostics(
    entry: { position: Vec2; radius: number; rotation?: number },
    exit: { position: Vec2; radius: number; rotation?: number },
    portal?: PortalPair,
  ) {
    const messages: string[] = [];
    const warningEndpoints: Partial<Record<PortalEndpointKey, boolean>> = {};

    if (this.endpointTouchesCollision(entry.position, entry.radius)) {
      messages.push('Entry overlaps solid track geometry.');
      warningEndpoints.entry = true;
    }
    if (this.endpointTouchesCollision(exit.position, exit.radius)) {
      messages.push('Exit overlaps solid track geometry.');
      warningEndpoints.exit = true;
    }
    if (typeof exit.rotation === 'number' && this.exitLaneBlocked(exit.position, exit.rotation, exit.radius)) {
      messages.push('Exit lane is blocked; the rider may emerge into nearby geometry.');
      warningEndpoints.exit = true;
    }
    if (this.endpointTouchesOtherPortal(entry.position, entry.radius, portal?.id)) {
      messages.push('Entry overlaps another portal endpoint.');
      warningEndpoints.entry = true;
    }
    if (this.endpointTouchesOtherPortal(exit.position, exit.radius, portal?.id)) {
      messages.push('Exit overlaps another portal endpoint.');
      warningEndpoints.exit = true;
    }

    const cooldownFrames = portal?.physics.cooldownFrames ?? 10;
    const minSeparation = Math.max(entry.radius, exit.radius) * 2 + 8;
    if (entry.position.distanceTo(exit.position) < minSeparation && cooldownFrames < 6) {
      messages.push('Portal ends are close together. Increase cooldown to reduce re-entry bounce.');
    }

    return {
      messages,
      warningEndpoints: Object.keys(warningEndpoints).length > 0 ? warningEndpoints : null,
    };
  }

  private endpointTouchesCollision(position: Vec2, radius: number): boolean {
    const thresholdSq = (radius + 3) * (radius + 3);
    for (const line of this.store.lines) {
      if (line.type === LineType.SCENERY) continue;
      if (line.distanceToPointSq(position) <= thresholdSq) return true;
    }
    return false;
  }

  private endpointTouchesOtherPortal(position: Vec2, radius: number, excludePortalId?: number): boolean {
    const thresholdSq = Math.pow(radius + DEFAULT_PORTAL_RADIUS * 0.7, 2);
    for (const portal of this.store.portals) {
      if (portal.id === excludePortalId) continue;
      if (portal.entry.position.distanceToSq(position) <= thresholdSq) return true;
      if (portal.exit.position.distanceToSq(position) <= thresholdSq) return true;
    }
    return false;
  }

  private exitLaneBlocked(position: Vec2, rotation: number, radius: number): boolean {
    const normal = portalNormal(rotation);
    for (let i = 1; i <= 4; i++) {
      const sample = position.add(normal.scale(radius + i * 4));
      if (this.endpointTouchesCollision(sample, radius * 0.45)) {
        return true;
      }
    }
    return false;
  }

  private getPairRotationHandle(portal: PortalPair): Vec2 {
    const mid = portal.entry.position.lerp(portal.exit.position, 0.5);
    const axis = portal.exit.position.sub(portal.entry.position);
    const tangent = axis.lengthSq() > 0.001 ? axis.normalize() : portalTangent(portal.entry.rotation);
    const normal = tangent.perpCCW();
    return mid.add(normal.scale(28 / this.getZoom()));
  }

  private getPairRotationAngle(portal: PortalPair, worldPos: Vec2): number {
    const mid = portal.entry.position.lerp(portal.exit.position, 0.5);
    return this.quantizeAngle(Math.atan2(worldPos.y - mid.y, worldPos.x - mid.x));
  }

  private quantizeAngle(angle: number): number {
    if (!this.shiftHeld) return angle;
    const step = Math.PI / 12;
    return Math.round(angle / step) * step;
  }

  private normalizeAngleDelta(angle: number): number {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized < -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  private onWindowKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.shiftHeld = true;
  };

  private onWindowKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.shiftHeld = false;
  };
}
