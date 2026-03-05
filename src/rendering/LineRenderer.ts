import { Line } from '../physics/lines/Line';
import { LineType } from '../physics/lines/LineTypes';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY, LINE_WIDTH } from '../constants';
import type { TrackLayer } from '../store/TrackStore';

const TYPE_COLORS: Record<LineType, string> = {
  [LineType.SOLID]: COLOR_SOLID,
  [LineType.ACC]: COLOR_ACC,
  [LineType.SCENERY]: COLOR_SCENERY,
};

// Normal-side indicator colors (classic Line Rider style)
const INDICATOR_COLORS: Partial<Record<LineType, string>> = {
  [LineType.SOLID]: '#4488cc', // blue stripe for solid lines
  [LineType.ACC]: '#cc6644',   // orange-red for acceleration lines
};

export class LineRenderer {
  render(ctx: CanvasRenderingContext2D, lines: Line[], layers: TrackLayer[], showIndicators = false) {
    for (const layer of layers) {
      if (!layer.visible) continue;

      const layerLines = lines.filter(line => line.layer === layer.id);
      if (layerLines.length === 0) continue;

      // Draw normal-side indicators first (behind main lines)
      if (showIndicators) {
        for (const type of [LineType.ACC, LineType.SOLID]) {
          const indicatorColor = INDICATOR_COLORS[type];
          if (!indicatorColor) continue;

          const batch = layerLines.filter(line => line.type === type);
          if (batch.length === 0) continue;

          ctx.strokeStyle = indicatorColor;
          ctx.lineWidth = LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();

          for (const line of batch) {
            // Offset by 2px in normal direction (toward the solid side)
            const ox = line.normal.x * 2;
            const oy = line.normal.y * 2;
            ctx.moveTo(line.p1.x + ox, line.p1.y + oy);
            ctx.lineTo(line.p2.x + ox, line.p2.y + oy);
          }
          ctx.stroke();
        }
      }

      // Draw main lines on top
      for (const type of [LineType.SCENERY, LineType.ACC, LineType.SOLID]) {
        const color = TYPE_COLORS[type];
        const batch = layerLines.filter(line => line.type === type);
        if (batch.length === 0) continue;

        ctx.strokeStyle = color;
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let previousEnd: Line | null = null;

        for (const line of batch) {
          const connected = previousEnd &&
            previousEnd.p2.x === line.p1.x &&
            previousEnd.p2.y === line.p1.y;

          if (!connected) {
            ctx.moveTo(line.p1.x, line.p1.y);
          }

          ctx.lineTo(line.p2.x, line.p2.y);
          previousEnd = line;
        }
        ctx.stroke();
      }
    }
  }
}
