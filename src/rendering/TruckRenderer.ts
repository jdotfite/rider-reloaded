import { RiderRenderData } from './RiderRenderer';

/**
 * Monster truck renderer — matches the reference: big wheels, lifted body,
 * cab with window, fenders, exhaust pipe, driver helmet.
 */

// Point indices matching truck.ts
const WF = 0, WR = 1, CF = 2, CR = 3;
const DS = 4, DH = 5;
const EXHAUST_START = 6;

// Colors
const BODY = '#2a2a2a';
const BODY_LIGHT = '#3a3a3a';
const OUTLINE = '#111111';
const TIRE = '#222222';
const RIM = '#444444';
const RIM_LIGHT = '#666666';
const WINDOW = '#8ec8e8';
const DRIVER_C = '#111111';
const EXHAUST_C = '#555555';

const WHEEL_R = 4.2;

export class TruckRenderer {
  private wheelAngle = 0;

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Exhaust smoke (behind everything)
    if (rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    // Compute frame vectors
    const bottomDx = p[WR].x - p[WF].x;
    const bottomDy = p[WR].y - p[WF].y;
    const bottomLen = Math.sqrt(bottomDx * bottomDx + bottomDy * bottomDy) || 1;

    // Wheel rotation from velocity
    const avgVx = (p[WF].x - p[CF].x + p[WR].x - p[CR].x) * 0.5;
    this.wheelAngle += avgVx * 0.3;

    if (rider.sledIntact) {
      this.drawTruck(ctx, p);
    }

    // Wheels always drawn (even if chassis breaks they roll away)
    this.drawWheel(ctx, p[WF].x, p[WF].y, this.wheelAngle);
    this.drawWheel(ctx, p[WR].x, p[WR].y, this.wheelAngle);

    // Driver
    if (rider.mounted || rider.points.length > DH) {
      this.drawDriver(ctx, p, rider.mounted);
    }
  }

  private drawTruck(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    // Calculate chassis orientation from the 4 frame points
    const midBottom = this.mid(p[WF], p[WR]);
    const midTop = this.mid(p[CF], p[CR]);

    // Frame direction vectors
    const fwd = this.dir(p[WF], p[WR]);  // forward along bottom
    const up = this.dir(midBottom, midTop); // up from bottom to top
    const fwdPerp = { x: -fwd.y, y: fwd.x }; // perpendicular to forward

    // Scale factor from physics space
    const frameW = this.dist(p[WF], p[WR]);
    const frameH = this.dist(midBottom, midTop);
    const scale = frameW / 15; // reference width

    // Helper: offset from a point along frame axes
    const at = (base: {x:number;y:number}, fwdAmt: number, upAmt: number) => ({
      x: base.x + fwd.x * fwdAmt + up.x * upAmt,
      y: base.y + fwd.y * fwdAmt + up.y * upAmt,
    });

    // -- SUSPENSION STRUTS --
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 1.8 * scale;
    // Front strut
    const fAxleTop = at(p[WF], 0, -2.5 * scale);
    ctx.beginPath();
    ctx.moveTo(p[WF].x, p[WF].y);
    ctx.lineTo(fAxleTop.x, fAxleTop.y);
    ctx.stroke();
    // Rear strut
    const rAxleTop = at(p[WR], 0, -2.5 * scale);
    ctx.beginPath();
    ctx.moveTo(p[WR].x, p[WR].y);
    ctx.lineTo(rAxleTop.x, rAxleTop.y);
    ctx.stroke();

    // -- UNDERCARRIAGE / FRAME RAIL --
    const railF = at(p[WF], 1 * scale, -2.5 * scale);
    const railR = at(p[WR], -1 * scale, -2.5 * scale);
    ctx.strokeStyle = BODY_LIGHT;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(railF.x, railF.y);
    ctx.lineTo(railR.x, railR.y);
    ctx.stroke();

    // -- MAIN BODY (filled polygon) --
    // Body sits above the frame rail
    const bodyBL = at(p[WF], -1.5 * scale, -3 * scale);   // front-bottom of body
    const bodyBR = at(p[WR], 1.5 * scale, -3 * scale);    // rear-bottom (bed end)
    const bodyTR = at(p[WR], 1.5 * scale, -6 * scale);    // rear-top (bed rail)
    const cabTop = at(p[WF], 3 * scale, -8 * scale);      // cab roof front
    const cabTopR = at(p[WF], 8 * scale, -8 * scale);     // cab roof rear
    const bedStart = at(p[WF], 8 * scale, -6 * scale);    // where bed starts (below cab rear)
    const hoodFront = at(p[WF], -1.5 * scale, -5 * scale);// hood front edge
    const hoodCorner = at(p[WF], 3 * scale, -5 * scale);  // hood to cab transition

    // Front bumper
    const bumperF = at(p[WF], -2.5 * scale, -3.5 * scale);
    const bumperFT = at(p[WF], -2.5 * scale, -5 * scale);

    ctx.fillStyle = BODY;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    // Bottom edge (front to rear)
    ctx.moveTo(bumperF.x, bumperF.y);
    ctx.lineTo(bodyBL.x, bodyBL.y);
    ctx.lineTo(bodyBR.x, bodyBR.y);
    // Up rear side
    ctx.lineTo(bodyTR.x, bodyTR.y);
    // Bed rail to cab transition
    ctx.lineTo(bedStart.x, bedStart.y);
    // Cab roof
    ctx.lineTo(cabTopR.x, cabTopR.y);
    ctx.lineTo(cabTop.x, cabTop.y);
    // Hood slope down
    ctx.lineTo(hoodCorner.x, hoodCorner.y);
    ctx.lineTo(hoodFront.x, hoodFront.y);
    // Front face
    ctx.lineTo(bumperFT.x, bumperFT.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // -- FRONT FENDER (wheel arch) --
    const fenderFC = at(p[WF], 0, -3 * scale);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    const fenderR = WHEEL_R + 1.5 * scale;
    const fAng = Math.atan2(fwd.y, fwd.x);
    ctx.arc(fenderFC.x, fenderFC.y + 1 * scale, fenderR, fAng + Math.PI, fAng, true);
    ctx.stroke();

    // -- REAR FENDER (wheel arch) --
    const fenderRC = at(p[WR], 0, -3 * scale);
    ctx.beginPath();
    ctx.arc(fenderRC.x, fenderRC.y + 1 * scale, fenderR, fAng + Math.PI, fAng, true);
    ctx.stroke();

    // -- WINDOW --
    const winBL = at(p[WF], 3.5 * scale, -5.5 * scale);
    const winBR = at(p[WF], 7.5 * scale, -5.5 * scale);
    const winTR = at(p[WF], 7.5 * scale, -7.5 * scale);
    const winTL = at(p[WF], 3.5 * scale, -7.5 * scale);

    ctx.fillStyle = WINDOW;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(winBL.x, winBL.y);
    ctx.lineTo(winBR.x, winBR.y);
    ctx.lineTo(winTR.x, winTR.y);
    ctx.lineTo(winTL.x, winTL.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Window frame
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();

    // -- EXHAUST PIPE (vertical from rear) --
    const pipeBase = at(p[WR], 0.5 * scale, -5 * scale);
    const pipeTop = at(p[WR], 0.5 * scale, -8.5 * scale);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(pipeBase.x, pipeBase.y);
    ctx.lineTo(pipeTop.x, pipeTop.y);
    ctx.stroke();
    // Pipe cap
    ctx.strokeStyle = RIM_LIGHT;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(pipeTop.x - fwd.x * 0.8 * scale, pipeTop.y - fwd.y * 0.8 * scale);
    ctx.lineTo(pipeTop.x + fwd.x * 0.8 * scale, pipeTop.y + fwd.y * 0.8 * scale);
    ctx.stroke();
  }

  private drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number) {
    const r = WHEEL_R;

    // Outer tire
    ctx.fillStyle = TIRE;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tire tread marks (small bumps around the perimeter)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 16; i++) {
      const a = rotation + (i * Math.PI * 2 / 16);
      const ix = x + Math.cos(a) * r * 0.82;
      const iy = y + Math.sin(a) * r * 0.82;
      const ox = x + Math.cos(a) * r * 0.98;
      const oy = y + Math.sin(a) * r * 0.98;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }

    // Rim (inner circle)
    ctx.fillStyle = RIM;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rim detail — 5 spokes
    ctx.strokeStyle = RIM_LIGHT;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = rotation + (i * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15);
      ctx.lineTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42);
      ctx.stroke();
    }

    // Hub center
    ctx.fillStyle = RIM_LIGHT;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, mounted: boolean) {
    const seat = p[DS];
    const head = p[DH];

    const dx = head.x - seat.x;
    const dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;

    // Body
    ctx.strokeStyle = DRIVER_C;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    // Head (helmet)
    const hx = head.x + nx * 3;
    const hy = head.y + ny * 3;

    ctx.fillStyle = BODY;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Visor
    const perpX = -ny;
    const perpY = nx;
    ctx.fillStyle = WINDOW;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(hx + perpX * 1.2, hy + perpY * 1.2, 1.8, 0, Math.PI * 2);
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
      ctx.fillStyle = EXHAUST_C;
      ctx.globalAlpha = (1 - t) * 0.2;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, 0.8 + t * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Helpers
  private mid(a: {x:number;y:number}, b: {x:number;y:number}) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  private dist(a: {x:number;y:number}, b: {x:number;y:number}) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  private dir(a: {x:number;y:number}, b: {x:number;y:number}) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }
}
