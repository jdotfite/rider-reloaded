import { RiderRenderData } from './RiderRenderer';

/**
 * Monster truck renderer — fully procedural canvas drawing.
 *
 * Physics points (from truck.ts, same layout as sled):
 *   0: CHASSIS_FRONT (top-left, like PEG)
 *   1: WHEEL_FRONT   (bottom-left contact, like TAIL)
 *   2: WHEEL_REAR    (bottom-right contact, like NOSE)
 *   3: CHASSIS_REAR   (top-right, like STRING)
 *   4: DRIVER_SEAT    5: DRIVER_HEAD    6+: exhaust flutter
 *
 * The truck faces RIGHT (hood at the left/front of the frame,
 * matching the sled's direction of travel).
 */

const CF = 0, WF = 1, WR = 2, CR = 3;
const DS = 4, DH = 5;
const EXHAUST_START = 6;

const OUTLINE = '#1a1a1a';
const BODY_DARK = '#2d2d2d';
const BODY_MID = '#3a3a3a';
const TIRE_COLOR = '#252525';
const TIRE_EDGE = '#1a1a1a';
const RIM_COLOR = '#4a4a4a';
const RIM_SPOKE = '#5a5a5a';
const RIM_HUB = '#666666';
const WINDOW = '#8ec8e8';
const BUMPER = '#444444';
const SKIN = '#fdca8d';

interface Debris {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  w: number; h: number;
  color: string;
  life: number;
}

export class TruckRenderer {
  private wheelAngle = 0;
  private prevWFx = 0;
  private debris: Debris[] = [];
  private wasSledIntact = true;

  resetDebris() {
    this.debris = [];
    this.wasSledIntact = true;
    this.prevWFx = 0;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    // Detect crash — spawn debris
    if (this.wasSledIntact && !rider.sledIntact) {
      this.spawnDebris(p);
    }
    this.wasSledIntact = rider.sledIntact;

    // Frame orientation from bottom edge (wheel line)
    const dx = p[WR].x - p[WF].x;
    const dy = p[WR].y - p[WF].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = dx / len, fy = dy / len;
    // Up = perpendicular, away from ground. In screen coords (+Y down): (fy, -fx)
    const ux = fy, uy = -fx;

    // Wheel rotation from actual ground speed
    const wheelSpeed = p[WF].x - this.prevWFx;
    this.prevWFx = p[WF].x;
    const wheelR = len * 0.22;
    if (wheelR > 0.1) {
      this.wheelAngle += wheelSpeed / wheelR;
    }

    // Anchor: midpoint of bottom edge
    const mx = (p[WF].x + p[WR].x) / 2;
    const my = (p[WF].y + p[WR].y) / 2;

    // Position helper: fwdT along forward, upT along up (as fraction of frame len)
    const at = (fwdT: number, upT: number) => ({
      x: mx + fx * fwdT * len + ux * upT * len,
      y: my + fy * fwdT * len + uy * upT * len,
    });

    // Wheel visual centers (offset up from contact by wheel radius)
    const wfx = p[WF].x + ux * wheelR, wfy = p[WF].y + uy * wheelR;
    const wrx = p[WR].x + ux * wheelR, wry = p[WR].y + uy * wheelR;

    // Exhaust behind everything
    if (rider.sledIntact && rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    if (rider.sledIntact) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Suspension struts
      const wOff = wheelR / len;
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = len * 0.06;
      const sf1 = at(-0.38, wOff); const sf2 = at(-0.38, 0.3);
      ctx.beginPath(); ctx.moveTo(sf1.x, sf1.y); ctx.lineTo(sf2.x, sf2.y); ctx.stroke();
      const sr1 = at(0.38, wOff); const sr2 = at(0.38, 0.3);
      ctx.beginPath(); ctx.moveTo(sr1.x, sr1.y); ctx.lineTo(sr2.x, sr2.y); ctx.stroke();

      // Frame rail
      ctx.strokeStyle = BODY_MID;
      ctx.lineWidth = len * 0.07;
      const railL = at(-0.42, 0.25); const railR = at(0.45, 0.25);
      ctx.beginPath(); ctx.moveTo(railL.x, railL.y); ctx.lineTo(railR.x, railR.y); ctx.stroke();

      // Body
      const by = 0.32;
      const bFL = at(-0.42, by);
      const bFU = at(-0.42, by + 0.22);
      const hoodF = at(-0.35, by + 0.35);
      const hoodR = at(-0.08, by + 0.35);
      const cabTF = at(-0.08, by + 0.65);
      const cabTR = at(0.15, by + 0.65);
      const bedTF = at(0.15, by + 0.35);
      const bedTR = at(0.45, by + 0.35);
      const bRL = at(0.45, by);

      ctx.fillStyle = BODY_DARK;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = len * 0.04;
      ctx.beginPath();
      ctx.moveTo(bFL.x, bFL.y);
      ctx.lineTo(bFU.x, bFU.y);
      ctx.lineTo(hoodF.x, hoodF.y);
      ctx.lineTo(hoodR.x, hoodR.y);
      ctx.lineTo(cabTF.x, cabTF.y);
      ctx.lineTo(cabTR.x, cabTR.y);
      ctx.lineTo(bedTF.x, bedTF.y);
      ctx.lineTo(bedTR.x, bedTR.y);
      ctx.lineTo(bRL.x, bRL.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Window
      const wBL = at(-0.05, by + 0.38);
      const wTL = at(-0.05, by + 0.60);
      const wTR = at(0.12, by + 0.60);
      const wBR = at(0.12, by + 0.38);
      ctx.fillStyle = WINDOW;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(wBL.x, wBL.y); ctx.lineTo(wTL.x, wTL.y);
      ctx.lineTo(wTR.x, wTR.y); ctx.lineTo(wBR.x, wBR.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = len * 0.02;
      ctx.stroke();

      // Front bumper
      const bmpL = at(-0.48, by - 0.02);
      const bmpR = at(-0.48, by + 0.15);
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = len * 0.06;
      ctx.beginPath(); ctx.moveTo(bmpL.x, bmpL.y); ctx.lineTo(bmpR.x, bmpR.y); ctx.stroke();

      // Exhaust pipe
      const pipeB = at(0.40, by + 0.20);
      const pipeT = at(0.40, by + 0.70);
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = len * 0.04;
      ctx.beginPath(); ctx.moveTo(pipeB.x, pipeB.y); ctx.lineTo(pipeT.x, pipeT.y); ctx.stroke();
      ctx.lineWidth = len * 0.06;
      const capL = at(0.38, by + 0.70); const capR = at(0.42, by + 0.70);
      ctx.beginPath(); ctx.moveTo(capL.x, capL.y); ctx.lineTo(capR.x, capR.y); ctx.stroke();

      // Wheel arches
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = len * 0.04;
      this.drawArch(ctx, wfx, wfy, wheelR + len * 0.04, fx, fy);
      this.drawArch(ctx, wrx, wry, wheelR + len * 0.04, fx, fy);
    }

    // Wheels (always drawn — roll away after crash)
    this.drawWheel(ctx, wfx, wfy, wheelR, this.wheelAngle);
    this.drawWheel(ctx, wrx, wry, wheelR, this.wheelAngle);

    // Driver
    if (rider.points.length > DH) {
      this.drawDriver(ctx, p, len);
    }

    // Debris
    if (this.debris.length > 0) {
      this.updateAndDrawDebris(ctx);
    }
  }

  private drawArch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fx: number, fy: number) {
    const angle = Math.atan2(fy, fx);
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle + Math.PI, angle, false);
    ctx.stroke();
  }

  private drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
    // Outer tire
    ctx.fillStyle = TIRE_COLOR;
    ctx.strokeStyle = TIRE_EDGE;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tread marks
    ctx.strokeStyle = '#333';
    ctx.lineWidth = r * 0.08;
    for (let i = 0; i < 14; i++) {
      const a = rot + (i * Math.PI * 2 / 14);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }

    // Rim
    ctx.fillStyle = RIM_COLOR;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spokes (spin with wheel)
    ctx.strokeStyle = RIM_SPOKE;
    ctx.lineWidth = r * 0.12;
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15);
      ctx.lineTo(x + Math.cos(a) * r * 0.44, y + Math.sin(a) * r * 0.44);
      ctx.stroke();
    }

    // Hub
    ctx.fillStyle = RIM_HUB;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, frameLen: number) {
    const seat = p[DS], head = p[DH];
    const ddx = head.x - seat.x, ddy = head.y - seat.y;
    const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    const nx = ddx / dlen, ny = ddy / dlen;

    // Body
    ctx.strokeStyle = BODY_DARK;
    ctx.lineWidth = frameLen * 0.1;
    ctx.beginPath(); ctx.moveTo(seat.x, seat.y); ctx.lineTo(head.x, head.y); ctx.stroke();

    // Helmet
    const hx = head.x + nx * frameLen * 0.15;
    const hy = head.y + ny * frameLen * 0.15;
    const hr = frameLen * 0.14;

    ctx.fillStyle = SKIN;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = frameLen * 0.03;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet top
    ctx.fillStyle = BODY_DARK;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, Math.PI, 0, false);
    ctx.fill();

    // Visor
    const px = -ny, py = nx;
    ctx.fillStyle = WINDOW;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(hx + px * hr * 0.35, hy + py * hr * 0.35, hr * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawExhaust(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, total: number) {
    const count = total - EXHAUST_START;
    if (count < 2) return;
    for (let i = 0; i < count; i++) {
      const idx = EXHAUST_START + i;
      if (idx >= total) break;
      const t = i / (count - 1);
      const r = 1.2 + t * 4;
      // Soft outer glow
      ctx.fillStyle = '#888';
      ctx.globalAlpha = (1 - t) * 0.25;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Dense inner puff
      ctx.fillStyle = '#aaa';
      ctx.globalAlpha = (1 - t) * 0.45;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── EXPLOSION DEBRIS ──

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
      const roll = Math.random();
      const w = roll < 0.15 ? 3 + Math.random() * 5 : roll < 0.5 ? 1.5 + Math.random() * 3 : 0.4 + Math.random() * 1.5;
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
