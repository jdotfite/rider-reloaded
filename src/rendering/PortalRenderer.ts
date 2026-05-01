import type { TrackLayer } from '../store/TrackStore';
import type { PortalEndpointKey, PortalPair } from '../store/PortalTypes';
import { getPortalThemePalette } from '../portal/portalTheme';
import {
  buildPortalArchPath,
  buildPortalLipPath,
  buildPortalSketchMetrics,
  getPortalFrontStubSegments,
  tracePortalPath,
} from '../portal/portalSketch';
import { Vec2 } from '../math/Vec2';

export interface PortalRenderEvent {
  pairId: number;
  entryPosition: { x: number; y: number };
  exitPosition: { x: number; y: number };
  startedAt: number;
}

export class PortalRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    portals: PortalPair[],
    layers: TrackLayer[],
    options: {
      selectedPortalId?: number | null;
      activeEndpoint?: PortalEndpointKey | null;
      editing?: boolean;
      events?: PortalRenderEvent[];
      warningEndpoints?: Partial<Record<PortalEndpointKey, boolean>> | null;
    } = {},
  ) {
    this.renderBackdrop(ctx, portals, layers, options);
    this.renderForeground(ctx, portals, layers, options);
  }

  renderBackdrop(
    ctx: CanvasRenderingContext2D,
    portals: PortalPair[],
    layers: TrackLayer[],
    options: {
      selectedPortalId?: number | null;
      activeEndpoint?: PortalEndpointKey | null;
      editing?: boolean;
      events?: PortalRenderEvent[];
      warningEndpoints?: Partial<Record<PortalEndpointKey, boolean>> | null;
    } = {},
  ) {
    const now = performance.now();
    const layerMap = new Map(layers.map(layer => [layer.id, layer]));
    const activeEvents = this.collectActiveEvents(options.events ?? [], now);

    for (const portal of portals) {
      const layer = layerMap.get(portal.layer);
      if (!layer?.visible) continue;

      const selected = options.selectedPortalId === portal.id;
      const editing = options.editing ?? false;
      const palette = getPortalThemePalette(portal.visual.colorTheme);
      const activeEvent = activeEvents.get(portal.id);
      const showLink = editing && (selected || portal.visual.showEditorLink);
      if (showLink) {
        this.drawLink(ctx, portal, selected, palette.link);
      }

      for (const endpointKey of ['entry', 'exit'] as const) {
        const endpoint = portal[endpointKey];
        const active = selected && options.activeEndpoint === endpointKey;
        const color = endpointKey === 'entry' ? palette.entry : palette.exit;
        const baseAlpha = this.resolvePortalAlpha(portal, editing, !!activeEvent);
        this.drawPortalEndpointBackdrop(
          ctx,
          endpoint.position.x,
          endpoint.position.y,
          endpoint.rotation,
          endpoint.length,
          endpoint.radius,
          color,
          portal.enabled ? baseAlpha : baseAlpha * 0.42,
          selected,
          active,
          0.6 + 0.4 * Math.sin(now / 520 + portal.id + (endpointKey === 'entry' ? 0 : 1.2)),
        );
      }
    }
  }

  renderForeground(
    ctx: CanvasRenderingContext2D,
    portals: PortalPair[],
    layers: TrackLayer[],
    options: {
      selectedPortalId?: number | null;
      activeEndpoint?: PortalEndpointKey | null;
      editing?: boolean;
      events?: PortalRenderEvent[];
      warningEndpoints?: Partial<Record<PortalEndpointKey, boolean>> | null;
    } = {},
  ) {
    const now = performance.now();
    const layerMap = new Map(layers.map(layer => [layer.id, layer]));
    const activeEvents = this.collectActiveEvents(options.events ?? [], now);

    for (const portal of portals) {
      const layer = layerMap.get(portal.layer);
      if (!layer?.visible) continue;

      const selected = options.selectedPortalId === portal.id;
      const editing = options.editing ?? false;
      const palette = getPortalThemePalette(portal.visual.colorTheme);
      const activeEvent = activeEvents.get(portal.id);

      for (const endpointKey of ['entry', 'exit'] as const) {
        const endpoint = portal[endpointKey];
        const active = selected && options.activeEndpoint === endpointKey;
        const color = endpointKey === 'entry' ? palette.entry : palette.exit;
        const baseAlpha = this.resolvePortalAlpha(portal, editing, !!activeEvent);
        this.drawPortalEndpointForeground(
          ctx,
          endpoint.position.x,
          endpoint.position.y,
          endpoint.rotation,
          endpoint.length,
          endpoint.radius,
          endpointKey,
          portal.mode,
          color,
          portal.enabled ? baseAlpha : baseAlpha * 0.42,
          selected,
          active,
          0.6 + 0.4 * Math.sin(now / 520 + portal.id + (endpointKey === 'entry' ? 0 : 1.2)),
        );
        if (portal.visual.showDebug && editing) {
          this.drawDebugOverlay(ctx, endpoint.position.x, endpoint.position.y, endpoint.rotation, endpoint.length, endpoint.radius, color);
        }
        if (selected && options.warningEndpoints?.[endpointKey]) {
          this.drawWarningHalo(ctx, endpoint.position.x, endpoint.position.y, endpoint.rotation, endpoint.length, endpoint.radius);
        }
        if (selected && editing) {
          this.drawEndpointLabel(ctx, endpoint.position.x, endpoint.position.y, endpointKey, active);
        }
      }
      if (editing && (selected || portal.mode === 'twoWay')) {
        this.drawPairBadge(ctx, portal, palette.link, selected);
      }
    }

    for (const event of activeEvents.values()) {
      const age = now - event.startedAt;
      if (age > 260) continue;
      const t = age / 260;
      const palette = getPortalThemePalette(
        portals.find(portal => portal.id === event.pairId)?.visual.colorTheme ?? 'violet',
      );
      this.drawTeleportFlash(ctx, event, t, palette.flash);
    }
  }

  private collectActiveEvents(events: PortalRenderEvent[], now: number) {
    const activeEvents = new Map<number, PortalRenderEvent>();
    for (const event of events) {
      if (now - event.startedAt <= 260) {
        activeEvents.set(event.pairId, event);
      }
    }
    return activeEvents;
  }

  private resolvePortalAlpha(portal: PortalPair, editing: boolean, activeEvent: boolean) {
    if (editing) return 0.94;
    if (portal.visual.visibility === 'always') return 0.94;
    if (portal.visual.visibility === 'activation') return activeEvent ? 0.86 : 0.12;
    return 0.74;
  }

  private drawLink(ctx: CanvasRenderingContext2D, portal: PortalPair, selected: boolean, color: string) {
    const start = portal.entry.position;
    const end = portal.exit.position;
    const delta = end.sub(start);
    const tangent = delta.lengthSq() > 0.001 ? delta.normalize() : new Vec2(1, 0);
    const normal = tangent.perpCCW();
    const midpoint = start.lerp(end, 0.5);
    const curveHeight = Math.min(34, Math.max(12, Math.sqrt(delta.lengthSq()) * (selected ? 0.16 : 0.1)));
    const control = midpoint.add(normal.scale(curveHeight));
    ctx.save();
    ctx.strokeStyle = selected ? this.withAlpha(color, 0.42) : this.withAlpha(color, 0.22);
    ctx.lineWidth = selected ? 2.2 : 1.25;
    ctx.setLineDash(selected ? [9, 7] : [6, 6]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawPortalEndpointBackdrop(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    length: number,
    radius: number,
    color: string,
    alpha: number,
    selected: boolean,
    active: boolean,
    pulse: number,
  ) {
    const metrics = buildPortalSketchMetrics(length, radius);
    const backArch = buildPortalArchPath(metrics, metrics.backOffset);
    const energy = 0.82 + pulse * 0.18;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.fillStyle = this.withAlpha('#ffffff', 0.74 * alpha * energy);
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

    ctx.strokeStyle = this.withAlpha(color, 0.05 * alpha * energy);
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.ellipse(
      metrics.fieldCenter.x,
      metrics.fieldCenter.y,
      metrics.fieldRx * 0.96,
      metrics.fieldRy * 0.9,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.withAlpha('#737373', (active ? 0.82 : selected ? 0.72 : 0.62) * alpha * energy);
    ctx.lineWidth = active ? 2.1 : selected ? 1.95 : 1.8;
    ctx.beginPath();
    tracePortalPath(ctx, backArch);
    ctx.stroke();

    ctx.restore();
  }

  private drawPortalEndpointForeground(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    length: number,
    radius: number,
    endpointKey: PortalEndpointKey,
    mode: PortalPair['mode'],
    color: string,
    alpha: number,
    selected: boolean,
    active: boolean,
    pulse: number,
  ) {
    const metrics = buildPortalSketchMetrics(length, radius);
    const arch = buildPortalArchPath(metrics);
    const lip = buildPortalLipPath(metrics);
    const stubs = getPortalFrontStubSegments(metrics);
    const energy = 0.9 + pulse * 0.1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = this.withAlpha('#111111', alpha * (active ? 0.98 : selected ? 0.95 : 0.9) * energy);
    ctx.lineWidth = active ? 2.9 : selected ? 2.7 : 2.45;
    ctx.beginPath();
    tracePortalPath(ctx, arch);
    ctx.stroke();

    ctx.strokeStyle = this.withAlpha('#111111', alpha * (active ? 0.62 : selected ? 0.52 : 0.42) * energy);
    ctx.lineWidth = active ? 1.55 : selected ? 1.42 : 1.28;
    ctx.beginPath();
    tracePortalPath(ctx, lip);
    for (const stub of stubs) {
      ctx.moveTo(stub.start.x, stub.start.y);
      ctx.lineTo(stub.end.x, stub.end.y);
    }
    ctx.stroke();

    if (selected || active) {
      this.drawFlowGlyph(ctx, endpointKey, mode, metrics.fieldCenter.y, metrics.fieldRy, color, alpha);
    }

    ctx.restore();
  }

  private drawFlowGlyph(
    ctx: CanvasRenderingContext2D,
    endpointKey: PortalEndpointKey,
    mode: PortalPair['mode'],
    centerY: number,
    fieldRy: number,
    color: string,
    alpha: number,
  ) {
    const drawChevron = (dir: number, yOffset = 0) => {
      const spread = Math.max(3.6, fieldRy * 0.26);
      ctx.beginPath();
      ctx.moveTo(-5, centerY + yOffset - dir * spread * 0.46);
      ctx.lineTo(0, centerY + yOffset + dir * spread * 0.3);
      ctx.lineTo(5, centerY + yOffset - dir * spread * 0.46);
      ctx.stroke();
    };

    ctx.strokeStyle = this.withAlpha(color, 0.82 * alpha);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (mode === 'twoWay') {
      drawChevron(1, fieldRy * 0.15);
      drawChevron(-1, -fieldRy * 0.15);
      return;
    }

    drawChevron(1, endpointKey === 'entry' ? -fieldRy * 0.1 : fieldRy * 0.1);
    if (endpointKey === 'exit') {
      ctx.beginPath();
      ctx.moveTo(-7, centerY - fieldRy * 0.7);
      ctx.lineTo(7, centerY - fieldRy * 0.7);
      ctx.strokeStyle = this.withAlpha('#ffffff', 0.22 * alpha);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawDebugOverlay(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    length: number,
    radius: number,
    color: string,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = this.withAlpha(color, 0.36);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-length / 2, -radius, length, radius * 2, radius);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = this.withAlpha(color, 0.44);
    ctx.beginPath();
    ctx.moveTo(-length / 2 - 12, 0);
    ctx.lineTo(length / 2 + 12, 0);
    ctx.moveTo(0, -radius - 12);
    ctx.lineTo(0, radius + 12);
    ctx.stroke();
    ctx.restore();
  }

  private drawWarningHalo(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rotation: number,
    length: number,
    radius: number,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = 'rgba(214, 75, 75, 0.78)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, length * 0.55, radius + 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawPairBadge(ctx: CanvasRenderingContext2D, portal: PortalPair, color: string, selected: boolean) {
    const midpoint = portal.entry.position.lerp(portal.exit.position, 0.5);
    const label = portal.mode === 'twoWay' ? '2W' : '1W';
    ctx.save();
    ctx.font = `700 ${selected ? 10 : 9}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = selected ? 24 : 22;
    const height = selected ? 15 : 14;
    ctx.fillStyle = this.withAlpha('#ffffff', selected ? 0.9 : 0.78);
    ctx.strokeStyle = this.withAlpha(color, selected ? 0.48 : 0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(midpoint.x - width / 2, midpoint.y - height / 2, width, height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.withAlpha('#2b3240', selected ? 0.88 : 0.72);
    ctx.fillText(label, midpoint.x, midpoint.y + 0.5);
    ctx.restore();
  }

  private drawTeleportFlash(ctx: CanvasRenderingContext2D, event: PortalRenderEvent, t: number, color: string) {
    const alpha = 1 - t;
    const start = new Vec2(event.entryPosition.x, event.entryPosition.y);
    const end = new Vec2(event.exitPosition.x, event.exitPosition.y);
    const delta = end.sub(start);
    const tangent = delta.lengthSq() > 0.001 ? delta.normalize() : new Vec2(1, 0);
    const normal = tangent.perpCCW();
    const midpoint = start.lerp(end, 0.5).add(normal.scale(Math.min(44, Math.max(14, Math.sqrt(delta.lengthSq()) * 0.16))));
    ctx.save();
    ctx.strokeStyle = this.withAlpha(color, 0.38 * alpha);
    ctx.lineWidth = 4 * alpha + 1;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midpoint.x, midpoint.y, end.x, end.y);
    ctx.stroke();

    for (const point of [event.entryPosition, event.exitPosition]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6 + 14 * t, 0, Math.PI * 2);
      ctx.strokeStyle = this.withAlpha(color, 0.48 * alpha);
      ctx.lineWidth = 2.5 * alpha + 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEndpointLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    endpointKey: PortalEndpointKey,
    active: boolean,
  ) {
    const label = endpointKey === 'entry' ? 'IN' : 'OUT';
    ctx.save();
    ctx.font = `600 ${active ? 11 : 10}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = active ? 'rgba(17,17,17,0.88)' : 'rgba(17,17,17,0.62)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(label, x, y - 21);
    ctx.fillText(label, x, y - 21);
    ctx.restore();
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
}
