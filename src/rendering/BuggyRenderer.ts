import { RiderRenderData } from './RiderRenderer';

const REAR_WHEEL = 0;
const FRONT_WHEEL = 1;
const REAR_CAGE = 2;
const FRONT_CAGE = 3;
const DRIVER_SEAT = 4;
const DRIVER_HEAD = 5;
const WHIP_START = 6;

const FRAME = '#22313a';
const FRAME_HI = '#395260';
const BODY = '#d86c2c';
const BODY_DARK = '#aa4e1f';
const SHOCK = '#d9e1e7';
const SHOCK_DARK = '#6d7d86';
const TIRE = '#1b1b1d';
const RIM = '#5b6871';
const FLAG = '#f4c542';
const FLAG_DARK = '#b07f17';
const HELMET = '#f7f7f7';
const VISOR = '#7fb7d8';
const SKIN = '#fdca8d';

export class BuggyRenderer {
  private wheelAngle = 0;
  private prevRearWheelX: number | null = null;

  reset() {
    this.wheelAngle = 0;
    this.prevRearWheelX = null;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    const wx = p[FRONT_WHEEL].x - p[REAR_WHEEL].x;
    const wy = p[FRONT_WHEEL].y - p[REAR_WHEEL].y;
    const wheelBase = Math.sqrt(wx * wx + wy * wy) || 1;
    const wheelFx = wx / wheelBase;
    const wheelFy = wy / wheelBase;
    const wheelUx = wheelFy;
    const wheelUy = -wheelFx;

    const bx = p[FRONT_CAGE].x - p[REAR_CAGE].x;
    const by = p[FRONT_CAGE].y - p[REAR_CAGE].y;
    const bodyLen = Math.sqrt(bx * bx + by * by) || 1;
    const bodyFx = bx / bodyLen;
    const bodyFy = by / bodyLen;
    const bodyUx = bodyFy;
    const bodyUy = -bodyFx;

    const wheelR = wheelBase * 0.14;
    const rearCenter = {
      x: p[REAR_WHEEL].x + wheelUx * wheelR,
      y: p[REAR_WHEEL].y + wheelUy * wheelR,
    };
    const frontCenter = {
      x: p[FRONT_WHEEL].x + wheelUx * wheelR,
      y: p[FRONT_WHEEL].y + wheelUy * wheelR,
    };

    if (this.prevRearWheelX === null) this.prevRearWheelX = p[REAR_WHEEL].x;
    const dx = p[REAR_WHEEL].x - this.prevRearWheelX;
    this.prevRearWheelX = p[REAR_WHEEL].x;
    if (wheelR > 0.1) this.wheelAngle += dx / wheelR;

    this.drawWhip(ctx, p);
    this.drawSuspension(ctx, p[REAR_CAGE], rearCenter, p[FRONT_CAGE], frontCenter, wheelR);
    this.drawWheels(ctx, rearCenter, frontCenter, wheelR);
    this.drawFrame(ctx, p, bodyFx, bodyFy, bodyUx, bodyUy, wheelR, rider.sledIntact);
    this.drawDriver(ctx, p, bodyFx, bodyFy, bodyUx, bodyUy, rider.mounted);
  }

  private drawSuspension(
    ctx: CanvasRenderingContext2D,
    rearCage: { x: number; y: number },
    rearWheel: { x: number; y: number },
    frontCage: { x: number; y: number },
    frontWheel: { x: number; y: number },
    wheelR: number,
  ) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = SHOCK_DARK;
    ctx.lineWidth = Math.max(0.7, wheelR * 0.12);
    ctx.beginPath();
    ctx.moveTo(rearCage.x, rearCage.y);
    ctx.lineTo(rearWheel.x, rearWheel.y);
    ctx.moveTo(frontCage.x, frontCage.y);
    ctx.lineTo(frontWheel.x, frontWheel.y);
    ctx.stroke();

    this.drawCoil(ctx, rearCage, rearWheel, wheelR * 0.22);
    this.drawCoil(ctx, frontCage, frontWheel, wheelR * 0.22);
  }

  private drawCoil(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
    amp: number,
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = dx / len;
    const fy = dy / len;
    const px = -fy;
    const py = fx;

    ctx.strokeStyle = SHOCK;
    ctx.lineWidth = Math.max(0.5, amp * 0.28);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const wave = i === 0 || i === 6 ? 0 : (i % 2 === 0 ? -amp : amp);
      const x = a.x + dx * t + px * wave;
      const y = a.y + dy * t + py * wave;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawWheels(
    ctx: CanvasRenderingContext2D,
    rearCenter: { x: number; y: number },
    frontCenter: { x: number; y: number },
    wheelR: number,
  ) {
    this.drawWheel(ctx, rearCenter.x, rearCenter.y, wheelR);
    this.drawWheel(ctx, frontCenter.x, frontCenter.y, wheelR);
  }

  private drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = TIRE;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(0.7, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#2d2d30';
    ctx.lineWidth = Math.max(0.3, r * 0.05);
    for (let i = 0; i < 12; i++) {
      const a = this.wheelAngle + (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }

    ctx.fillStyle = RIM;
    ctx.strokeStyle = '#424d55';
    ctx.lineWidth = Math.max(0.35, r * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#cad2d8';
    ctx.lineWidth = Math.max(0.25, r * 0.06);
    for (let i = 0; i < 5; i++) {
      const a = this.wheelAngle + (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42);
      ctx.stroke();
    }
  }

  private drawFrame(
    ctx: CanvasRenderingContext2D,
    p: Array<{ x: number; y: number }>,
    fx: number,
    fy: number,
    ux: number,
    uy: number,
    wheelR: number,
    intact: boolean,
  ) {
    const rearTop = {
      x: p[REAR_CAGE].x - fx * wheelR * 0.5 + ux * wheelR * 0.45,
      y: p[REAR_CAGE].y - fy * wheelR * 0.5 + uy * wheelR * 0.45,
    };
    const frontTop = {
      x: p[FRONT_CAGE].x + fx * wheelR * 0.7 + ux * wheelR * 0.55,
      y: p[FRONT_CAGE].y + fy * wheelR * 0.7 + uy * wheelR * 0.55,
    };
    const nose = {
      x: p[FRONT_CAGE].x + fx * wheelR * 1.35 + ux * wheelR * 0.05,
      y: p[FRONT_CAGE].y + fy * wheelR * 1.35 + uy * wheelR * 0.05,
    };
    const floor = {
      x: p[REAR_CAGE].x + fx * wheelR * 2.2 - ux * wheelR * 0.7,
      y: p[REAR_CAGE].y + fy * wheelR * 2.2 - uy * wheelR * 0.7,
    };
    const tail = {
      x: p[REAR_CAGE].x - fx * wheelR * 1.0 - ux * wheelR * 0.2,
      y: p[REAR_CAGE].y - fy * wheelR * 1.0 - uy * wheelR * 0.2,
    };

    ctx.globalAlpha = intact ? 1 : 0.45;
    ctx.fillStyle = BODY;
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = Math.max(0.8, wheelR * 0.16);
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(rearTop.x, rearTop.y);
    ctx.lineTo(frontTop.x, frontTop.y);
    ctx.lineTo(nose.x, nose.y);
    ctx.lineTo(floor.x, floor.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = FRAME_HI;
    ctx.lineWidth = Math.max(0.45, wheelR * 0.08);
    ctx.beginPath();
    ctx.moveTo(p[REAR_CAGE].x, p[REAR_CAGE].y);
    ctx.lineTo(p[FRONT_CAGE].x, p[FRONT_CAGE].y);
    ctx.lineTo(p[DRIVER_SEAT].x, p[DRIVER_SEAT].y);
    ctx.closePath();
    ctx.moveTo(p[REAR_CAGE].x, p[REAR_CAGE].y);
    ctx.lineTo(p[DRIVER_HEAD].x, p[DRIVER_HEAD].y);
    ctx.lineTo(p[FRONT_CAGE].x, p[FRONT_CAGE].y);
    ctx.stroke();

    const spoilerA = {
      x: rearTop.x - fx * wheelR * 0.15 + ux * wheelR * 0.95,
      y: rearTop.y - fy * wheelR * 0.15 + uy * wheelR * 0.95,
    };
    const spoilerB = {
      x: rearTop.x - fx * wheelR * 1.0 + ux * wheelR * 0.8,
      y: rearTop.y - fy * wheelR * 1.0 + uy * wheelR * 0.8,
    };
    ctx.strokeStyle = BODY_DARK;
    ctx.lineWidth = Math.max(0.45, wheelR * 0.12);
    ctx.beginPath();
    ctx.moveTo(rearTop.x, rearTop.y);
    ctx.lineTo(spoilerA.x, spoilerA.y);
    ctx.lineTo(spoilerB.x, spoilerB.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawDriver(
    ctx: CanvasRenderingContext2D,
    p: Array<{ x: number; y: number }>,
    fx: number,
    fy: number,
    ux: number,
    uy: number,
    mounted: boolean,
  ) {
    const seat = p[DRIVER_SEAT];
    const head = p[DRIVER_HEAD];
    const dx = head.x - seat.x;
    const dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const px = -ny;
    const py = nx;
    const facing = mounted ? { x: fx, y: fy } : { x: px, y: py };
    const radius = Math.max(1.3, len * 0.23);

    ctx.strokeStyle = '#1f2124';
    ctx.lineWidth = Math.max(0.9, radius * 0.45);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    const hx = head.x + nx * radius * 0.8;
    const hy = head.y + ny * radius * 0.8;

    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(hx, hy, radius * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = HELMET;
    ctx.strokeStyle = '#cfd6db';
    ctx.lineWidth = Math.max(0.35, radius * 0.16);
    ctx.beginPath();
    ctx.arc(hx, hy, radius, Math.atan2(uy, ux) + Math.PI * 0.85, Math.atan2(uy, ux) - Math.PI * 0.1, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = VISOR;
    ctx.beginPath();
    ctx.ellipse(
      hx + facing.x * radius * 0.35,
      hy + facing.y * radius * 0.1,
      radius * 0.5,
      radius * 0.28,
      Math.atan2(facing.y, facing.x),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  private drawWhip(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>) {
    if (p.length <= WHIP_START) return;
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(p[REAR_CAGE].x, p[REAR_CAGE].y);
    for (let i = WHIP_START; i < p.length; i++) {
      ctx.lineTo(p[i].x, p[i].y);
    }
    ctx.stroke();

    const tip = p[p.length - 1];
    const prev = p[p.length - 2] ?? p[REAR_CAGE];
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = dx / len;
    const fy = dy / len;
    const px = -fy;
    const py = fx;
    const size = 2.8;

    ctx.fillStyle = FLAG;
    ctx.strokeStyle = FLAG_DARK;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - fx * size + px * size * 0.7, tip.y - fy * size + py * size * 0.7);
    ctx.lineTo(tip.x - fx * size * 0.8 - px * size * 0.4, tip.y - fy * size * 0.8 - py * size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
