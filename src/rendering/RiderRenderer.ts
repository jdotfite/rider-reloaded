import { COLOR_RIDER, COLOR_SLED, COLOR_SCARF } from '../constants';

export interface RiderRenderData {
  points: Array<{ x: number; y: number }>;
  mounted: boolean;
  sledIntact: boolean;
}

// Point indices matching rider-data.ts
const PEG = 0, TAIL = 1, NOSE = 2, STRING = 3;
const BUTT = 4, SHOULDER = 5, RHAND = 6, LHAND = 7, LFOOT = 8, RFOOT = 9;
const SCARF_START = 10;

export class RiderRenderer {
  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 10) return;
    const p = rider.points;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Sled: quadrilateral PEG → TAIL → NOSE → STRING
    if (rider.sledIntact) {
      ctx.strokeStyle = COLOR_SLED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p[PEG].x, p[PEG].y);
      ctx.lineTo(p[TAIL].x, p[TAIL].y);
      ctx.lineTo(p[NOSE].x, p[NOSE].y);
      ctx.lineTo(p[STRING].x, p[STRING].y);
      ctx.closePath();
      ctx.stroke();
    }

    // Body lines
    ctx.strokeStyle = COLOR_RIDER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Legs: feet to butt
    ctx.moveTo(p[LFOOT].x, p[LFOOT].y);
    ctx.lineTo(p[BUTT].x, p[BUTT].y);
    ctx.moveTo(p[RFOOT].x, p[RFOOT].y);
    ctx.lineTo(p[BUTT].x, p[BUTT].y);
    // Torso
    ctx.moveTo(p[BUTT].x, p[BUTT].y);
    ctx.lineTo(p[SHOULDER].x, p[SHOULDER].y);
    // Arms: shoulder to hands
    ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y);
    ctx.lineTo(p[LHAND].x, p[LHAND].y);
    ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y);
    ctx.lineTo(p[RHAND].x, p[RHAND].y);
    ctx.stroke();

    // Head: circle offset from shoulder along shoulder-butt direction
    const dx = p[SHOULDER].x - p[BUTT].x;
    const dy = p[SHOULDER].y - p[BUTT].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const headRadius = 5;
    const headDist = len > 0 ? headRadius / len : 0;
    const hx = p[SHOULDER].x + dx * headDist;
    const hy = p[SHOULDER].y + dy * headDist;
    ctx.fillStyle = COLOR_RIDER;
    ctx.beginPath();
    ctx.arc(hx, hy, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Scarf
    if (rider.points.length > SCARF_START + 1) {
      ctx.strokeStyle = COLOR_SCARF;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y);
      for (let i = SCARF_START; i < rider.points.length; i++) {
        ctx.lineTo(p[i].x, p[i].y);
      }
      ctx.stroke();
    }
  }
}
