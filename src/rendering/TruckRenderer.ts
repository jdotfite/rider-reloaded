import { RiderRenderData } from './RiderRenderer';
import {
  TRUCK_BODY_SVG, TRUCK_SVG_W, TRUCK_SVG_H,
  SVG_WHEEL_FRONT, SVG_WHEEL_REAR, SVG_WHEEL_R,
} from './truck-svg';

/**
 * Hybrid truck renderer:
 *   - SVG image for the body (filled, no wheels)
 *   - Procedural spinning wheels drawn at physics wheel positions
 *   - Driver head behind the body (peeks through window)
 *   - Debris explosion on crash
 *
 * The SVG truck faces LEFT. Physics moves RIGHT.
 * We flip by swapping the SVG wheel mapping.
 */

const CF = 0, WF = 1, WR = 2, CR = 3;
const DS = 4, DH = 5;
const EXHAUST_START = 6;

const SKIN = '#fdca8d';
const HELMET = '#333333';
const VISOR = '#8ec8e8';
const TIRE = '#222222';
const RIM = '#444444';
const SPOKE = '#666666';
const HUB = '#777777';

interface Debris {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  w: number; h: number;
  color: string;
  life: number;
}

export class TruckRenderer {
  private bodyImage: HTMLImageElement;
  private imageReady = false;
  private wheelAngle = 0;
  private debris: Debris[] = [];
  private wasSledIntact = true;
  private prevWFx = 0;

  constructor() {
    this.bodyImage = new Image();
    const blob = new Blob([TRUCK_BODY_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.bodyImage.onload = () => {
      this.imageReady = true;
      URL.revokeObjectURL(url);
    };
    this.bodyImage.src = url;
  }

  resetDebris() {
    this.debris = [];
    this.wasSledIntact = true;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    // Detect crash
    if (this.wasSledIntact && !rider.sledIntact) {
      this.spawnDebris(p);
    }
    this.wasSledIntact = rider.sledIntact;

    // Wheel rotation from actual wheel movement
    const wheelSpeed = p[WF].x - this.prevWFx;
    this.prevWFx = p[WF].x;
    // Convert linear speed to angular speed: angle = distance / radius
    // Physics wheel radius ≈ distance between WF and CF vertically
    const physWheelR = Math.sqrt(
      (p[CF].x - p[WF].x) ** 2 + (p[CF].y - p[WF].y) ** 2
    ) * 0.4;
    if (physWheelR > 0.1) {
      this.wheelAngle += wheelSpeed / physWheelR;
    }

    // Frame vectors for wheel positioning
    const fdx = p[WR].x - p[WF].x;
    const fdy = p[WR].y - p[WF].y;
    const fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
    const fx = fdx / fLen, fy = fdy / fLen;
    // Up vector (perpendicular, away from ground)
    const ux = fy, uy = -fx;

    // Visual wheel radius in physics space
    const svgWheelSpan = Math.sqrt(
      (SVG_WHEEL_REAR.x - SVG_WHEEL_FRONT.x) ** 2 +
      (SVG_WHEEL_REAR.y - SVG_WHEEL_FRONT.y) ** 2
    );
    const scale = fLen / svgWheelSpan;
    const visWheelR = SVG_WHEEL_R * scale;

    // Exhaust behind everything
    if (rider.sledIntact && rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    // Driver behind the truck
    if (rider.points.length > DH) {
      this.drawDriver(ctx, p);
    }

    if (rider.sledIntact && this.imageReady) {
      // Draw body SVG (flipped: SVG rear → physics front)
      this.drawBody(ctx, p[WF], p[WR]);

      // Draw spinning wheels at physics wheel positions, offset up by wheel radius
      const wf = { x: p[WF].x + ux * visWheelR, y: p[WF].y + uy * visWheelR };
      const wr = { x: p[WR].x + ux * visWheelR, y: p[WR].y + uy * visWheelR };
      this.drawWheel(ctx, wf.x, wf.y, visWheelR, this.wheelAngle);
      this.drawWheel(ctx, wr.x, wr.y, visWheelR, this.wheelAngle);
    }

    // Debris
    if (this.debris.length > 0) {
      this.updateAndDrawDebris(ctx);
    }
  }

  private drawBody(
    ctx: CanvasRenderingContext2D,
    physWF: { x: number; y: number },
    physWR: { x: number; y: number },
  ) {
    const pdx = physWR.x - physWF.x;
    const pdy = physWR.y - physWF.y;
    const physAngle = Math.atan2(pdy, pdx);
    const physLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;

    // Flip: SVG rear wheel → physics front wheel
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
    ctx.drawImage(this.bodyImage, 0, 0, TRUCK_SVG_W, TRUCK_SVG_H);
    ctx.restore();
  }

  private drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
    // Outer tire
    ctx.fillStyle = TIRE;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tread marks
    ctx.strokeStyle = '#333';
    ctx.lineWidth = r * 0.07;
    for (let i = 0; i < 16; i++) {
      const a = rot + (i * Math.PI * 2 / 16);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
      ctx.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97);
      ctx.stroke();
    }

    // Rim ring
    ctx.fillStyle = RIM;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner rim ring
    ctx.strokeStyle = SPOKE;
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // 5 spokes (rotate with wheel)
    ctx.strokeStyle = SPOKE;
    ctx.lineWidth = r * 0.1;
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12);
      ctx.lineTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
      ctx.stroke();
    }

    // Hub center
    ctx.fillStyle = HUB;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    const seat = p[DS], head = p[DH];
    const dx = head.x - seat.x, dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;

    const hx = head.x + nx * 1.5;
    const hy = head.y + ny * 1.5;
    const hr = 2.8;

    // Skin circle
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = HELMET;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet top
    ctx.fillStyle = HELMET;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, Math.PI, 0, false);
    ctx.fill();

    // Visor
    const px = -ny, py = nx;
    ctx.fillStyle = VISOR;
    ctx.strokeStyle = '#5a9ab5';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(hx + px * hr * 0.2, hy + py * hr * 0.2,
      hr * 0.65, hr * 0.35, Math.atan2(ny, nx), 0, Math.PI * 2);
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
      const r = 1.2 + t * 4;
      // Soft outer
      ctx.fillStyle = '#888';
      ctx.globalAlpha = (1 - t) * 0.25;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Dense inner
      ctx.fillStyle = '#aaa';
      ctx.globalAlpha = (1 - t) * 0.45;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── EXPLOSION ──

  private spawnDebris(p: Array<{x: number; y: number}>) {
    this.debris = [];
    const cx = (p[WF].x + p[WR].x + p[CF].x + p[CR].x) / 4;
    const cy = (p[WF].y + p[WR].y + p[CF].y + p[CR].y) / 4;
    const vx = (p[WR].x - p[CF].x) * 0.12;
    const vy = (p[WR].y - p[CF].y) * 0.12;

    const colors = [
      '#2a2a2a', '#333', '#444', '#555',
      '#1a1a1a', '#222', '#666', '#777',
      '#8ec8e8', '#fdca8d',
    ];

    const count = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.4 + Math.random() * 2;
      const r = Math.random();
      const w = r < 0.15 ? 3 + Math.random() * 5 : r < 0.5 ? 1.5 + Math.random() * 3 : 0.4 + Math.random() * 1.5;
      const h = w * (0.3 + Math.random() * 0.7);

      this.debris.push({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 8,
        vx: vx + Math.cos(a) * spd,
        vy: vy + Math.sin(a) * spd - Math.random() * 1.5,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.5,
        w, h,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 80 + Math.floor(Math.random() * 60),
      });
    }
  }

  private updateAndDrawDebris(ctx: CanvasRenderingContext2D) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy += 0.06;
      d.x += d.vx;
      d.y += d.vy;
      d.rot += d.rotV;
      d.life--;
      if (d.life <= 0) { this.debris.splice(i, 1); continue; }

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
