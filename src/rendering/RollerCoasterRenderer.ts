import rollerRaw from '../../roller.svg?raw';
import type { RiderRenderData } from './RiderRenderer';

/**
 * Roller coaster renderer — uses roller.svg for each cart body.
 *
 * Physics point layout:
 *   Cart 3 (rear):   0=LT 1=LB 2=RB 3=RT
 *   Cart 2 (middle): 4=LT 5=LB 6=RB 7=RT
 *   Cart 1 (front):  8=LT 9=LB 10=RB 11=RT
 *   Driver:          12=SEAT 13=HEAD
 */

// Cart 3
const C3_LT=0, C3_LB=1, C3_RB=2, C3_RT=3;
// Cart 2
const C2_LT=4, C2_LB=5, C2_RB=6, C2_RT=7;
// Cart 1
const C1_LT=8, C1_LB=9, C1_RB=10, C1_RT=11;
// Driver
const SEAT=12, HEAD=13;

// roller.svg intrinsic size
const SOURCE_W = 343.68;
const SOURCE_H = 428.63;
const SVG_PAD  = 24;
const RENDER_W = SOURCE_W + SVG_PAD * 2;
const RENDER_H = SOURCE_H + SVG_PAD * 2;

// Bottom-of-wheel contact points inside the SVG (padded coords)
// Left wheel:  center (77.64, 409.72) r=11.09  → bottom y = 420.81
// Right wheel: center (263.94, 409.75) r=11.06 → bottom y = 420.81
const SVG_L   = { x: SVG_PAD + 77.64,  y: SVG_PAD + 420.81 };
const SVG_R   = { x: SVG_PAD + 263.94, y: SVG_PAD + 420.81 };
const SVG_MX  = (SVG_L.x + SVG_R.x) / 2;
const SVG_MY  = SVG_L.y;
const SVG_SPAN = SVG_R.x - SVG_L.x; // ≈ 186.3

// How far the SVG cart BODY (not the full image) extends past each wheel
// contact point — based on the polygon rail at y≈334 in the source SVG
// (left body edge x≈22.9, right body edge x≈320.5).
// These control the coupler bar inset so it starts/ends at the body edge.
// SVG cart body edges (polygon rail y≈334) plus a small extra margin to
// keep the bar endpoints clear of the rounded wall stroke.
const SVG_BODY_L  = 22.9;   // left rail edge in source SVG coords
const SVG_BODY_R  = 320.5;  // right rail edge in source SVG coords
const WALL_MARGIN = 18;      // extra SVG px to clear the wall stroke
const SVG_OVER_R  = (SVG_BODY_R - 263.94 + WALL_MARGIN) / SVG_SPAN * 10; // ≈ 4.0
const SVG_OVER_L  = (77.64 - SVG_BODY_L  + WALL_MARGIN) / SVG_SPAN * 10; // ≈ 3.9

type P2 = { x: number; y: number };

function mid(a: P2, b: P2): P2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function lerp2(a: P2, b: P2, t: number): P2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Move `from` toward `to` by exactly `dist` physics units. */
function pushToward(from: P2, to: P2, dist: number): P2 {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d  = Math.hypot(dx, dy) || 1;
  return { x: from.x + dx / d * dist, y: from.y + dy / d * dist };
}

/**
 * Outward unit normal of a cart face defined by two points (top → bottom).
 * rightward=true  → right-hand normal (points right for a vertical face)
 * rightward=false → left-hand normal
 */
function faceNormal(top: P2, bottom: P2, rightward: boolean): P2 {
  const dx = bottom.x - top.x, dy = bottom.y - top.y;
  const len = Math.hypot(dx, dy) || 1;
  return rightward
    ? { x:  dy / len, y: -dx / len }
    : { x: -dy / len, y:  dx / len };
}

export class RollerCoasterRenderer {
  private image = new Image();
  private ready  = false;

  constructor() {
    const blob = new Blob([this.buildSvg()], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    this.image.onload = () => { this.ready = true; URL.revokeObjectURL(url); };
    this.image.src = url;
  }

  private buildSvg(): string {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(rollerRaw, 'image/svg+xml');
    const src    = doc.querySelector('svg');
    const vb     = src?.getAttribute('viewBox') ?? `0 0 ${SOURCE_W} ${SOURCE_H}`;
    const art    = src?.innerHTML ?? '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${RENDER_W}" height="${RENDER_H}" viewBox="0 0 ${RENDER_W} ${RENDER_H}">
  <g transform="translate(${SVG_PAD} ${SVG_PAD})">
    <svg viewBox="${vb}" width="${SOURCE_W}" height="${SOURCE_H}" overflow="visible">
      <g fill="#1a1a1a">${art}</g>
    </svg>
  </g>
</svg>`;
  }

  reset() {}

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 14) return;
    const p = rider.points;

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Couplers drawn first (behind carts)
    const cartH = Math.hypot(p[C3_LT].x - p[C3_LB].x, p[C3_LT].y - p[C3_LB].y) || 5;
    // Face midpoints at cart-body height (slightly above physics LT)
    const c3R = lerp2(p[C3_RT], p[C3_RB], -0.2);
    const c2L = lerp2(p[C2_LT], p[C2_LB], -0.2);
    const c2R = lerp2(p[C2_RT], p[C2_RB], -0.2);
    const c1L = lerp2(p[C1_LT], p[C1_LB], -0.2);

    if (rider.sledIntact) {
      // Intact: full bar + pin circle between each cart pair
      this.drawCoupler(ctx, pushToward(c3R, c2L, SVG_OVER_R), pushToward(c2L, c3R, SVG_OVER_L), cartH);
      this.drawCoupler(ctx, pushToward(c2R, c1L, SVG_OVER_R), pushToward(c1L, c2R, SVG_OVER_L), cartH);
    } else {
      // Broken: each cart face shows its own stub (bar + half-circle)
      // Cart 3 — right stub only
      if (this.cartSane(p[C3_LB], p[C3_RB]))
        this.drawCouplerStub(ctx, c3R, faceNormal(p[C3_RT], p[C3_RB], true),  cartH);
      // Cart 2 — left and right stubs
      if (this.cartSane(p[C2_LB], p[C2_RB])) {
        this.drawCouplerStub(ctx, c2L, faceNormal(p[C2_LT], p[C2_LB], false), cartH);
        this.drawCouplerStub(ctx, c2R, faceNormal(p[C2_RT], p[C2_RB], true),  cartH);
      }
      // Cart 1 — left stub only
      if (this.cartSane(p[C1_LB], p[C1_RB]))
        this.drawCouplerStub(ctx, c1L, faceNormal(p[C1_LT], p[C1_LB], false), cartH);
    }

    // Carts rear → front so front overlaps rear
    if (this.ready) {
      this.drawCart(ctx, p[C3_LB], p[C3_RB]);
      this.drawCart(ctx, p[C2_LB], p[C2_RB]);
      this.drawCart(ctx, p[C1_LB], p[C1_RB]);
    } else {
      // Fallback boxes while image loads
      this.drawBox(ctx, p[C3_LT], p[C3_LB], p[C3_RB], p[C3_RT]);
      this.drawBox(ctx, p[C2_LT], p[C2_LB], p[C2_RB], p[C2_RT]);
      this.drawBox(ctx, p[C1_LT], p[C1_LB], p[C1_RB], p[C1_RT]);
    }

    // Show ejected driver as a flailing figure
    if (!rider.mounted && rider.points.length > HEAD) {
      this.drawEjected(ctx, p[SEAT], p[HEAD]);
    }

    ctx.restore();
  }

  private drawCart(ctx: CanvasRenderingContext2D, lb: P2, rb: P2) {
    const pdx   = rb.x - lb.x;
    const pdy   = rb.y - lb.y;
    const angle = Math.atan2(pdy, pdx);
    const pLen  = Math.hypot(pdx, pdy) || 1;
    const scale = pLen / SVG_SPAN;
    // Skip carts whose geometry has gone wild (e.g. after a wreck flings points)
    if (scale < 0.001 || scale > 15) return;
    const mx    = (lb.x + rb.x) / 2;
    const my    = (lb.y + rb.y) / 2;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.translate(-SVG_MX, -SVG_MY);
    ctx.drawImage(this.image, 0, 0, RENDER_W, RENDER_H);
    ctx.restore();
  }

  private cartSane(lb: P2, rb: P2): boolean {
    const scale = Math.hypot(rb.x - lb.x, rb.y - lb.y) / SVG_SPAN;
    return scale >= 0.001 && scale <= 15;
  }

  /**
   * Broken coupler stub: a bar extending outward from the cart face ending
   * in a half-circle (the "split pin" that remains after the joint breaks).
   */
  private drawCouplerStub(ctx: CanvasRenderingContext2D, face: P2, outward: P2, cartH: number) {
    const pinR = cartH * 0.14;
    const barW = cartH * 0.10;
    // Bar runs from face point outward to where the pin center sits
    const tipX = face.x + outward.x * (SVG_OVER_R + pinR);
    const tipY = face.y + outward.y * (SVG_OVER_R + pinR);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = barW;
    ctx.lineCap     = 'butt';
    ctx.beginPath();
    ctx.moveTo(face.x, face.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Half-circle at the tip facing outward
    const angle = Math.atan2(outward.y, outward.x);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.arc(tipX, tipY, pinR, angle - Math.PI / 2, angle + Math.PI / 2, false);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Coupler: horizontal bar spanning the gap, with a small circle pin at center.
   * Sizes are relative to cartH so they stay proportional at any zoom.
   */
  private drawCoupler(ctx: CanvasRenderingContext2D, a: P2, b: P2, cartH: number) {
    const barW = cartH * 0.10;   // bar thickness = 10% of cart height
    const pinR = cartH * 0.14;   // pin radius    = 14% of cart height

    // Bar
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = barW;
    ctx.lineCap     = 'butt';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Pin circle on top of bar so it's clearly visible
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(mx, my, pinR, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBox(ctx: CanvasRenderingContext2D, lt: P2, lb: P2, rb: P2, rt: P2) {
    ctx.fillStyle   = '#8B0000';
    ctx.strokeStyle = '#500';
    ctx.lineWidth   = 0.4;
    ctx.beginPath();
    ctx.moveTo(lt.x, lt.y);
    ctx.lineTo(lb.x, lb.y);
    ctx.lineTo(rb.x, rb.y);
    ctx.lineTo(rt.x, rt.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawEjected(ctx: CanvasRenderingContext2D, seat: P2, head: P2) {
    const dx  = head.x - seat.x;
    const dy  = head.y - seat.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx  = dx / len;
    const ny  = dy / len;
    const r   = Math.max(1, len * 0.35);

    // Torso
    ctx.strokeStyle = '#1a4080';
    ctx.lineWidth   = Math.max(0.8, len * 0.22);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    // Head
    const hx = head.x + nx * r;
    const hy = head.y + ny * r;
    ctx.fillStyle   = '#e8e8d8';
    ctx.strokeStyle = '#999';
    ctx.lineWidth   = r * 0.1;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
