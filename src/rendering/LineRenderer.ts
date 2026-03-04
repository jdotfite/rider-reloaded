import { Line } from '../physics/lines/Line';
import { LineType } from '../physics/lines/LineTypes';
import { COLOR_SOLID, COLOR_ACC, COLOR_SCENERY, LINE_WIDTH } from '../constants';
import { Camera } from '../camera/Camera';

const TYPE_COLORS: Record<LineType, string> = {
  [LineType.SOLID]: COLOR_SOLID,
  [LineType.ACC]: COLOR_ACC,
  [LineType.SCENERY]: COLOR_SCENERY,
};

export class LineRenderer {
  render(ctx: CanvasRenderingContext2D, lines: Line[], camera: Camera) {
    // Batch by type to minimize state changes
    for (const type of [LineType.SCENERY, LineType.ACC, LineType.SOLID]) {
      const color = TYPE_COLORS[type];
      const batch = lines.filter(l => l.type === type);
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
