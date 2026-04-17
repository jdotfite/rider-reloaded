import { RiderRenderData } from './RiderRenderer';

/**
 * Monster truck renderer.
 *
 * Physics points match the sled layout:
 *   0: CHASSIS_FRONT (like PEG, top-left)
 *   1: WHEEL_FRONT   (like TAIL, bottom-left)
 *   2: WHEEL_REAR    (like NOSE, bottom-right)
 *   3: CHASSIS_REAR   (like STRING, top-right)
 *   4: DRIVER_SEAT
 *   5: DRIVER_HEAD
 *   6+: exhaust flutter
 *
 * The truck body is drawn *around* these points. The bottom edge
 * (WHEEL_FRONT → WHEEL_REAR) is where the wheels sit. The top edge
 * (CHASSIS_FRONT → CHASSIS_REAR) is the chassis rail. The cab and
 * bed are drawn above the chassis rail using the frame orientation.
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
const EXHAUST_CLR = '#888888';

export class TruckRenderer {
  private wheelAngle = 0;

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    // Exhaust behind everything
    if (rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    // Frame orientation from bottom edge (wheel line)
    const dx = p[WR].x - p[WF].x;
    const dy = p[WR].y - p[WF].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // forward = along wheel axle line (left to right)
    const fx = dx / len, fy = dy / len;
    // up = perpendicular, pointing away from ground (toward chassis tops)
    // In screen coords (+Y down), rotate forward 90° clockwise = (fy, -fx)
    const ux = fy, uy = -fx;

    // Update wheel rotation
    // Use velocity of the wheel midpoint
    const wheelMidX = (p[WF].x + p[WR].x) / 2;
    const chassisMidX = (p[CF].x + p[CR].x) / 2;
    const speed = (wheelMidX - chassisMidX) * 0.08 + len * 0.02;
    this.wheelAngle += speed;

    // Wheel radius proportional to frame size
    const wheelR = len * 0.22;

    // Anchor point: midpoint of bottom edge
    const mx = (p[WF].x + p[WR].x) / 2;
    const my = (p[WF].y + p[WR].y) / 2;

    // Helper: position relative to frame
    const at = (fwdT: number, upT: number) => ({
      x: mx + fx * fwdT * len + ux * upT * len,
      y: my + fy * fwdT * len + uy * upT * len,
    });

    if (rider.sledIntact) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // ── SUSPENSION STRUTS ──
      // Connect from wheel visual center up to body bottom
      const wOff = wheelR / len; // wheel radius as fraction of frame length
      const strutW = len * 0.06;
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = strutW;
      // Front strut
      const sf1 = at(-0.38, wOff);
      const sf2 = at(-0.38, 0.3);
      ctx.beginPath(); ctx.moveTo(sf1.x, sf1.y); ctx.lineTo(sf2.x, sf2.y); ctx.stroke();
      // Rear strut
      const sr1 = at(0.38, wOff);
      const sr2 = at(0.38, 0.3);
      ctx.beginPath(); ctx.moveTo(sr1.x, sr1.y); ctx.lineTo(sr2.x, sr2.y); ctx.stroke();

      // ── FRAME RAIL (undercarriage) ──
      const railL = at(-0.42, 0.25);
      const railR = at(0.45, 0.25);
      ctx.strokeStyle = BODY_MID;
      ctx.lineWidth = len * 0.07;
      ctx.beginPath(); ctx.moveTo(railL.x, railL.y); ctx.lineTo(railR.x, railR.y); ctx.stroke();

      // ── BODY ──
      // The body sits above the frame rail
      const bodyY = 0.32; // bottom of body above wheel centerline

      // Body outline points
      const bFL = at(-0.42, bodyY);           // front-lower
      const bFU = at(-0.42, bodyY + 0.22);    // front bumper top
      const hoodF = at(-0.35, bodyY + 0.35);  // hood front
      const hoodR = at(-0.08, bodyY + 0.35);  // hood rear / cab front
      const cabTF = at(-0.08, bodyY + 0.65);  // cab roof front
      const cabTR = at(0.15, bodyY + 0.65);   // cab roof rear
      const bedTF = at(0.15, bodyY + 0.35);   // bed front (below cab)
      const bedTR = at(0.45, bodyY + 0.35);   // bed rear top
      const bRL = at(0.45, bodyY);            // rear lower

      // Fill body
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

      // ── WINDOW ──
      const wBL = at(-0.05, bodyY + 0.38);
      const wTL = at(-0.05, bodyY + 0.60);
      const wTR = at(0.12, bodyY + 0.60);
      const wBR = at(0.12, bodyY + 0.38);
      ctx.fillStyle = WINDOW;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(wBL.x, wBL.y);
      ctx.lineTo(wTL.x, wTL.y);
      ctx.lineTo(wTR.x, wTR.y);
      ctx.lineTo(wBR.x, wBR.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = len * 0.02;
      ctx.stroke();

      // ── FRONT BUMPER ──
      const bmpL = at(-0.48, bodyY - 0.02);
      const bmpR = at(-0.48, bodyY + 0.15);
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = len * 0.06;
      ctx.beginPath(); ctx.moveTo(bmpL.x, bmpL.y); ctx.lineTo(bmpR.x, bmpR.y); ctx.stroke();

      // ── EXHAUST PIPE ──
      const pipeB = at(0.40, bodyY + 0.20);
      const pipeT = at(0.40, bodyY + 0.70);
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = len * 0.04;
      ctx.beginPath(); ctx.moveTo(pipeB.x, pipeB.y); ctx.lineTo(pipeT.x, pipeT.y); ctx.stroke();
      // Pipe cap
      ctx.lineWidth = len * 0.06;
      const capL = at(0.38, bodyY + 0.70);
      const capR = at(0.42, bodyY + 0.70);
      ctx.beginPath(); ctx.moveTo(capL.x, capL.y); ctx.lineTo(capR.x, capR.y); ctx.stroke();

      // ── WHEEL ARCHES ──
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = len * 0.04;
      // Wheel visual centers (offset up from contact point by wheel radius)
      const wfx = p[WF].x + ux * wheelR, wfy = p[WF].y + uy * wheelR;
      const wrx = p[WR].x + ux * wheelR, wry = p[WR].y + uy * wheelR;

      // Front arch
      this.drawArch(ctx, wfx, wfy, wheelR + len * 0.04, fx, fy);
      // Rear arch
      this.drawArch(ctx, wrx, wry, wheelR + len * 0.04, fx, fy);
    }

    // ── WHEELS (drawn at visual center, offset up from contact point) ──
    const wfx = p[WF].x + ux * wheelR, wfy = p[WF].y + uy * wheelR;
    const wrx = p[WR].x + ux * wheelR, wry = p[WR].y + uy * wheelR;
    this.drawWheel(ctx, wfx, wfy, wheelR, this.wheelAngle);
    this.drawWheel(ctx, wrx, wry, wheelR, this.wheelAngle);

    // ── DRIVER ──
    if (rider.points.length > DH) {
      this.drawDriver(ctx, p, len);
    }
  }

  private drawArch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fx: number, fy: number) {
    const angle = Math.atan2(fy, fx);
    // Draw the upper half of the circle (fender above wheel)
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
    const treads = 14;
    for (let i = 0; i < treads; i++) {
      const a = rot + (i * Math.PI * 2 / treads);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }

    // Inner rim
    ctx.fillStyle = RIM_COLOR;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spokes
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
    const seat = p[DS];
    const head = p[DH];
    const dx = head.x - seat.x, dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;

    // Body line
    ctx.strokeStyle = BODY_DARK;
    ctx.lineWidth = frameLen * 0.1;
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    // Helmet
    const hx = head.x + nx * frameLen * 0.15;
    const hy = head.y + ny * frameLen * 0.15;
    const hr = frameLen * 0.14;

    ctx.fillStyle = BODY_DARK;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = frameLen * 0.03;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Visor
    const px = -ny, py = nx; // perpendicular
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
      ctx.fillStyle = EXHAUST_CLR;
      ctx.globalAlpha = (1 - t) * 0.18;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, 0.6 + t * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
