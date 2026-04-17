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

// Debris piece — each represents a recognizable truck part
interface DebrisPiece {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; rotV: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
  life: number;
  bounce: number; // how many times it can bounce
}

// Spark particle
interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
}

export class TruckRenderer {
  private wheelAngle = 0;
  private prevWFx = 0;
  private debris: DebrisPiece[] = [];
  private sparks: Spark[] = [];
  private flashAlpha = 0;
  private wasSledIntact = true;
  private wasDriverMounted = true;
  private hasCrashed = false;

  resetDebris() {
    this.debris = [];
    this.sparks = [];
    this.flashAlpha = 0;
    this.wasSledIntact = true;
    this.wasDriverMounted = true;
    this.hasCrashed = false;
    this.prevWFx = 0;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 6) return;
    const p = rider.points;

    // Detect crash — trigger on sled break OR driver eject (whichever happens first)
    const sledBroke = this.wasSledIntact && !rider.sledIntact;
    const driverEjected = this.wasDriverMounted && !rider.mounted;
    if (!this.hasCrashed && (sledBroke || driverEjected)) {
      this.spawnDebris(p);
      this.hasCrashed = true;
    }
    this.wasSledIntact = rider.sledIntact;
    this.wasDriverMounted = rider.mounted;

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

    // Impact flash
    if (this.flashAlpha > 0) {
      this.drawFlash(ctx, p);
    }

    // Debris
    if (this.debris.length > 0) {
      this.updateAndDrawDebris(ctx);
    }

    // Sparks
    if (this.sparks.length > 0) {
      this.updateAndDrawSparks(ctx);
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

  // ── CRASH EFFECTS ──

  private spawnDebris(p: Array<{x: number; y: number}>) {
    this.debris = [];
    this.sparks = [];

    // Frame geometry at crash time
    const dx = p[WR].x - p[WF].x;
    const dy = p[WR].y - p[WF].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = dx / len, fy = dy / len;
    const ux = fy, uy = -fx;
    const mx = (p[WF].x + p[WR].x) / 2;
    const my = (p[WF].y + p[WR].y) / 2;
    const wheelR = len * 0.23;

    // Crash velocity
    const cvx = (p[WR].x - p[CF].x) * 0.06;
    const cvy = (p[WR].y - p[CF].y) * 0.06;

    const pos = (f: number, u: number) => ({
      x: mx + fx * f * len + ux * u * len,
      y: my + fy * f * len + uy * u * len,
    });

    // Impact flash
    this.flashAlpha = 1;

    // ── HOOD (front panel, flies forward) ──
    const hood = pos(0.3, 0.5);
    this.addPart(hood.x, hood.y, cvx + 1.2, cvy - 0.8, 140, (ctx) => {
      ctx.fillStyle = BODY;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.4;
      ctx.fillRect(-3, -1, 6, 2);
      ctx.strokeRect(-3, -1, 6, 2);
      ctx.strokeStyle = BODY_ACCENT;
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
    });

    // ── CAB ROOF (large panel, tumbles up) ──
    const roof = pos(0.02, 0.85);
    this.addPart(roof.x, roof.y, cvx + 0.3, cvy - 1.8, 130, (ctx) => {
      ctx.fillStyle = BODY;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.4;
      ctx.fillRect(-3.5, -1.2, 7, 2.4);
      ctx.strokeRect(-3.5, -1.2, 7, 2.4);
    });

    // ── TRUCK BED (back panel) ──
    const bed = pos(-0.28, 0.5);
    this.addPart(bed.x, bed.y, cvx - 0.6, cvy - 0.5, 120, (ctx) => {
      ctx.fillStyle = BODY;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.4;
      ctx.fillRect(-4, -1.5, 8, 3);
      ctx.strokeRect(-4, -1.5, 8, 3);
      // Bed floor line
      ctx.strokeStyle = BODY_ACCENT;
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.moveTo(-3.5, 0.5); ctx.lineTo(3.5, 0.5); ctx.stroke();
    });

    // ── WINDSHIELD (glass, shatters into shards) ──
    const winPos = pos(0.05, 0.7);
    for (let i = 0; i < 8; i++) {
      const sz = 0.6 + Math.random() * 1.2;
      const pts = this.randomShardPoly(sz);
      this.addPart(
        winPos.x + (Math.random() - 0.5) * 4,
        winPos.y + (Math.random() - 0.5) * 3,
        cvx + (Math.random() - 0.5) * 2,
        cvy - 1 - Math.random() * 1.5,
        60 + Math.floor(Math.random() * 40),
        (ctx) => {
          ctx.fillStyle = WINDOW;
          ctx.globalAlpha *= 0.65;
          ctx.strokeStyle = '#9acce0';
          ctx.lineWidth = 0.15;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      );
    }

    // ── WHEELS (two big wheels bounce away) ──
    const wfVis = { x: p[WF].x + ux * wheelR, y: p[WF].y + uy * wheelR };
    const wrVis = { x: p[WR].x + ux * wheelR, y: p[WR].y + uy * wheelR };

    for (const wc of [wfVis, wrVis]) {
      const wvx = cvx + (Math.random() - 0.5) * 1.5;
      const wvy = cvy - 1.2 - Math.random() * 0.8;
      const wr = wheelR;
      this.addPart(wc.x, wc.y, wvx, wvy, 160, (ctx) => {
        // Full wheel with treads and rim
        ctx.fillStyle = TIRE;
        ctx.strokeStyle = TIRE_EDGE;
        ctx.lineWidth = wr * 0.08;
        ctx.beginPath(); ctx.arc(0, 0, wr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Tread marks
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = wr * 0.06;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI * 2 / 12;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * wr * 0.82, Math.sin(a) * wr * 0.82);
          ctx.lineTo(Math.cos(a) * wr * 0.95, Math.sin(a) * wr * 0.95);
          ctx.stroke();
        }
        // Rim
        ctx.fillStyle = RIM;
        ctx.beginPath(); ctx.arc(0, 0, wr * 0.48, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = RIM_HUB;
        ctx.beginPath(); ctx.arc(0, 0, wr * 0.13, 0, Math.PI * 2); ctx.fill();
      }, 3); // wheels bounce
    }

    // ── BUMPER (thick bar) ──
    const bmpPos = pos(0.49, 0.4);
    this.addPart(bmpPos.x, bmpPos.y, cvx + 1.5, cvy - 0.3, 100, (ctx) => {
      ctx.fillStyle = BUMPER;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.roundRect(-0.6, -2.5, 1.2, 5, 0.3);
      ctx.fill(); ctx.stroke();
    });

    // ── EXHAUST PIPE ──
    const epPos = pos(-0.40, 0.5);
    this.addPart(epPos.x, epPos.y, cvx - 1, cvy - 1.5, 110, (ctx) => {
      ctx.fillStyle = AXLE;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.25;
      ctx.beginPath();
      ctx.roundRect(-0.4, -3, 0.8, 6, 0.3);
      ctx.fill(); ctx.stroke();
    });

    // ── HEADLIGHT ──
    const hlPos = pos(0.47, 0.46);
    this.addPart(hlPos.x, hlPos.y, cvx + 1.8, cvy - 0.6, 70, (ctx) => {
      ctx.fillStyle = HEADLIGHT;
      ctx.globalAlpha *= 0.8;
      ctx.strokeStyle = '#c0b040';
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    // ── TAILLIGHT ──
    const tlPos = pos(-0.43, 0.5);
    this.addPart(tlPos.x, tlPos.y, cvx - 0.8, cvy - 0.4, 70, (ctx) => {
      ctx.fillStyle = TAILLIGHT;
      ctx.globalAlpha *= 0.8;
      ctx.strokeStyle = '#881818';
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    // ── AXLE BARS ──
    for (const xf of [-0.38, 0.38]) {
      const axPos = pos(xf, 0.15);
      this.addPart(axPos.x, axPos.y, cvx + (Math.random() - 0.5), cvy - 0.8, 90, (ctx) => {
        ctx.fillStyle = AXLE;
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.2;
        ctx.fillRect(-0.35, -1.8, 0.7, 3.6);
        ctx.strokeRect(-0.35, -1.8, 0.7, 3.6);
      });
    }

    // ── SMALL METAL BITS (bolts, brackets, screws) ──
    for (let i = 0; i < 25; i++) {
      const bp = pos((Math.random() - 0.5) * 0.8, Math.random() * 0.6);
      const bsz = 0.2 + Math.random() * 0.6;
      const bcolor = ['#555', '#666', '#777', '#444'][Math.floor(Math.random() * 4)];
      this.addPart(bp.x, bp.y, cvx + (Math.random() - 0.5) * 2.5, cvy - Math.random() * 2,
        40 + Math.floor(Math.random() * 40), (ctx) => {
          ctx.fillStyle = bcolor;
          ctx.fillRect(-bsz / 2, -bsz / 2, bsz, bsz);
        });
    }

    // ── SPARKS ──
    for (let i = 0; i < 40; i++) {
      const sp = pos((Math.random() - 0.5) * 0.8, Math.random() * 0.3);
      const a = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3;
      this.sparks.push({
        x: sp.x, y: sp.y,
        vx: cvx + Math.cos(a) * spd,
        vy: cvy + Math.sin(a) * spd - Math.random() * 1.5,
        life: 15 + Math.floor(Math.random() * 20),
        color: Math.random() > 0.3 ? '#ffcc44' : '#ff8833',
      });
    }
  }

  private addPart(x: number, y: number, vx: number, vy: number,
    life: number, draw: (ctx: CanvasRenderingContext2D) => void, bounce = 0) {
    this.debris.push({
      x, y, vx, vy,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.35,
      draw, life, bounce,
    });
  }

  private randomShardPoly(size: number): [number, number][] {
    const n = 3 + Math.floor(Math.random() * 3);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const r = size * (0.5 + Math.random() * 0.5);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  private drawFlash(ctx: CanvasRenderingContext2D, p: Array<{x: number; y: number}>) {
    if (this.flashAlpha <= 0) return;
    const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4;
    const cy = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    grad.addColorStop(0, `rgba(255, 240, 200, ${this.flashAlpha * 0.6})`);
    grad.addColorStop(0.4, `rgba(255, 200, 100, ${this.flashAlpha * 0.3})`);
    grad.addColorStop(1, `rgba(255, 150, 50, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();

    this.flashAlpha -= 0.06;
    if (this.flashAlpha < 0) this.flashAlpha = 0;
  }

  private updateAndDrawDebris(ctx: CanvasRenderingContext2D) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy += 0.055;
      d.x += d.vx;
      d.y += d.vy;
      d.rot += d.rotV;
      d.vx *= 0.998; // air friction
      d.life--;

      if (d.life <= 0) { this.debris.splice(i, 1); continue; }

      const alpha = d.life < 25 ? d.life / 25 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      d.draw(ctx);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private updateAndDrawSparks(ctx: CanvasRenderingContext2D) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.vy += 0.08;
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.96;
      s.vy *= 0.96;
      s.life--;

      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }

      const alpha = s.life < 8 ? s.life / 8 : 1;
      const r = 0.2 + (s.life / 35) * 0.5;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Spark trail
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = r * 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
