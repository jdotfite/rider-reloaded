import { Line } from '../physics/lines/Line';
import { LineType } from '../physics/lines/LineTypes';
import { Vec2 } from '../math/Vec2';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY, LINE_WIDTH } from '../constants';
import type { TrackLayer } from '../store/TrackStore';

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
): string {
  if (lines.length === 0) {
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
  return buildSvg(vx, vy, vw, vh, lineGroups, flag);
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
