import { Line } from '../physics/lines/Line';
import { LineType } from '../physics/lines/LineTypes';
import { Vec2 } from '../math/Vec2';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY, LINE_WIDTH } from '../constants';
import type { TrackLayer } from '../store/TrackStore';
import type { PortalPair } from '../store/PortalTypes';
import { getPortalThemePalette } from '../portal/portalTheme';
import {
  buildPortalArchPath,
  buildPortalLipPath,
  buildPortalSketchMetrics,
  getPortalFrontStubSegments,
  portalPathToSvg,
} from '../portal/portalSketch';

const TYPE_COLORS: Record<LineType, string> = {
  [LineType.SOLID]: COLOR_SOLID,
  [LineType.ACC]: COLOR_ACC,
  [LineType.SCENERY]: COLOR_SCENERY,
};

const TYPE_NAMES: Record<LineType, string> = {
  [LineType.SOLID]: 'solid',
  [LineType.ACC]: 'acceleration',
  [LineType.SCENERY]: 'scenery',
};

export function exportTrackAsSvg(
  lines: Line[],
  layers: TrackLayer[],
  startPosition: Vec2,
  portals: PortalPair[] = [],
): string {
  if (lines.length === 0 && portals.length === 0) {
    // Empty track — small default viewBox around start
    const pad = 50;
    const vx = startPosition.x - pad;
    const vy = startPosition.y - pad;
    return buildSvg(vx, vy, pad * 2, pad * 2, '', buildFlag(startPosition));
  }

  // Compute bounds
  let minX = startPosition.x;
  let maxX = startPosition.x;
  let minY = startPosition.y;
  let maxY = startPosition.y;

  for (const line of lines) {
    minX = Math.min(minX, line.p1.x, line.p2.x);
    maxX = Math.max(maxX, line.p1.x, line.p2.x);
    minY = Math.min(minY, line.p1.y, line.p2.y);
    maxY = Math.max(maxY, line.p1.y, line.p2.y);
  }
  for (const portal of portals) {
    const bounds = portalBounds(portal);
    minX = Math.min(minX, bounds.minX);
    maxX = Math.max(maxX, bounds.maxX);
    minY = Math.min(minY, bounds.minY);
    maxY = Math.max(maxY, bounds.maxY);
  }

  const padding = 20;
  const vx = minX - padding;
  const vy = minY - padding;
  const vw = maxX - minX + padding * 2;
  const vh = maxY - minY + padding * 2;

  // Build line groups by type
  let lineGroups = '';
  for (const type of [LineType.SCENERY, LineType.ACC, LineType.SOLID]) {
    const color = TYPE_COLORS[type];
    const name = TYPE_NAMES[type];
    const visibleLines: Line[] = [];

    for (const layer of layers) {
      if (!layer.visible) continue;
      for (const line of lines) {
        if (line.layer === layer.id && line.type === type) {
          visibleLines.push(line);
        }
      }
    }

    if (visibleLines.length === 0) continue;

    let paths = '';
    for (const line of visibleLines) {
      paths += `    <line x1="${r(line.p1.x)}" y1="${r(line.p1.y)}" x2="${r(line.p2.x)}" y2="${r(line.p2.y)}" />\n`;
    }

    lineGroups += `  <g id="${name}" stroke="${color}" stroke-width="${LINE_WIDTH}" stroke-linecap="round">\n${paths}  </g>\n`;
  }

  const flag = buildFlag(startPosition);
  const portalGroups = buildPortalGroups(portals, layers);
  return buildSvg(vx, vy, vw, vh, lineGroups + portalGroups, flag);
}

function buildPortalGroups(portals: PortalPair[], layers: TrackLayer[]): string {
  const layerMap = new Map(layers.map(layer => [layer.id, layer]));
  const visiblePortals = portals.filter(portal => layerMap.get(portal.layer)?.visible);
  if (visiblePortals.length === 0) return '';

  let groups = '  <g id="portals">\n';
  for (const portal of visiblePortals) {
    const palette = getPortalThemePalette(portal.visual.colorTheme);
    const opacity = portal.enabled ? '1' : '0.45';
    groups += `    <g id="portal-${portal.id}" opacity="${opacity}">\n`;
    if (portal.visual.showEditorLink) {
      groups += `      <line x1="${r(portal.entry.position.x)}" y1="${r(portal.entry.position.y)}" x2="${r(portal.exit.position.x)}" y2="${r(portal.exit.position.y)}" stroke="${palette.link}" stroke-width="1.2" stroke-dasharray="6 5" />\n`;
    }
    groups += buildPortalEndpointSvg(portal.entry.position, portal.entry.rotation, portal.entry.length, portal.entry.radius, palette.entry);
    groups += buildPortalEndpointSvg(portal.exit.position, portal.exit.rotation, portal.exit.length, portal.exit.radius, palette.exit);
    groups += '    </g>\n';
  }
  groups += '  </g>\n';
  return groups;
}

function buildPortalEndpointSvg(position: Vec2, rotation: number, length: number, radius: number, color: string): string {
  const metrics = buildPortalSketchMetrics(length, radius);
  const backArch = portalPathToSvg(buildPortalArchPath(metrics, metrics.backOffset));
  const frontArch = portalPathToSvg(buildPortalArchPath(metrics));
  const lip = portalPathToSvg(buildPortalLipPath(metrics));
  const stubs = getPortalFrontStubSegments(metrics)
    .map(stub => `M ${stub.start.x} ${stub.start.y} L ${stub.end.x} ${stub.end.y}`)
    .join(' ');
  const x = r(position.x);
  const y = r(position.y);
  return [
    `      <g transform="translate(${x} ${y}) rotate(${r(rotation * 180 / Math.PI)})">`,
    `        <ellipse cx="${r(metrics.fieldCenter.x)}" cy="${r(metrics.fieldCenter.y)}" rx="${r(metrics.fieldRx)}" ry="${r(metrics.fieldRy)}" fill="${withAlpha('#ffffff', 0.74)}" />`,
    `        <ellipse cx="${r(metrics.fieldCenter.x)}" cy="${r(metrics.fieldCenter.y)}" rx="${r(metrics.fieldRx * 0.96)}" ry="${r(metrics.fieldRy * 0.9)}" fill="none" stroke="${withAlpha(color, 0.05)}" stroke-width="0.85" />`,
    `        <path d="${backArch}" fill="none" stroke="${withAlpha('#737373', 0.62)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
    `        <path d="${frontArch}" fill="none" stroke="#111111" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round" />`,
    `        <path d="${lip} ${stubs}" fill="none" stroke="${withAlpha('#111111', 0.42)}" stroke-width="1.28" stroke-linecap="round" stroke-linejoin="round" />`,
    '      </g>\n',
  ].join('\n');
}

function portalBounds(portal: PortalPair) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const endpoint of [portal.entry, portal.exit]) {
    const metrics = buildPortalSketchMetrics(endpoint.length, endpoint.radius);
    const localPoints = [
      new Vec2(-metrics.halfSpan, metrics.footY),
      new Vec2(metrics.halfSpan, metrics.footY),
      new Vec2(0, metrics.crownY),
      metrics.backOffset.add(new Vec2(-metrics.halfSpan, metrics.footY)),
      metrics.backOffset.add(new Vec2(metrics.halfSpan, metrics.footY)),
      metrics.backOffset.add(new Vec2(0, metrics.crownY)),
      new Vec2(
        metrics.fieldCenter.x - metrics.fieldRx,
        metrics.fieldCenter.y - metrics.fieldRy,
      ),
      new Vec2(
        metrics.fieldCenter.x + metrics.fieldRx,
        metrics.fieldCenter.y + metrics.fieldRy,
      ),
      new Vec2(
        metrics.shadowCenter.x - metrics.shadowRx,
        metrics.shadowCenter.y - metrics.shadowRy,
      ),
      new Vec2(
        metrics.shadowCenter.x + metrics.shadowRx,
        metrics.shadowCenter.y + metrics.shadowRy,
      ),
    ];
    const cos = Math.cos(endpoint.rotation);
    const sin = Math.sin(endpoint.rotation);
    for (const point of localPoints) {
      const worldX = endpoint.position.x + point.x * cos - point.y * sin;
      const worldY = endpoint.position.y + point.x * sin + point.y * cos;
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minY = Math.min(minY, worldY);
      maxY = Math.max(maxY, worldY);
    }
  }
  return { minX, maxX, minY, maxY };
}

function withAlpha(color: string, alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha));
  const rVal = parseInt(color.slice(1, 3), 16);
  const gVal = parseInt(color.slice(3, 5), 16);
  const bVal = parseInt(color.slice(5, 7), 16);
  return `rgba(${rVal},${gVal},${bVal},${normalized})`;
}

function buildFlag(pos: Vec2): string {
  const x = r(pos.x);
  const y = r(pos.y);
  const top = r(pos.y - 36);
  const flagBottom = r(pos.y - 36 + 9);
  const flagRight = r(pos.x + 14);
  const flagMid = r(pos.y - 36 + 4.5);
  return `  <g id="start-flag">
    <line x1="${x}" y1="${y}" x2="${x}" y2="${top}" stroke="#111" stroke-width="1.5" stroke-linecap="round" />
    <polygon points="${x},${top} ${flagRight},${flagMid} ${x},${flagBottom}" fill="#111" />
    <circle cx="${x}" cy="${y}" r="2" fill="#111" />
  </g>\n`;
}

function buildSvg(vx: number, vy: number, vw: number, vh: number, lineGroups: string, flag: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(vx)} ${r(vy)} ${r(vw)} ${r(vh)}" width="${r(vw)}" height="${r(vh)}">
  <rect x="${r(vx)}" y="${r(vy)}" width="${r(vw)}" height="${r(vh)}" fill="#f0f0f0" />
${flag}${lineGroups}</svg>
`;
}

function r(n: number): string {
  return Number(n.toFixed(2)).toString();
}
