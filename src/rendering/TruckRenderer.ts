import { RiderRenderData } from './RiderRenderer';

/**
 * Monster truck renderer — draws a mini truck with rotating wheels,
 * driver, and exhaust trail using the physics point positions.
 */

// Point indices matching truck.ts
const CFL = 0, CBL = 1, CBR = 2, CFR = 3;
const WF = 4, WR = 5;
const DS = 6, DH = 7;
const EXHAUST_START = 8;

// Truck colors
const BODY_COLOR = '#2a2a2a';
const BODY_HIGHLIGHT = '#3d3d3d';
const WHEEL_COLOR = '#1a1a1a';
const TIRE_COLOR = '#333333';
const AXLE_COLOR = '#555555';
const WINDOW_COLOR = '#8ec8e8';
const DRIVER_COLOR = '#111111';
const EXHAUST_COLOR = '#666666';

const WHEEL_RADIUS = 3.2;

export class TruckRenderer {
  private wheelRotation = 0;

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 8) return;
    const p = rider.points;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Exhaust trail (behind everything)
    if (rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    // Calculate chassis angle from bottom edge
    const chassisDx = p[CBR].x - p[CFR].x;
    const chassisDy = p[CBR].y - p[CFR].y;
    const chassisAngle = Math.atan2(chassisDy, chassisDx);

    // Update wheel rotation based on horizontal wheel velocity
    const wheelVelX = ((p[WF].x - p[WR].x) !== 0)
      ? (p[WF].x + p[WR].x) / 2
      : 0;
    // Approximate rotation from average wheel position change
    // Use chassis bottom center for a simple velocity estimate
    const cx = (p[CFR].x + p[CBR].x) / 2;
    const prevCx = cx; // We don't have prev, so use velocity from point spacing
    const groundSpeed = ((p[WF].x - p[CFR].x) + (p[WR].x - p[CBR].x)) * 0.15;
    this.wheelRotation += groundSpeed;

    if (rider.sledIntact) {
      // Draw suspension lines
      this.drawSuspension(ctx, p);

      // Draw chassis body
      this.drawChassis(ctx, p, chassisAngle);

      // Draw wheels
      this.drawWheel(ctx, p[WF].x, p[WF].y, this.wheelRotation);
      this.drawWheel(ctx, p[WR].x, p[WR].y, this.wheelRotation);
    }

    if (rider.mounted) {
      this.drawDriver(ctx, p);
    } else {
      // Dismounted driver — draw separately
      this.drawDriverDismounted(ctx, p);
    }
  }

  private drawChassis(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, angle: number) {
    // Main body — filled quad from chassis points
    ctx.fillStyle = BODY_COLOR;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(p[CFL].x, p[CFL].y);
    ctx.lineTo(p[CBL].x, p[CBL].y);
    ctx.lineTo(p[CBR].x, p[CBR].y);
    ctx.lineTo(p[CFR].x, p[CFR].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cab / windshield area — smaller raised section
    const cabFront = this.lerp2(p[CFL], p[CFR], 0.25);
    const cabBack = this.lerp2(p[CBL], p[CBR], 0.25);
    const cabMidF = this.lerp2(p[CFL], p[CBL], 0.35);
    const cabMidB = this.lerp2(p[CFL], p[CBL], 0.7);

    // Window
    const winBL = this.lerp2(cabMidF, this.lerp2(p[CFR], p[CBR], 0.25), 0.2);
    const winBR = this.lerp2(cabMidB, this.lerp2(p[CFR], p[CBR], 0.25), 0.2);
    const winTL = this.lerp2(p[CFL], p[CBL], 0.35);
    const winTR = this.lerp2(p[CFL], p[CBL], 0.7);

    ctx.fillStyle = WINDOW_COLOR;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(winTL.x, winTL.y);
    ctx.lineTo(winTR.x, winTR.y);
    ctx.lineTo(winBR.x, winBR.y);
    ctx.lineTo(winBL.x, winBL.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Top highlight stripe
    ctx.strokeStyle = BODY_HIGHLIGHT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const hlL = this.lerp2(p[CFL], p[CFR], 0.15);
    const hlR = this.lerp2(p[CBL], p[CBR], 0.15);
    ctx.moveTo(hlL.x, hlL.y);
    ctx.lineTo(hlR.x, hlR.y);
    ctx.stroke();
  }

  private drawSuspension(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    ctx.strokeStyle = AXLE_COLOR;
    ctx.lineWidth = 1.2;
    // Front axle
    const frontAxle = this.lerp2(p[CFR], p[CFL], 0.5);
    ctx.beginPath();
    ctx.moveTo(frontAxle.x, frontAxle.y);
    ctx.lineTo(p[WF].x, p[WF].y);
    ctx.stroke();
    // Rear axle
    const rearAxle = this.lerp2(p[CBR], p[CBL], 0.5);
    ctx.beginPath();
    ctx.moveTo(rearAxle.x, rearAxle.y);
    ctx.lineTo(p[WR].x, p[WR].y);
    ctx.stroke();
  }

  private drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number) {
    const r = WHEEL_RADIUS;

    // Tire (outer)
    ctx.fillStyle = TIRE_COLOR;
    ctx.strokeStyle = WHEEL_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hub
    ctx.fillStyle = AXLE_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Spokes (rotate with wheel)
    ctx.strokeStyle = AXLE_COLOR;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const angle = rotation + (i * Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * r * 0.35, y + Math.sin(angle) * r * 0.35);
      ctx.lineTo(x + Math.cos(angle) * r * 0.85, y + Math.sin(angle) * r * 0.85);
      ctx.stroke();
    }

    // Center dot
    ctx.fillStyle = WHEEL_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    const seat = p[DS];
    const head = p[DH];

    // Body line
    ctx.strokeStyle = DRIVER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    // Head
    const dx = head.x - seat.x;
    const dy = head.y - seat.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;
    const hx = head.x + nx * 2.5;
    const hy = head.y + ny * 2.5;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = DRIVER_COLOR;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(hx, hy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet visor
    ctx.fillStyle = WINDOW_COLOR;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(hx + nx * 0.5, hy + ny * 0.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawDriverDismounted(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    if (p.length <= DH) return;
    this.drawDriver(ctx, p);
  }

  private drawExhaust(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, totalPoints: number) {
    const exhaustCount = totalPoints - EXHAUST_START;
    if (exhaustCount < 2) return;

    const pts: Array<{x: number; y: number}> = [];
    for (let i = 0; i < exhaustCount; i++) {
      const idx = EXHAUST_START + i;
      if (idx >= totalPoints) break;
      pts.push(p[idx]);
    }
    if (pts.length < 2) return;

    // Draw smoke puffs along exhaust trail
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      const alpha = (1 - t) * 0.25;
      const radius = 1 + t * 2.5;
      ctx.fillStyle = EXHAUST_COLOR;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private lerp2(a: {x: number; y: number}, b: {x: number; y: number}, t: number): {x: number; y: number} {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
}
