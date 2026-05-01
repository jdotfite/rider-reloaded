import { LINE_WIDTH } from '../constants';
import { Vec2 } from '../math/Vec2';

export interface GeneratedSegment {
  p1: Vec2;
  p2: Vec2;
  leftExtended: boolean;
  rightExtended: boolean;
}

export interface GeneratorControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format?: (value: number) => string;
}

export type GeneratorSettings = Record<string, number>;

export interface GeneratorAsset {
  id: string;
  name: string;
  description: string;
  controls: readonly GeneratorControl[];
  defaultSettings: GeneratorSettings;
  previewMarkup: string;
  createSegments(settings: GeneratorSettings): GeneratedSegment[];
}

export interface GeneratedSegmentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface RawGeneratorAsset {
  id: string;
  name: string;
  description: string;
  controls: readonly GeneratorControl[];
  createSegments(settings: GeneratorSettings): GeneratedSegment[];
}

const DEG_TO_RAD = Math.PI / 180;
const TAU = Math.PI * 2;

const RAW_GENERATORS: RawGeneratorAsset[] = [
  {
    id: 'circle',
    name: 'Circle',
    description: 'Drop a clean loop of connected lines for bowls, hoops, and round scenery.',
    controls: [
      { key: 'radius', label: 'Radius', min: 12, max: 240, step: 2, defaultValue: 56, format: formatUnit('u') },
      { key: 'segments', label: 'Detail', min: 12, max: 72, step: 1, defaultValue: 28, format: formatUnit(' lines') },
    ],
    createSegments(settings) {
      const radius = Math.max(1, settings.radius ?? 56);
      const segmentCount = Math.max(3, Math.round(settings.segments ?? 28));
      const points: Vec2[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const angle = -Math.PI / 2 + (i / segmentCount) * TAU;
        points.push(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
      }

      return createPolylineSegments(points, true);
    },
  },
  {
    id: 'arc',
    name: 'Arc',
    description: 'Make a smooth arch or half-pipe with adjustable sweep and rotation.',
    controls: [
      { key: 'radius', label: 'Radius', min: 12, max: 240, step: 2, defaultValue: 68, format: formatUnit('u') },
      { key: 'sweep', label: 'Sweep', min: 30, max: 330, step: 5, defaultValue: 180, format: formatDegrees },
      { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 5, defaultValue: 0, format: formatDegrees },
      { key: 'segments', label: 'Detail', min: 6, max: 72, step: 1, defaultValue: 24, format: formatUnit(' lines') },
    ],
    createSegments(settings) {
      const radius = Math.max(1, settings.radius ?? 68);
      const sweep = Math.max(1, settings.sweep ?? 180) * DEG_TO_RAD;
      const rotation = (settings.rotation ?? 0) * DEG_TO_RAD;
      const segmentCount = Math.max(1, Math.round(settings.segments ?? 24));
      const middle = -Math.PI / 2 + rotation;
      const start = middle - sweep / 2;
      const points: Vec2[] = [];

      for (let i = 0; i <= segmentCount; i++) {
        const t = i / segmentCount;
        const angle = start + sweep * t;
        points.push(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
      }

      return createPolylineSegments(points, false);
    },
  },
  {
    id: 'line-array',
    name: 'Line Array',
    description: 'Lay down evenly spaced parallel lines for ladders, boosts, and pattern work.',
    controls: [
      { key: 'count', label: 'Count', min: 2, max: 12, step: 1, defaultValue: 4, format: formatUnit(' lines') },
      { key: 'length', label: 'Length', min: 24, max: 260, step: 2, defaultValue: 96, format: formatUnit('u') },
      { key: 'spacing', label: 'Spacing', min: 6, max: 64, step: 1, defaultValue: 18, format: formatUnit('u') },
      { key: 'angle', label: 'Angle', min: -90, max: 90, step: 5, defaultValue: 0, format: formatDegrees },
    ],
    createSegments(settings) {
      const count = Math.max(1, Math.round(settings.count ?? 4));
      const length = Math.max(2, settings.length ?? 96);
      const spacing = Math.max(0, settings.spacing ?? 18);
      const angle = (settings.angle ?? 0) * DEG_TO_RAD;
      const direction = new Vec2(Math.cos(angle), Math.sin(angle));
      const perpendicular = new Vec2(-direction.y, direction.x);
      const startBase = direction.scale(-length / 2);
      const endBase = direction.scale(length / 2);
      const segments: GeneratedSegment[] = [];

      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spacing;
        const delta = perpendicular.scale(offset);
        segments.push({
          p1: startBase.add(delta),
          p2: endBase.add(delta),
          leftExtended: false,
          rightExtended: false,
        });
      }

      return segments;
    },
  },
];

export function buildGeneratorAssets(): GeneratorAsset[] {
  return RAW_GENERATORS.map((raw) => {
    const defaultSettings = buildDefaultSettings(raw.controls);
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      controls: raw.controls,
      defaultSettings,
      previewMarkup: buildPreviewMarkup(raw.createSegments(defaultSettings)),
      createSegments(settings) {
        return raw.createSegments(sanitizeSettings(raw.controls, settings));
      },
    };
  });
}

export function sanitizeGeneratorSettings(
  asset: GeneratorAsset,
  settings: GeneratorSettings,
): GeneratorSettings {
  return sanitizeSettings(asset.controls, settings, asset.defaultSettings);
}

export function formatGeneratorControlValue(control: GeneratorControl, value: number): string {
  return control.format?.(value) ?? Number(value.toFixed(2)).toString();
}

export function buildGeneratorPreviewMarkup(
  asset: GeneratorAsset,
  settings: GeneratorSettings,
  rideSideColor?: string,
): string {
  return buildPreviewMarkup(asset.createSegments(settings), rideSideColor);
}

export function computeGeneratedSegmentBounds(
  segments: readonly GeneratedSegment[],
): GeneratedSegmentBounds {
  if (segments.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
      width: 1,
      height: 1,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const segment of segments) {
    minX = Math.min(minX, segment.p1.x, segment.p2.x);
    minY = Math.min(minY, segment.p1.y, segment.p2.y);
    maxX = Math.max(maxX, segment.p1.x, segment.p2.x);
    maxY = Math.max(maxY, segment.p1.y, segment.p2.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function buildDefaultSettings(controls: readonly GeneratorControl[]): GeneratorSettings {
  const defaults: GeneratorSettings = {};
  for (const control of controls) {
    defaults[control.key] = control.defaultValue;
  }
  return defaults;
}

function sanitizeSettings(
  controls: readonly GeneratorControl[],
  settings: GeneratorSettings,
  fallback: GeneratorSettings = buildDefaultSettings(controls),
): GeneratorSettings {
  const sanitized: GeneratorSettings = {};
  for (const control of controls) {
    const rawValue = settings[control.key] ?? fallback[control.key] ?? control.defaultValue;
    const clamped = Math.max(control.min, Math.min(control.max, rawValue));
    const stepped = control.step > 0
      ? control.min + Math.round((clamped - control.min) / control.step) * control.step
      : clamped;
    sanitized[control.key] = Number(stepped.toFixed(6));
  }
  return sanitized;
}

function createPolylineSegments(points: readonly Vec2[], closed: boolean): GeneratedSegment[] {
  if (points.length < 2) return [];

  const segments: GeneratedSegment[] = [];
  if (closed) {
    for (let i = 0; i < points.length; i++) {
      segments.push({
        p1: points[i].clone(),
        p2: points[(i + 1) % points.length].clone(),
        leftExtended: true,
        rightExtended: true,
      });
    }
    return segments;
  }

  for (let i = 1; i < points.length; i++) {
    segments.push({
      p1: points[i - 1].clone(),
      p2: points[i].clone(),
      leftExtended: i > 1,
      rightExtended: i < points.length - 1,
    });
  }
  return segments;
}

export function buildPreviewMarkup(segments: readonly GeneratedSegment[], rideSideColor?: string): string {
  const bounds = computeGeneratedSegmentBounds(segments);
  const padding = Math.max(6, LINE_WIDTH * 2);
  const viewBoxX = bounds.minX - padding;
  const viewBoxY = bounds.minY - padding;
  const viewBoxWidth = bounds.width + padding * 2;
  const viewBoxHeight = bounds.height + padding * 2;
  const trackCommands: string[] = [];
  const rideCommands: string[] = [];
  const rideOffset = LINE_WIDTH * 0.9;

  let prevX = Number.NaN;
  let prevY = Number.NaN;
  for (const segment of segments) {
    if (!pointsMatch(prevX, prevY, segment.p1.x, segment.p1.y)) {
      trackCommands.push(`M ${formatSvgNumber(segment.p1.x)} ${formatSvgNumber(segment.p1.y)}`);
    }
    trackCommands.push(`L ${formatSvgNumber(segment.p2.x)} ${formatSvgNumber(segment.p2.y)}`);
    prevX = segment.p2.x;
    prevY = segment.p2.y;

    // Ride-side stripe: left-hand normal (-dy, dx) points toward the rideable side
    if (rideSideColor) {
      const dx = segment.p2.x - segment.p1.x;
      const dy = segment.p2.y - segment.p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.01) {
        const nx = (-dy / len) * rideOffset;
        const ny = (dx / len) * rideOffset;
        rideCommands.push(
          `M ${formatSvgNumber(segment.p1.x + nx)} ${formatSvgNumber(segment.p1.y + ny)}`,
          `L ${formatSvgNumber(segment.p2.x + nx)} ${formatSvgNumber(segment.p2.y + ny)}`,
        );
      }
    }
  }

  const parts = [
    `<svg viewBox="${formatSvgNumber(viewBoxX)} ${formatSvgNumber(viewBoxY)} ${formatSvgNumber(viewBoxWidth)} ${formatSvgNumber(viewBoxHeight)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`,
    `<path d="${trackCommands.join(' ')}" fill="none" stroke="currentColor" stroke-width="${LINE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ];
  if (rideSideColor && rideCommands.length > 0) {
    parts.push(`<path d="${rideCommands.join(' ')}" fill="none" stroke="${rideSideColor}" stroke-width="${LINE_WIDTH * 0.55}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

function pointsMatch(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < 0.001 && Math.abs(ay - by) < 0.001;
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatUnit(suffix: string) {
  return (value: number) => `${Number(value.toFixed(2)).toString()}${suffix}`;
}

function formatDegrees(value: number): string {
  return `${Math.round(value)}°`;
}
