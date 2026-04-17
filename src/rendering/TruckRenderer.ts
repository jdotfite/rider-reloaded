import { RiderRenderData } from './RiderRenderer';
import {
  TRUCK_SVG, TRUCK_SVG_W, TRUCK_SVG_H,
  SVG_WHEEL_FRONT, SVG_WHEEL_REAR,
} from './truck-svg';

/**
 * Monster truck renderer — SVG image + procedural exhaust + debris explosion.
 *
 * Physics points (from truck.ts):
 *   0: CHASSIS_FRONT  1: WHEEL_FRONT  2: WHEEL_REAR  3: CHASSIS_REAR
 *   4: DRIVER_SEAT    5: DRIVER_HEAD  6+: exhaust flutter
 *
 * The SVG truck faces LEFT but physics moves RIGHT, so we swap the
 * wheel mapping: SVG front wheel → physics REAR, SVG rear → physics FRONT.
 */

const CF = 0, WF = 1, WR = 2, CR = 3;
const DS = 4, DH = 5;
const EXHAUST_START = 6;

const DRIVER_COLOR = '#333333';
const SKIN_COLOR = '#fdca8d';
const VISOR_COLOR = '#8ec8e8';

interface Debris {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  w: number; h: number;
  color: string;
  life: number;
}

export class TruckRenderer {
  private truckImage: HTMLImageElement;
  private imageReady = false;

  // Explosion debris
  private debris: Debris[] = [];
  private wasSledIntact = true;

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

    // Detect crash — spawn debris when sled breaks
    if (this.wasSledIntact && !rider.sledIntact) {
      this.spawnDebris(p);
    }
    this.wasSledIntact = rider.sledIntact;

    // Exhaust behind everything
    if (rider.sledIntact && rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    // Driver behind the truck (head peeks through window)
    if (rider.points.length > DH) {
      this.drawDriver(ctx, p);
    }

    // Truck SVG image
    if (rider.sledIntact && this.imageReady) {
      // Swap wheel mapping: SVG faces left, physics faces right
      // Map SVG_WHEEL_REAR → physWF and SVG_WHEEL_FRONT → physWR
      this.drawSvgTransformed(ctx, p[WF], p[WR]);
    }

    // Debris particles (after crash)
    if (this.debris.length > 0) {
      this.updateAndDrawDebris(ctx);
    }
  }

  /** Reset debris state (called when rider resets) */
  resetDebris() {
    this.debris = [];
    this.wasSledIntact = true;
  }

  private drawSvgTransformed(
    ctx: CanvasRenderingContext2D,
    physWF: { x: number; y: number },
    physWR: { x: number; y: number },
  ) {
    // Physics: WF(left) → WR(right), truck moves right
    // SVG: front wheel is on the LEFT side, rear on RIGHT
    // To flip: map SVG rear wheel → physics front (left), SVG front → physics rear (right)
    const pdx = physWR.x - physWF.x;
    const pdy = physWR.y - physWF.y;
    const physAngle = Math.atan2(pdy, pdx);
    const physLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;

    // SVG vector — reversed to flip the truck
    const sdx = SVG_WHEEL_FRONT.x - SVG_WHEEL_REAR.x;
    const sdy = SVG_WHEEL_FRONT.y - SVG_WHEEL_REAR.y;
    const svgAngle = Math.atan2(sdy, sdx);
    const svgLen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;

    const scale = physLen / svgLen;
    const rotation = physAngle - svgAngle;

    ctx.save();
    ctx.translate(physWF.x, physWF.y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-SVG_WHEEL_REAR.x, -SVG_WHEEL_REAR.y);
    ctx.drawImage(this.truckImage, 0, 0, TRUCK_SVG_W, TRUCK_SVG_H);
    ctx.restore();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    const seat = p[DS];
    const head = p[DH];
    const dx = head.x - seat.x;
    const dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;

    const hx = head.x + nx * 1.5;
    const hy = head.y + ny * 1.5;
    const headR = 2.8;

    // Skin
    ctx.fillStyle = SKIN_COLOR;
    ctx.strokeStyle = DRIVER_COLOR;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet top half
    ctx.fillStyle = DRIVER_COLOR;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, Math.PI, 0, false);
    ctx.fill();

    // Visor
    const perpX = -ny, perpY = nx;
    ctx.fillStyle = VISOR_COLOR;
    ctx.strokeStyle = '#5a9ab5';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(
      hx + perpX * headR * 0.2,
      hy + perpY * headR * 0.2,
      headR * 0.65, headR * 0.35,
      Math.atan2(ny, nx), 0, Math.PI * 2
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

      // Larger, more visible puffs with warm gray gradient
      const radius = 1.2 + t * 4;
      const alpha = (1 - t) * 0.4;

      // Outer soft puff
      ctx.fillStyle = '#888888';
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Inner denser puff
      ctx.fillStyle = '#aaaaaa';
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── EXPLOSION DEBRIS ──

  private spawnDebris(p: Array<{x: number; y: number}>) {
    this.debris = [];

    // Center of the truck
    const cx = (p[WF].x + p[WR].x + p[CF].x + p[CR].x) / 4;
    const cy = (p[WF].y + p[WR].y + p[CF].y + p[CR].y) / 4;

    // Velocity of the truck at crash
    const vx = (p[WR].x - p[CF].x) * 0.15;
    const vy = (p[WR].y - p[CF].y) * 0.15;

    const colors = [
      '#2a2a2a', '#333333', '#444444', '#555555', // body panels
      '#1a1a1a', '#222222',                        // dark parts
      '#666666', '#777777',                         // lighter metal
      '#8ec8e8',                                    // glass shard
      '#fdca8d',                                    // orange bits
    ];

    // Spawn lots of debris — panels, shards, bolts
    const count = 35 + Math.floor(Math.random() * 15);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 1.5;
      const spread = (Math.random() - 0.5) * 8;

      // Vary sizes — mix of big panels, medium chunks, small bolts
      let w: number, h: number;
      const sizeRoll = Math.random();
      if (sizeRoll < 0.15) {
        // Big panel
        w = 3 + Math.random() * 4;
        h = 2 + Math.random() * 3;
      } else if (sizeRoll < 0.5) {
        // Medium chunk
        w = 1.5 + Math.random() * 2.5;
        h = 1 + Math.random() * 2;
      } else {
        // Small bolt / shard
        w = 0.5 + Math.random() * 1.5;
        h = 0.3 + Math.random() * 1;
      }

      this.debris.push({
        x: cx + spread,
        y: cy + (Math.random() - 0.5) * 6,
        vx: vx + Math.cos(angle) * speed,
        vy: vy + Math.sin(angle) * speed - Math.random() * 1.2, // bias upward
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.4,
        w, h,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 80 + Math.floor(Math.random() * 60),
      });
    }
  }

  private updateAndDrawDebris(ctx: CanvasRenderingContext2D) {
    const gravity = 0.06;

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];

      // Physics
      d.vy += gravity;
      d.x += d.vx;
      d.y += d.vy;
      d.rot += d.rotV;
      d.life--;

      if (d.life <= 0) {
        this.debris.splice(i, 1);
        continue;
      }

      // Fade out in last 20 frames
      const alpha = d.life < 20 ? d.life / 20 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.3;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
