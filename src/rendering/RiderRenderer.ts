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

const SVG_W = 1874.68;
const SVG_H = 1383.15;

// Body reference points in SVG space (butt seat, shoulder/neck)
// Shoulder x aligned with butt x so the body axis is vertical in SVG space,
// matching the physics rest state — prevents the sled from tilting on flat ground.
const SVG_BUTT = { x: 1050, y: 1000 };
const SVG_SHOULDER = { x: 1050, y: 570 };

// Sled reference points in SVG space (left-bottom, right-bottom of sled deck)
const SVG_SLED_TAIL = { x: 200, y: 1140 };
const SVG_SLED_NOSE = { x: 1550, y: 1140 };

export class RiderRenderer {
  private combinedImage: HTMLImageElement;
  private bodyImage: HTMLImageElement;
  private sledImage: HTMLImageElement;
  private combinedReady = false;
  private bodyReady = false;
  private sledReady = false;

  constructor() {
    this.combinedImage = new Image();
    this.bodyImage = new Image();
    this.sledImage = new Image();
    this.loadImages();
  }

  private loadImages() {
    // Load the combined character+sled image
    this.loadSvgImage(CHARACTER_SVG, this.combinedImage, () => { this.combinedReady = true; });

    // Parse SVG and split into body-only and sled-only images
    const parser = new DOMParser();
    const doc = parser.parseFromString(CHARACTER_SVG, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    const defs = svgEl.querySelector('defs');
    const topGroups = Array.from(svgEl.children).filter(el => el.tagName === 'g');

    // First 2 groups = body (character), last 2 groups = sled
    const bodyGroups = topGroups.slice(0, 2);
    const sledGroups = topGroups.slice(2);

    // Build body-only SVG
    const bodySvg = svgEl.cloneNode(false) as SVGSVGElement;
    if (defs) bodySvg.appendChild(defs.cloneNode(true));
    bodyGroups.forEach(g => bodySvg.appendChild(g.cloneNode(true)));
    this.loadSvgImage(
      new XMLSerializer().serializeToString(bodySvg),
      this.bodyImage,
      () => { this.bodyReady = true; },
    );

    // Build sled-only SVG
    const sledSvg = svgEl.cloneNode(false) as SVGSVGElement;
    if (defs) sledSvg.appendChild(defs.cloneNode(true));
    sledGroups.forEach(g => sledSvg.appendChild(g.cloneNode(true)));
    this.loadSvgImage(
      new XMLSerializer().serializeToString(sledSvg),
      this.sledImage,
      () => { this.sledReady = true; },
    );
  }

  private loadSvgImage(svgString: string, img: HTMLImageElement, onReady: () => void) {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      onReady();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length < 10) return;
    const p = rider.points;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Scarf behind everything
    if (rider.points.length > SCARF_START + 1) {
      this.drawScarf(ctx, p, rider.points.length);
    }

    if (rider.mounted && rider.sledIntact && this.combinedReady) {
      // Mounted: derive rotation from sled angle (TAIL→NOSE follows the track surface)
      // so the sled visually matches the line angle. Use a virtual shoulder point
      // perpendicular to the sled at the actual body length for correct scale.
      const sledDx = p[NOSE].x - p[TAIL].x;
      const sledDy = p[NOSE].y - p[TAIL].y;
      const sledAngle = Math.atan2(sledDy, sledDx);

      const bodyDx = p[SHOULDER].x - p[BUTT].x;
      const bodyDy = p[SHOULDER].y - p[BUTT].y;
      const bodyLen = Math.sqrt(bodyDx * bodyDx + bodyDy * bodyDy) || 5.5;

      // Perpendicular to sled surface, pointing "up" from the track
      const bodyAngle = sledAngle - Math.PI / 2;
      const virtualShoulder = {
        x: p[BUTT].x + Math.cos(bodyAngle) * bodyLen,
        y: p[BUTT].y + Math.sin(bodyAngle) * bodyLen,
      };
      this.drawSvgTransformed(ctx, this.combinedImage, p[BUTT], virtualShoulder, SVG_BUTT, SVG_SHOULDER);
    } else if (this.bodyReady) {
      // Dismounted: body and sled rendered independently
      if (rider.sledIntact && this.sledReady) {
        this.drawSvgTransformed(ctx, this.sledImage, p[TAIL], p[NOSE], SVG_SLED_TAIL, SVG_SLED_NOSE);
      }
      this.drawSvgTransformed(ctx, this.bodyImage, p[BUTT], p[SHOULDER], SVG_BUTT, SVG_SHOULDER);
    } else {
      // Fallback stick figure (images not loaded yet)
      if (rider.sledIntact) this.drawSled(ctx, p);
      this.drawBody(ctx, p);
      this.drawHead(ctx, p);
    }
  }

  /**
   * Draw an SVG image transformed so that svgFrom→svgTo maps to physFrom→physTo.
   * This determines position, rotation, and scale.
   */
  private drawSvgTransformed(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    physFrom: { x: number; y: number },
    physTo: { x: number; y: number },
    svgFrom: { x: number; y: number },
    svgTo: { x: number; y: number },
  ) {
    const pdx = physTo.x - physFrom.x;
    const pdy = physTo.y - physFrom.y;
    const physAngle = Math.atan2(pdy, pdx);
    const physLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;

    const sdx = svgTo.x - svgFrom.x;
    const sdy = svgTo.y - svgFrom.y;
    const svgAngle = Math.atan2(sdy, sdx);
    const svgLen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;

    const scale = physLen / svgLen;
    const rotation = physAngle - svgAngle;

    ctx.save();
    ctx.translate(physFrom.x, physFrom.y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-svgFrom.x, -svgFrom.y);
    ctx.drawImage(image, 0, 0, SVG_W, SVG_H);
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

    const rdx = p[NOSE].x - p[TAIL].x;
    const rdy = p[NOSE].y - p[TAIL].y;
    const rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    const rnx = rdx / rlen, rny = rdy / rlen;
    const rpx = rny, rpy = -rnx;
    const ext = 2.5, off = 1.5;
    const rx1 = p[TAIL].x - rnx * ext + rpx * off;
    const ry1 = p[TAIL].y - rny * ext + rpy * off;
    const rx2 = p[NOSE].x + rnx * ext + rpx * off;
    const ry2 = p[NOSE].y + rny * ext + rpy * off;

    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
    ctx.quadraticCurveTo(rx2 + rnx * 2, ry2 + rny * 2, rx2 + rnx * 2.5 - rpx * 3, ry2 + rny * 2.5 - rpy * 3);
    ctx.stroke();
  }

  private drawBody(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>) {
    ctx.strokeStyle = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(p[LFOOT].x, p[LFOOT].y); ctx.lineTo(p[BUTT].x, p[BUTT].y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p[RFOOT].x, p[RFOOT].y); ctx.lineTo(p[BUTT].x, p[BUTT].y); ctx.stroke();

    ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(p[BUTT].x, p[BUTT].y); ctx.lineTo(p[SHOULDER].x, p[SHOULDER].y); ctx.stroke();

    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y); ctx.lineTo(p[LHAND].x, p[LHAND].y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p[SHOULDER].x, p[SHOULDER].y); ctx.lineTo(p[RHAND].x, p[RHAND].y); ctx.stroke();

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
    const nx = dx / len, ny = dy / len;
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

    const hmx = (p[LHAND].x + p[RHAND].x) / 2;
    const hmy = (p[LHAND].y + p[RHAND].y) / 2;
    const fdx = hmx - p[SHOULDER].x;
    const fdy = hmy - p[SHOULDER].y;
    const fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;

    ctx.fillStyle = STROKE;
    ctx.beginPath();
    ctx.arc(hx + (fdx / fLen) * 1.8 + nx * -0.5, hy + (fdy / fLen) * 1.8 + ny * -0.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── SCARF (always drawn, physics-driven) ──

  private drawScarf(ctx: CanvasRenderingContext2D, p: Array<{ x: number; y: number }>, totalPoints: number) {
    const scarfCount = totalPoints - SCARF_START;
    if (scarfCount < 2) return;

    // Build a list of scarf centerline points: shoulder → scarf chain
    const pts: Array<{ x: number; y: number }> = [p[SHOULDER]];
    for (let i = 0; i < scarfCount; i++) {
      const idx = SCARF_START + i;
      if (idx >= totalPoints) break;
      pts.push(p[idx]);
    }
    if (pts.length < 2) return;

    // Compute perpendicular offsets at each point to form a ribbon
    const neckHalf = 0.5;   // half-width at neck
    const tipHalf = 0.15;   // half-width at tip
    const leftEdge: Array<{ x: number; y: number }> = [];
    const rightEdge: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < pts.length; i++) {
      // Tangent direction at this point
      let tx: number, ty: number;
      if (i === 0) {
        tx = pts[1].x - pts[0].x;
        ty = pts[1].y - pts[0].y;
      } else if (i === pts.length - 1) {
        tx = pts[i].x - pts[i - 1].x;
        ty = pts[i].y - pts[i - 1].y;
      } else {
        tx = pts[i + 1].x - pts[i - 1].x;
        ty = pts[i + 1].y - pts[i - 1].y;
      }
      const len = Math.sqrt(tx * tx + ty * ty) || 1;
      // Perpendicular (rotated 90°)
      const nx = -ty / len;
      const ny = tx / len;

      const t = i / (pts.length - 1);
      const halfW = neckHalf + (tipHalf - neckHalf) * t;
      leftEdge.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
      rightEdge.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
    }

    // Draw filled ribbon
    ctx.fillStyle = FILL_SCARF;
    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let i = 1; i < leftEdge.length; i++) {
      ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
    }
    // Continue along the right edge in reverse
    for (let i = rightEdge.length - 1; i >= 0; i--) {
      ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Subtle outline for definition
    ctx.strokeStyle = FILL_SCARF;
    ctx.lineWidth = 0.15;
    ctx.lineJoin = 'round';
    ctx.stroke();
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
