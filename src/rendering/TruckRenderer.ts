import { RiderRenderData } from './RiderRenderer';
import {
  TRUCK_SVG, TRUCK_SVG_W, TRUCK_SVG_H,
  SVG_WHEEL_FRONT, SVG_WHEEL_REAR, SVG_WINDOW_CENTER,
} from './truck-svg';

/**
 * Monster truck renderer — uses the detailed SVG truck image,
 * transformed to fit the physics wheel contact points.
 *
 * Physics points (from truck.ts):
 *   0: CHASSIS_FRONT  (top-left, like PEG)
 *   1: WHEEL_FRONT    (bottom-left contact, like TAIL)
 *   2: WHEEL_REAR     (bottom-right contact, like NOSE)
 *   3: CHASSIS_REAR   (top-right, like STRING)
 *   4: DRIVER_SEAT
 *   5: DRIVER_HEAD
 *   6+: exhaust
 */

const WF = 1, WR = 2;
const DS = 4, DH = 5;
const EXHAUST_START = 6;

const DRIVER_COLOR = '#333333';
const SKIN_COLOR = '#fdca8d';
const VISOR_COLOR = '#8ec8e8';
const EXHAUST_CLR = '#999999';

export class TruckRenderer {
  private truckImage: HTMLImageElement;
  private imageReady = false;

  constructor() {
    this.truckImage = new Image();
    const blob = new Blob([TRUCK_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.truckImage.onload = () => {
      this.imageReady = true;
      URL.revokeObjectURL(url);
    };
    this.truckImage.src = url;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    // Exhaust behind everything
    if (rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    // Draw driver behind the truck (head shows through window)
    if (rider.points.length > DH) {
      this.drawDriver(ctx, p);
    }

    // Draw the truck SVG image mapped from wheel positions
    if (rider.sledIntact && this.imageReady) {
      this.drawSvgTransformed(ctx, p[WF], p[WR]);
    }
  }

  /**
   * Transform and draw the truck SVG so that the SVG wheel centers
   * map to the physics wheel contact points.
   */
  private drawSvgTransformed(
    ctx: CanvasRenderingContext2D,
    physWF: { x: number; y: number },
    physWR: { x: number; y: number },
  ) {
    // Physics vector between wheels
    const pdx = physWR.x - physWF.x;
    const pdy = physWR.y - physWF.y;
    const physAngle = Math.atan2(pdy, pdx);
    const physLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;

    // SVG vector between wheel centers
    const sdx = SVG_WHEEL_REAR.x - SVG_WHEEL_FRONT.x;
    const sdy = SVG_WHEEL_REAR.y - SVG_WHEEL_FRONT.y;
    const svgAngle = Math.atan2(sdy, sdx);
    const svgLen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;

    const scale = physLen / svgLen;
    const rotation = physAngle - svgAngle;

    ctx.save();
    ctx.translate(physWF.x, physWF.y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-SVG_WHEEL_FRONT.x, -SVG_WHEEL_FRONT.y);
    ctx.drawImage(this.truckImage, 0, 0, TRUCK_SVG_W, TRUCK_SVG_H);
    ctx.restore();
  }

  /**
   * Draw a simple driver head at the DRIVER_HEAD physics point.
   * Drawn before the truck so the head peeks through the window.
   */
  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    const seat = p[DS];
    const head = p[DH];
    const dx = head.x - seat.x;
    const dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;

    // Head position (offset along body axis)
    const hx = head.x + nx * 1.5;
    const hy = head.y + ny * 1.5;
    const headR = 2.8;

    // Head circle (skin)
    ctx.fillStyle = SKIN_COLOR;
    ctx.strokeStyle = DRIVER_COLOR;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet top
    ctx.fillStyle = DRIVER_COLOR;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, Math.PI, 0, false);
    ctx.fill();

    // Visor/goggles
    const perpX = -ny, perpY = nx;
    ctx.fillStyle = VISOR_COLOR;
    ctx.strokeStyle = '#5a9ab5';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(
      hx + perpX * headR * 0.2,
      hy + perpY * headR * 0.2,
      headR * 0.65, headR * 0.35,
      Math.atan2(ny, nx),
      0, Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();
  }

  private drawExhaust(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, total: number) {
    const count = total - EXHAUST_START;
    if (count < 2) return;
    for (let i = 0; i < count; i++) {
      const idx = EXHAUST_START + i;
      if (idx >= total) break;
      const t = i / (count - 1);
      ctx.fillStyle = EXHAUST_CLR;
      ctx.globalAlpha = (1 - t) * 0.15;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, 0.5 + t * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
