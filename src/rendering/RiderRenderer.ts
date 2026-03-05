import { CHARACTER_SVG } from './character-svg';

export interface RiderRenderData {
  points: Array<{ x: number; y: number }>;
  mounted: boolean;
  sledIntact: boolean;
}

// Point indices matching rider-data.ts
const PEG = 0, TAIL = 1, NOSE = 2, STRING = 3;
const BUTT = 4, SHOULDER = 5, RHAND = 6, LHAND = 7, LFOOT = 8, RFOOT = 9;
const SCARF_START = 10;

// Stick-figure fallback colors
const STROKE = '#111111';
const FILL_WHITE = '#ffffff';
const FILL_SLED = '#222222';
const FILL_SCARF = '#333333';

/**
 * SVG reference points — where BUTT and SHOULDER sit in the SVG coordinate space.
 * Adjust these to re-anchor the character if the SVG changes.
 */
const SVG_W = 1874.68;
const SVG_H = 1383.15;
const SVG_BUTT = { x: 1050, y: 1000 };
const SVG_SHOULDER = { x: 1020, y: 570 };

export class RiderRenderer {
  private svgImage: HTMLImageElement;
  private imageReady = false;

  constructor() {
    this.svgImage = new Image();
    const blob = new Blob([CHARACTER_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.svgImage.onload = () => {
      this.imageReady = true;
      URL.revokeObjectURL(url);
    };
    this.svgImage.src = url;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 10) return;
    const p = rider.points;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Scarf drawn behind the character
    if (rider.points.length > SCARF_START + 1) {
      this.drawScarf(ctx, p, rider.points.length);
    }

    // SVG character when mounted + sled intact + image loaded
    if (rider.mounted && rider.sledIntact && this.imageReady) {
      this.drawSvgCharacter(ctx, p);
    } else {
      // Fallback stick figure
      if (rider.sledIntact) this.drawSled(ctx, p);
      this.drawBody(ctx, p);
      this.drawHead(ctx, p);
    }
  }

  private drawSvgCharacter(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>) {
    const buttX = p[BUTT].x, buttY = p[BUTT].y;
    const shX = p[SHOULDER].x, shY = p[SHOULDER].y;

    // Physics torso vector
    const pdx = shX - buttX;
    const pdy = shY - buttY;
    const physAngle = Math.atan2(pdy, pdx);
    const physLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;

    // SVG torso vector
    const sdx = SVG_SHOULDER.x - SVG_BUTT.x;
    const sdy = SVG_SHOULDER.y - SVG_BUTT.y;
    const svgAngle = Math.atan2(sdy, sdx);
    const svgLen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;

    const scale = physLen / svgLen;
    const rotation = physAngle - svgAngle;

    ctx.save();
    // 1. Move to physics BUTT position
    ctx.translate(buttX, buttY);
    // 2. Rotate from SVG orientation to physics orientation
    ctx.rotate(rotation);
    // 3. Scale from SVG units to physics units
    ctx.scale(scale, scale);
    // 4. Offset so SVG_BUTT aligns with origin (now at physics BUTT)
    ctx.translate(-SVG_BUTT.x, -SVG_BUTT.y);
    // 5. Draw the full SVG (body + sled)
    ctx.drawImage(this.svgImage, 0, 0, SVG_W, SVG_H);
    ctx.restore();
  }

  // ── FALLBACK: Stick figure rendering ──

  private drawSled(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>) {
    ctx.fillStyle = FILL_SLED;
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(p[PEG].x, p[PEG].y);
    ctx.lineTo(p[TAIL].x, p[TAIL].y);
    ctx.lineTo(p[NOSE].x, p[NOSE].y);
    ctx.lineTo(p[STRING].x, p[STRING].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Runner
    const rdx = p[NOSE].x - p[TAIL].x;
    const rdy = p[NOSE].y - p[TAIL].y;
    const rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    const rnx = rdx / rlen;
    const rny = rdy / rlen;
    const rpx = rny;
    const rpy = -rnx;
    const ext = 2.5, off = 1.5;
    const rx1 = p[TAIL].x - rnx * ext + rpx * off;
    const ry1 = p[TAIL].y - rny * ext + rpy * off;
    const rx2 = p[NOSE].x + rnx * ext + rpx * off;
    const ry2 = p[NOSE].y + rny * ext + rpy * off;
    const curlX = rx2 + rnx * 2.5 - rpx * 3;
    const curlY = ry2 + rny * 2.5 - rpy * 3;

    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
    ctx.quadraticCurveTo(rx2 + rnx * 2, ry2 + rny * 2, curlX, curlY);
    ctx.stroke();
  }

  private drawBody(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>) {
    ctx.strokeStyle = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Legs
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(p[LFOOT].x, p[LFOOT].y); ctx.lineTo(p[BUTT].x, p[BUTT].y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p[RFOOT].x, p[RFOOT].y); ctx.lineTo(p[BUTT].x, p[BUTT].y); ctx.stroke();

    // Torso
    ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(p[BUTT].x, p[BUTT].y); ctx.lineTo(p[SHOULDER].x, p[SHOULDER].y); ctx.stroke();

    // Arms
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y); ctx.lineTo(p[LHAND].x, p[LHAND].y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y); ctx.lineTo(p[RHAND].x, p[RHAND].y); ctx.stroke();

    // Joints
    this.drawJoint(ctx, p[BUTT].x, p[BUTT].y, 1.8);
    this.drawJoint(ctx, p[SHOULDER].x, p[SHOULDER].y, 1.8);
    this.drawDot(ctx, p[LHAND].x, p[LHAND].y, 1.2);
    this.drawDot(ctx, p[RHAND].x, p[RHAND].y, 1.2);
    this.drawDot(ctx, p[LFOOT].x, p[LFOOT].y, 1.2);
    this.drawDot(ctx, p[RFOOT].x, p[RFOOT].y, 1.2);
  }

  private drawHead(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>) {
    const dx = p[SHOULDER].x - p[BUTT].x;
    const dy = p[SHOULDER].y - p[BUTT].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const headRadius = 4.5;
    const hx = p[SHOULDER].x + nx * (headRadius + 1);
    const hy = p[SHOULDER].y + ny * (headRadius + 1);

    ctx.fillStyle = FILL_WHITE;
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(hx, hy, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye
    const handMidX = (p[LHAND].x + p[RHAND].x) / 2;
    const handMidY = (p[LHAND].y + p[RHAND].y) / 2;
    const fdx = handMidX - p[SHOULDER].x;
    const fdy = handMidY - p[SHOULDER].y;
    const fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
    const eyeX = hx + (fdx / fLen) * 1.8 + nx * -0.5;
    const eyeY = hy + (fdy / fLen) * 1.8 + ny * -0.5;

    ctx.fillStyle = STROKE;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── SCARF (always drawn, physics-driven) ──

  private drawScarf(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>, totalPoints: number) {
    const scarfCount = totalPoints - SCARF_START;
    if (scarfCount < 2) return;

    ctx.strokeStyle = FILL_SCARF;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const maxWidth = 3.0;
    for (let i = 0; i < scarfCount; i++) {
      const fromIdx = i === 0 ? SHOULDER : SCARF_START + i - 1;
      const toIdx = SCARF_START + i;
      if (toIdx >= totalPoints) break;

      const t = i / scarfCount;
      ctx.lineWidth = maxWidth * (1 - t * 0.7);
      ctx.beginPath();
      ctx.moveTo(p[fromIdx].x, p[fromIdx].y);
      ctx.lineTo(p[toIdx].x, p[toIdx].y);
      ctx.stroke();
    }

    // Small flag at scarf tip
    const lastIdx = Math.min(SCARF_START + scarfCount - 1, totalPoints - 1);
    const prevIdx = lastIdx - 1;
    if (prevIdx >= SCARF_START) {
      const edx = p[lastIdx].x - p[prevIdx].x;
      const edy = p[lastIdx].y - p[prevIdx].y;
      const elen = Math.sqrt(edx * edx + edy * edy) || 1;
      const epx = -edy / elen;
      const epy = edx / elen;
      const flagSize = 2;

      ctx.fillStyle = FILL_SCARF;
      ctx.beginPath();
      ctx.moveTo(p[lastIdx].x, p[lastIdx].y);
      ctx.lineTo(p[lastIdx].x + epx * flagSize + edx / elen * flagSize, p[lastIdx].y + epy * flagSize + edy / elen * flagSize);
      ctx.lineTo(p[lastIdx].x - epx * flagSize + edx / elen * flagSize, p[lastIdx].y - epy * flagSize + edy / elen * flagSize);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawJoint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = FILL_WHITE;
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = STROKE;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
