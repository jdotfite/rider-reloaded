import { RiderRenderData } from './RiderRenderer';

/**
 * Monster truck renderer — procedural canvas drawing.
 *
 * ORIENTATION: The truck moves RIGHT (positive x).
 *   - forward vector (fx,fy) points from WF→WR = left to right = direction of travel
 *   - at(+fwd) = FRONT of truck (hood, bumper, headlights)
 *   - at(-fwd) = BACK of truck (bed, exhaust, tailgate)
 *   - at(+up) = ABOVE wheels (body, cab, roof)
 *
 * Physics points:
 *   0: CF (top-left=back-top)  1: WF (bottom-left=back-bottom)
 *   2: WR (bottom-right=front-bottom)  3: CR (top-right=front-top)
 *   4: DRIVER_SEAT  5: DRIVER_HEAD  6+: exhaust flutter
 */

const CF = 0, WF = 1, WR = 2, CR = 3;
const DS = 4, DH = 5;
const EXHAUST_START = 6;

// Palette
const BODY = '#2d2d2d';
const BODY_ACCENT = '#383838';
const OUTLINE = '#1a1a1a';
const WINDOW = '#7ab8d8';
const WINDOW_FRAME = '#222';
const BUMPER = '#444';
const HEADLIGHT = '#f0e060';
const TAILLIGHT = '#cc3333';
const TIRE = '#1e1e1e';
const TIRE_EDGE = '#141414';
const RIM = '#484848';
const RIM_SPOKE = '#5e5e5e';
const RIM_HUB = '#6a6a6a';
const AXLE = '#555';
const SKIN = '#fdca8d';
const HELMET = '#2a2a2a';
const VISOR = '#8ec8e8';

// Debris piece types for realistic explosion
interface DebrisPiece {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  type: 'panel' | 'wheel' | 'glass' | 'pipe' | 'bolt';
  w: number; h: number;
  color: string;
  stroke: string;
  life: number;
}

export class TruckRenderer {
  private wheelAngle = 0;
  private prevWFx = 0;
  private debris: DebrisPiece[] = [];
  private wasSledIntact = true;

  resetDebris() {
    this.debris = [];
    this.wasSledIntact = true;
    this.prevWFx = 0;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    // Detect crash
    if (this.wasSledIntact && !rider.sledIntact) {
      this.spawnDebris(p);
    }
    this.wasSledIntact = rider.sledIntact;

    // Frame vectors
    const dx = p[WR].x - p[WF].x;
    const dy = p[WR].y - p[WF].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = dx / len, fy = dy / len;        // forward (rightward = front)
    const ux = fy, uy = -fx;                    // up (away from ground)

    // Wheel spin from velocity
    const wheelR = len * 0.23;
    const ws = p[WF].x - this.prevWFx;
    this.prevWFx = p[WF].x;
    if (wheelR > 0.1) this.wheelAngle += ws / wheelR;

    // Midpoint and position helper
    const mx = (p[WF].x + p[WR].x) / 2;
    const my = (p[WF].y + p[WR].y) / 2;
    const at = (f: number, u: number) => ({
      x: mx + fx * f * len + ux * u * len,
      y: my + fy * f * len + uy * u * len,
    });

    // Wheel visual centers
    const wfVis = { x: p[WF].x + ux * wheelR, y: p[WF].y + uy * wheelR };
    const wrVis = { x: p[WR].x + ux * wheelR, y: p[WR].y + uy * wheelR };

    // Exhaust (behind)
    if (rider.sledIntact && rider.points.length > EXHAUST_START + 1) {
      this.drawExhaust(ctx, p, rider.points.length);
    }

    if (rider.sledIntact) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const lw = len * 0.035; // base line width

      // -- AXLES / SUSPENSION --
      const wo = wheelR / len;
      ctx.strokeStyle = AXLE;
      ctx.lineWidth = lw * 1.8;
      // Front-right axle (front of truck)
      let a1 = at(0.38, wo); let a2 = at(0.38, 0.28);
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
      // Rear-left axle (back of truck)
      a1 = at(-0.38, wo); a2 = at(-0.38, 0.28);
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();

      // Frame rail
      ctx.strokeStyle = BODY_ACCENT;
      ctx.lineWidth = lw * 2;
      const rL = at(-0.44, 0.24); const rR = at(0.48, 0.24);
      ctx.beginPath(); ctx.moveTo(rL.x, rL.y); ctx.lineTo(rR.x, rR.y); ctx.stroke();

      // -- BODY --
      const b = 0.30; // body bottom offset
      // Points going clockwise from front-bottom
      const pts = [
        at(0.48, b),              // front-lower (bumper base)
        at(0.48, b + 0.22),       // front upper (bumper top)
        at(0.42, b + 0.38),       // hood front edge
        at(0.15, b + 0.38),       // hood rear / windshield base
        at(0.12, b + 0.68),       // cab roof front
        at(-0.10, b + 0.68),      // cab roof rear
        at(-0.10, b + 0.38),      // bed front (below cab back)
        at(-0.44, b + 0.38),      // bed rear top (tailgate top)
        at(-0.44, b),             // bed rear bottom
      ];

      ctx.fillStyle = BODY;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Hood accent line
      ctx.strokeStyle = BODY_ACCENT;
      ctx.lineWidth = lw;
      const hlA = at(0.42, b + 0.32); const hlB = at(0.16, b + 0.32);
      ctx.beginPath(); ctx.moveTo(hlA.x, hlA.y); ctx.lineTo(hlB.x, hlB.y); ctx.stroke();

      // Bed floor line
      ctx.strokeStyle = BODY_ACCENT;
      const blA = at(-0.10, b + 0.10); const blB = at(-0.42, b + 0.10);
      ctx.beginPath(); ctx.moveTo(blA.x, blA.y); ctx.lineTo(blB.x, blB.y); ctx.stroke();

      // -- WINDOW --
      const win = [
        at(0.14, b + 0.40),
        at(0.12, b + 0.64),
        at(-0.08, b + 0.64),
        at(-0.08, b + 0.40),
      ];
      ctx.fillStyle = WINDOW;
      ctx.strokeStyle = WINDOW_FRAME;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(win[0].x, win[0].y);
      for (let i = 1; i < win.length; i++) ctx.lineTo(win[i].x, win[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Window divider
      const wdA = at(0.03, b + 0.40); const wdB = at(0.03, b + 0.64);
      ctx.strokeStyle = WINDOW_FRAME;
      ctx.lineWidth = lw * 0.5;
      ctx.beginPath(); ctx.moveTo(wdA.x, wdA.y); ctx.lineTo(wdB.x, wdB.y); ctx.stroke();

      // -- HEADLIGHT --
      const hlP = at(0.47, b + 0.16);
      ctx.fillStyle = HEADLIGHT;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(hlP.x, hlP.y, len * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // -- TAILLIGHT --
      const tlP = at(-0.43, b + 0.30);
      ctx.fillStyle = TAILLIGHT;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(tlP.x, tlP.y, len * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // -- FRONT BUMPER --
      const bmpA = at(0.50, b - 0.02); const bmpB = at(0.50, b + 0.18);
      ctx.strokeStyle = BUMPER;
      ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.moveTo(bmpA.x, bmpA.y); ctx.lineTo(bmpB.x, bmpB.y); ctx.stroke();

      // -- EXHAUST PIPE (back of truck) --
      const epA = at(-0.40, b + 0.22); const epB = at(-0.40, b + 0.72);
      ctx.strokeStyle = AXLE;
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath(); ctx.moveTo(epA.x, epA.y); ctx.lineTo(epB.x, epB.y); ctx.stroke();
      // Pipe cap
      const ecA = at(-0.42, b + 0.72); const ecB = at(-0.38, b + 0.72);
      ctx.lineWidth = lw * 1.8;
      ctx.beginPath(); ctx.moveTo(ecA.x, ecA.y); ctx.lineTo(ecB.x, ecB.y); ctx.stroke();

      // -- WHEEL ARCHES --
      ctx.strokeStyle = BODY;
      ctx.lineWidth = lw * 1.8;
      this.drawArch(ctx, wrVis.x, wrVis.y, wheelR + len * 0.035, fx, fy);
      this.drawArch(ctx, wfVis.x, wfVis.y, wheelR + len * 0.035, fx, fy);
      // Arch outlines
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw * 0.8;
      this.drawArch(ctx, wrVis.x, wrVis.y, wheelR + len * 0.05, fx, fy);
      this.drawArch(ctx, wfVis.x, wfVis.y, wheelR + len * 0.05, fx, fy);
    }

    // Wheels
    this.drawWheel(ctx, wrVis.x, wrVis.y, wheelR, this.wheelAngle);
    this.drawWheel(ctx, wfVis.x, wfVis.y, wheelR, this.wheelAngle);

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
    ctx.fillStyle = TIRE;
    ctx.strokeStyle = TIRE_EDGE;
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tread blocks
    ctx.fillStyle = '#2a2a2a';
    for (let i = 0; i < 16; i++) {
      const a = rot + (i * Math.PI * 2 / 16);
      const cos = Math.cos(a), sin = Math.sin(a);
      ctx.fillRect(
        x + cos * r * 0.82 - r * 0.04,
        y + sin * r * 0.82 - r * 0.04,
        r * 0.14, r * 0.08
      );
    }

    // Sidewall ring
    ctx.strokeStyle = '#333';
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Rim
    ctx.fillStyle = RIM;
    ctx.strokeStyle = '#383838';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 5 spokes
    ctx.strokeStyle = RIM_SPOKE;
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.14, y + Math.sin(a) * r * 0.14);
      ctx.lineTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42);
      ctx.stroke();
    }

    // Hub cap
    ctx.fillStyle = RIM_HUB;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = r * 0.03;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hub dot
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>, frameLen: number) {
    const seat = p[DS], head = p[DH];
    const ddx = head.x - seat.x, ddy = head.y - seat.y;
    const dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    const nx = ddx / dl, ny = ddy / dl;
    const px = -ny, py = nx; // perpendicular (facing direction)

    // Body
    ctx.strokeStyle = HELMET;
    ctx.lineWidth = frameLen * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(seat.x, seat.y); ctx.lineTo(head.x, head.y); ctx.stroke();

    // Head
    const hx = head.x + nx * frameLen * 0.14;
    const hy = head.y + ny * frameLen * 0.14;
    const hr = frameLen * 0.13;

    // Skin
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = '#c4a070';
    ctx.lineWidth = hr * 0.1;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet shell (top half)
    ctx.fillStyle = HELMET;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = hr * 0.12;
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 1.05, Math.atan2(py, px) - Math.PI * 0.15, Math.atan2(py, px) + Math.PI * 1.15, false);
    ctx.fill();

    // Visor
    ctx.fillStyle = VISOR;
    ctx.strokeStyle = '#5a9ab5';
    ctx.lineWidth = hr * 0.1;
    ctx.beginPath();
    ctx.ellipse(
      hx + px * hr * 0.3, hy + py * hr * 0.3,
      hr * 0.55, hr * 0.3,
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
      const r = 1 + t * 3.5;
      // Soft outer
      ctx.fillStyle = '#777';
      ctx.globalAlpha = (1 - t) * 0.2;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Inner
      ctx.fillStyle = '#999';
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.beginPath();
      ctx.arc(p[idx].x, p[idx].y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── EXPLOSION ──

  private spawnDebris(p: Array<{x: number; y: number}>) {
    this.debris = [];
    const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4;
    const cy = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;
    const vx = (p[WR].x - p[WF].x) * 0.08;
    const vy = (p[WR].y - p[WF].y) * 0.08;

    // Body panels (dark, large)
    for (let i = 0; i < 8; i++) {
      this.addDebris(cx, cy, vx, vy, 'panel', 2.5 + Math.random() * 4, BODY, OUTLINE);
    }
    // Glass shards (blue, small, many)
    for (let i = 0; i < 10; i++) {
      this.addDebris(cx, cy - 3, vx, vy - 0.5, 'glass', 0.8 + Math.random() * 1.5, WINDOW, '#5a8aa0');
    }
    // Wheels (round, large)
    this.addDebris(p[WF].x, p[WF].y, vx - 0.5, vy - 1, 'wheel', 3, TIRE, '#333');
    this.addDebris(p[WR].x, p[WR].y, vx + 0.5, vy - 0.8, 'wheel', 3, TIRE, '#333');
    // Exhaust pipe
    this.addDebris(cx - 4, cy, vx - 0.8, vy - 1.2, 'pipe', 2, AXLE, '#333');
    // Bumper
    this.addDebris(cx + 5, cy, vx + 0.6, vy - 0.5, 'pipe', 2.5, BUMPER, '#333');
    // Bolts and small parts
    for (let i = 0; i < 20; i++) {
      this.addDebris(cx, cy, vx, vy, 'bolt', 0.3 + Math.random() * 0.8, '#555', '#333');
    }
    // Headlight glass
    this.addDebris(cx + 6, cy, vx + 1, vy - 0.8, 'glass', 1.2, HEADLIGHT, '#c0b040');
    // Taillight
    this.addDebris(cx - 5, cy, vx - 0.5, vy - 0.6, 'glass', 1, TAILLIGHT, '#881818');
  }

  private addDebris(cx: number, cy: number, baseVx: number, baseVy: number,
    type: DebrisPiece['type'], size: number, color: string, stroke: string) {
    const a = Math.random() * Math.PI * 2;
    const spd = 0.3 + Math.random() * 1.8;
    this.debris.push({
      x: cx + (Math.random() - 0.5) * 8,
      y: cy + (Math.random() - 0.5) * 6,
      vx: baseVx + Math.cos(a) * spd,
      vy: baseVy + Math.sin(a) * spd - Math.random() * 1.2,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.4,
      type, color, stroke,
      w: size, h: size * (type === 'pipe' ? 0.25 : type === 'panel' ? 0.6 : 0.8),
      life: type === 'wheel' ? 120 : 70 + Math.floor(Math.random() * 50),
    });
  }

  private updateAndDrawDebris(ctx: CanvasRenderingContext2D) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy += 0.055;
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

      if (d.type === 'wheel') {
        // Draw as a circle with rim detail
        ctx.fillStyle = d.color;
        ctx.strokeStyle = d.stroke;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, d.w, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Inner rim
        ctx.fillStyle = RIM;
        ctx.beginPath();
        ctx.arc(0, 0, d.w * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'glass') {
        // Irregular shard
        ctx.fillStyle = d.color;
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(-d.w / 2, -d.h / 3);
        ctx.lineTo(d.w / 3, -d.h / 2);
        ctx.lineTo(d.w / 2, d.h / 4);
        ctx.lineTo(-d.w / 4, d.h / 2);
        ctx.closePath();
        ctx.fill();
      } else if (d.type === 'pipe') {
        // Long thin rectangle
        ctx.fillStyle = d.color;
        ctx.strokeStyle = d.stroke;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.roundRect(-d.w, -d.h / 2, d.w * 2, d.h, d.h * 0.3);
        ctx.fill();
        ctx.stroke();
      } else {
        // Panel or bolt — rectangle
        ctx.fillStyle = d.color;
        ctx.strokeStyle = d.stroke;
        ctx.lineWidth = 0.3;
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
      }

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
