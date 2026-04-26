import birdRaw from '../../bird.svg?raw';
import type { RiderRenderData } from './RiderRenderer';

const PEG = 0;
const TAIL = 1;
const NOSE = 2;
const STRING = 3;

const SOURCE_SVG_W = 907.97;
const SOURCE_SVG_H = 430.37;
const SVG_PAD = 40;
const RENDER_SVG_W = SOURCE_SVG_W + SVG_PAD * 2;
const RENDER_SVG_H = SOURCE_SVG_H + SVG_PAD * 2;

// Belly contact points inside the source art. Mapping these to the sled rail
// makes the bird feel like it is sliding on its stomach rather than floating.
const SVG_BELLY_TAIL = { x: SVG_PAD + 124, y: SVG_PAD + 403 };
const SVG_BELLY_NOSE = { x: SVG_PAD + 784, y: SVG_PAD + 403 };
const SVG_BELLY_MID = {
  x: (SVG_BELLY_TAIL.x + SVG_BELLY_NOSE.x) * 0.5,
  y: (SVG_BELLY_TAIL.y + SVG_BELLY_NOSE.y) * 0.5,
};
const REST_FRAME_HEIGHT = 5.8;

export class BirdRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    const blob = new Blob([this.buildCompositeSvg()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.image.onload = () => {
      this.ready = true;
      URL.revokeObjectURL(url);
    };
    this.image.src = url;
  }

  private buildCompositeSvg(): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(birdRaw, 'image/svg+xml');
    const sourceSvg = doc.querySelector('svg');
    const viewBox = sourceSvg?.getAttribute('viewBox') ?? `0 0 ${SOURCE_SVG_W} ${SOURCE_SVG_H}`;
    const artwork = sourceSvg?.innerHTML ?? '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${RENDER_SVG_W}" height="${RENDER_SVG_H}" viewBox="0 0 ${RENDER_SVG_W} ${RENDER_SVG_H}">
        <defs>
          <filter id="bird-ink" x="-10%" y="-14%" width="120%" height="128%" color-interpolation-filters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="4.2" result="spread" />
            <feFlood flood-color="#111111" result="ink" />
            <feComposite in="ink" in2="spread" operator="in" />
          </filter>
        </defs>
        <g transform="translate(${SVG_PAD} ${SVG_PAD})">
          <svg viewBox="${viewBox}" width="${SOURCE_SVG_W}" height="${SOURCE_SVG_H}" overflow="visible">
            <g fill="#111111" filter="url(#bird-ink)">${artwork}</g>
          </svg>
        </g>
      </svg>
    `.trim();
  }

  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null) {
    if (!rider || rider.points.length <= STRING) return;

    const p = rider.points;
    if (this.ready) {
      this.drawBirdTransformed(ctx, p);
      return;
    }

    this.drawFallback(ctx, p[TAIL], p[NOSE]);
  }

  private drawBirdTransformed(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
  ) {
    const tail = points[TAIL];
    const nose = points[NOSE];
    const peg = points[PEG];
    const string = points[STRING];

    const physFrom = tail;
    const physTo = nose;
    const pdx = physTo.x - physFrom.x;
    const pdy = physTo.y - physFrom.y;
    const physAngle = Math.atan2(pdy, pdx);
    const physLen = Math.hypot(pdx, pdy) || 1;

    const sdx = SVG_BELLY_NOSE.x - SVG_BELLY_TAIL.x;
    const sdy = SVG_BELLY_NOSE.y - SVG_BELLY_TAIL.y;
    const svgAngle = Math.atan2(sdy, sdx);
    const svgLen = Math.hypot(sdx, sdy) || 1;

    const topMid = {
      x: (peg.x + string.x) * 0.5,
      y: (peg.y + string.y) * 0.5,
    };
    const bottomMid = {
      x: (tail.x + nose.x) * 0.5,
      y: (tail.y + nose.y) * 0.5,
    };
    const up = { x: Math.sin(physAngle), y: -Math.cos(physAngle) };
    const rawHeight = (bottomMid.x - topMid.x) * up.x + (bottomMid.y - topMid.y) * up.y;

    const xScale = physLen / svgLen;
    const squashRatio = rawHeight / REST_FRAME_HEIGHT;
    const squashFactor = 1 + (squashRatio - 1) * 0.45;
    const yScale = xScale * Math.max(0.92, Math.min(1.1, squashFactor));
    const rotation = physAngle - svgAngle;

    ctx.save();
    ctx.translate(bottomMid.x, bottomMid.y);
    ctx.rotate(rotation);
    ctx.scale(xScale, yScale);
    ctx.translate(-SVG_BELLY_MID.x, -SVG_BELLY_MID.y);
    ctx.drawImage(this.image, 0, 0, RENDER_SVG_W, RENDER_SVG_H);
    ctx.restore();
  }

  private drawFallback(
    ctx: CanvasRenderingContext2D,
    tail: { x: number; y: number },
    nose: { x: number; y: number },
  ) {
    const dx = nose.x - tail.x;
    const dy = nose.y - tail.y;
    const length = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate((tail.x + nose.x) * 0.5, (tail.y + nose.y) * 0.5 - 2);
    ctx.rotate(angle);

    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.ellipse(0, -4, length * 0.42, length * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(length * 0.38, -7);
    ctx.lineTo(length * 0.52, -3);
    ctx.lineTo(length * 0.38, 1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
