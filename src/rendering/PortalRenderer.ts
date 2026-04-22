import type { TrackLayer } from '../store/TrackStore';
import type { PortalEndpointKey, PortalPair } from '../store/PortalTypes';

export interface PortalRenderEvent {
  pairId: number;
  entryPosition: { x: number; y: number };
  exitPosition: { x: number; y: number };
  startedAt: number;
}

const ENTRY_COLOR = '#6f6cff';
const EXIT_COLOR = '#36d1ff';

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
    } = {},
  ) {
    const now = performance.now();
    const layerMap = new Map(layers.map(layer => [layer.id, layer]));

    for (const portal of portals) {
      const layer = layerMap.get(portal.layer);
      if (!layer?.visible) continue;

      const selected = options.selectedPortalId === portal.id;
      const editing = options.editing ?? false;
      const showLink = editing && (selected || portal.visual.showEditorLink);
      if (showLink) {
        this.drawLink(ctx, portal, selected);
      }

      for (const endpointKey of ['entry', 'exit'] as const) {
        const endpoint = portal[endpointKey];
        const active = selected && options.activeEndpoint === endpointKey;
        const color = endpointKey === 'entry' ? ENTRY_COLOR : EXIT_COLOR;
        const playbackAlpha = portal.visual.visibility === 'always' ? 0.94 : 0.74;
        const baseAlpha = editing ? 0.94 : playbackAlpha;
        this.drawPortalEndpoint(
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
        if (selected && editing) {
          this.drawEndpointLabel(ctx, endpoint.position.x, endpoint.position.y, endpointKey, active);
        }
      }
    }

    for (const event of options.events ?? []) {
      const age = now - event.startedAt;
      if (age > 260) continue;
      const t = age / 260;
      this.drawTeleportFlash(ctx, event, t);
    }
  }

  private drawLink(ctx: CanvasRenderingContext2D, portal: PortalPair, selected: boolean) {
    ctx.save();
    ctx.strokeStyle = selected ? 'rgba(71, 143, 255, 0.45)' : 'rgba(125, 125, 175, 0.18)';
    ctx.lineWidth = selected ? 2.2 : 1.25;
    ctx.setLineDash(selected ? [9, 7] : [6, 6]);
    ctx.beginPath();
    ctx.moveTo(portal.entry.position.x, portal.entry.position.y);
    ctx.lineTo(portal.exit.position.x, portal.exit.position.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawPortalEndpoint(
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
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const half = length / 2;
    const glow = (selected ? 1 : 0.55) * pulse;
    const strokeAlpha = Math.min(1, alpha + (selected ? 0.06 : 0));

    ctx.shadowColor = this.withAlpha(color, 0.22 * glow);
    ctx.shadowBlur = active ? 20 : selected ? 15 : 10;

    ctx.beginPath();
    ctx.roundRect(-half, -radius, length, radius * 2, radius);
    const field = ctx.createLinearGradient(0, -radius, 0, radius);
    field.addColorStop(0, this.withAlpha('#ffffff', 0.18 * alpha));
    field.addColorStop(0.5, this.withAlpha(color, 0.24 * alpha));
    field.addColorStop(1, this.withAlpha('#ffffff', 0.12 * alpha));
    ctx.fillStyle = field;
    ctx.strokeStyle = this.withAlpha(color, strokeAlpha);
    ctx.lineWidth = active ? 2.6 : selected ? 2.2 : 1.8;
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(-half + 4, -radius + 3, Math.max(4, length - 8), Math.max(4, radius * 2 - 6), Math.max(3, radius - 3));
    ctx.strokeStyle = this.withAlpha('#ffffff', 0.16 * alpha);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-5, radius * 0.1);
    ctx.lineTo(0, radius * 0.6);
    ctx.lineTo(5, radius * 0.1);
    ctx.strokeStyle = this.withAlpha(color, 0.82 * alpha);
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();
  }

  private drawTeleportFlash(ctx: CanvasRenderingContext2D, event: PortalRenderEvent, t: number) {
    const alpha = 1 - t;
    ctx.save();
    ctx.strokeStyle = `rgba(90, 170, 255, ${0.35 * alpha})`;
    ctx.lineWidth = 4 * alpha + 1;
    ctx.beginPath();
    ctx.moveTo(event.entryPosition.x, event.entryPosition.y);
    ctx.lineTo(event.exitPosition.x, event.exitPosition.y);
    ctx.stroke();

    for (const point of [event.entryPosition, event.exitPosition]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6 + 14 * t, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(90, 170, 255, ${0.45 * alpha})`;
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
    ctx.strokeText(label, x, y - 19);
    ctx.fillText(label, x, y - 19);
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
