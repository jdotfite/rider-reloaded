import cloud1Raw from '../img/cloud-1.svg?raw';
import cloud2Raw from '../img/cloud-2.svg?raw';
import cloud3Raw from '../img/cloud-3.svg?raw';
import cloud4Raw from '../img/cloud-4.svg?raw';
import { Vec2 } from '../math/Vec2';
import { LINE_WIDTH } from '../constants';
import { splitSvgPathSubpaths } from './svgPath';
import { type GeneratorAsset, type GeneratorSettings, buildPreviewMarkup as buildGeneratorPreviewSvg } from '../generators/catalog';

export interface StampSegment {
  p1: Vec2;
  p2: Vec2;
  leftExtended: boolean;
  rightExtended: boolean;
}

export interface StampAsset {
  id: string;
  name: string;
  previewMarkup: string;
  width: number;
  height: number;
  segments: StampSegment[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let scratchSvg: SVGSVGElement | null = null;

interface RawStampAsset {
  id: string;
  name: string;
  svg: string;
  targetWidth: number;
}

const RAW_CLOUD_ASSETS: RawStampAsset[] = [
  { id: 'cloud-1', name: 'Drift Cloud', svg: cloud1Raw, targetWidth: 130 },
  { id: 'cloud-2', name: 'Long Cloud', svg: cloud2Raw, targetWidth: 118 },
  { id: 'cloud-3', name: 'Puff Cloud', svg: cloud3Raw, targetWidth: 82 },
  { id: 'cloud-4', name: 'Storm Cloud', svg: cloud4Raw, targetWidth: 122 },
];

export function buildCloudStampAssets(): StampAsset[] {
  return RAW_CLOUD_ASSETS.map(asset => createStampAsset(asset));
}

function createStampAsset(asset: RawStampAsset): StampAsset {
  const parser = new DOMParser();
  const doc = parser.parseFromString(asset.svg, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error(`Invalid SVG stamp asset: ${asset.id}`);
  }
  const subpaths: Vec2[][] = [];
  for (const pathEl of svg.querySelectorAll('path')) {
    const d = pathEl.getAttribute('d');
    if (!d) continue;
    for (const subpathD of splitSvgPathSubpaths(d)) {
      const points = samplePathPoints(subpathD);
      if (points.length >= 2) {
        subpaths.push(points);
      }
    }
  }

  const bounds = computeBounds(subpaths.flat());
  const scale = asset.targetWidth / Math.max(bounds.width, 1);
  const center = new Vec2(
    bounds.minX + bounds.width / 2,
    bounds.minY + bounds.height / 2,
  );

  const segments: StampSegment[] = [];
  for (const points of subpaths) {
    const normalized = points
      .map(point => new Vec2(
        (point.x - center.x) * scale,
        (point.y - center.y) * scale,
      ))
      .filter((point, index, arr) => {
        if (index === 0) return true;
        return arr[index - 1].distanceToSq(point) > 0.04;
      });

    for (let i = 1; i < normalized.length; i++) {
      const p1 = normalized[i - 1];
      const p2 = normalized[i];
      if (p1.distanceToSq(p2) < 0.04) continue;
      segments.push({
        p1,
        p2,
        leftExtended: i > 1,
        rightExtended: i < normalized.length - 1,
      });
    }
  }

  return {
    id: asset.id,
    name: asset.name,
    previewMarkup: buildPreviewMarkup(segments, bounds.width * scale, bounds.height * scale),
    width: bounds.width * scale,
    height: bounds.height * scale,
    segments,
  };
}

function samplePathPoints(d: string): Vec2[] {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  getScratchSvg().appendChild(path);

  const totalLength = path.getTotalLength();
  const step = Math.max(2.25, Math.min(6, totalLength / 120));
  const points: Vec2[] = [];

  for (let distance = 0; distance <= totalLength; distance += step) {
    const sample = path.getPointAtLength(Math.min(distance, totalLength));
    points.push(new Vec2(sample.x, sample.y));
  }

  const endSample = path.getPointAtLength(totalLength);
  const endPoint = new Vec2(endSample.x, endSample.y);
  if (points.length === 0 || points[points.length - 1].distanceToSq(endPoint) > 0.04) {
    points.push(endPoint);
  }

  path.remove();
  return points;
}

function computeBounds(points: Vec2[]) {
  if (points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: 1,
      height: 1,
    };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function getScratchSvg(): SVGSVGElement {
  if (scratchSvg) return scratchSvg;
  scratchSvg = document.createElementNS(SVG_NS, 'svg');
  scratchSvg.setAttribute('width', '0');
  scratchSvg.setAttribute('height', '0');
  scratchSvg.setAttribute('aria-hidden', 'true');
  scratchSvg.style.position = 'absolute';
  scratchSvg.style.pointerEvents = 'none';
  scratchSvg.style.opacity = '0';
  scratchSvg.style.overflow = 'hidden';
  document.body.appendChild(scratchSvg);
  return scratchSvg;
}

function buildPreviewMarkup(segments: StampSegment[], width: number, height: number): string {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const commands: string[] = [];

  let prevX = Number.NaN;
  let prevY = Number.NaN;
  for (const segment of segments) {
    if (!pointsMatch(prevX, prevY, segment.p1.x, segment.p1.y)) {
      commands.push(`M ${formatSvgNumber(segment.p1.x)} ${formatSvgNumber(segment.p1.y)}`);
    }
    commands.push(`L ${formatSvgNumber(segment.p2.x)} ${formatSvgNumber(segment.p2.y)}`);
    prevX = segment.p2.x;
    prevY = segment.p2.y;
  }

  return [
    `<svg viewBox="${formatSvgNumber(-halfWidth)} ${formatSvgNumber(-halfHeight)} ${formatSvgNumber(width)} ${formatSvgNumber(height)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`,
    `<path d="${commands.join(' ')}" fill="none" stroke="currentColor" stroke-width="${LINE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');
}

function pointsMatch(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < 0.001 && Math.abs(ay - by) < 0.001;
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Wrap SVG cloud stamps as GeneratorAssets so they share the same placement UI */
export function buildCloudGeneratorAssets(): GeneratorAsset[] {
  const stampAssets = buildCloudStampAssets();
  return stampAssets.map((stamp) => {
    const scaleControl = {
      key: 'scale',
      label: 'Size',
      min: 0.3,
      max: 3.0,
      step: 0.1,
      defaultValue: 1.0,
      format: (v: number) => `${v.toFixed(1)}×`,
    };
    const defaultSettings: GeneratorSettings = { scale: 1.0 };

    const asset: GeneratorAsset = {
      id: stamp.id,
      name: stamp.name,
      description: 'A scenery cloud shape. Works with any line type and can be flipped.',
      controls: [scaleControl],
      defaultSettings,
      previewMarkup: buildGeneratorPreviewSvg(
        stamp.segments.map(s => ({ p1: s.p1, p2: s.p2, leftExtended: s.leftExtended, rightExtended: s.rightExtended })),
      ),
      createSegments(settings: GeneratorSettings) {
        const scale = Math.max(0.01, settings.scale ?? 1.0);
        return stamp.segments.map((s) => ({
          p1: s.p1.scale(scale),
          p2: s.p2.scale(scale),
          leftExtended: s.leftExtended,
          rightExtended: s.rightExtended,
        }));
      },
    };
    return asset;
  });
}
