import { Vec2 } from '../math/Vec2';

export interface PortalSketchMetrics {
  halfSpan: number;
  footY: number;
  shoulderX: number;
  shoulderY: number;
  crownY: number;
  backOffset: Vec2;
  fieldCenter: Vec2;
  fieldRx: number;
  fieldRy: number;
  shadowCenter: Vec2;
  shadowRx: number;
  shadowRy: number;
  lipStartX: number;
  lipEndX: number;
  lipY: number;
  lipDepth: number;
  stubInset: number;
  stubLift: number;
}

export interface PortalCubicSegment {
  c1: Vec2;
  c2: Vec2;
  to: Vec2;
}

export interface PortalCubicPath {
  start: Vec2;
  segments: PortalCubicSegment[];
}

export function buildPortalSketchMetrics(length: number, radius: number): PortalSketchMetrics {
  const halfSpan = Math.max(6.5, length * 0.31);
  const footY = 0;
  const archHeight = Math.max(radius * 2.2, halfSpan * 2.02);
  const shoulderX = halfSpan * 0.72;
  const shoulderY = -archHeight * 0.52;
  const crownY = -archHeight;
  const backOffset = new Vec2(halfSpan * 0.22, -archHeight * 0.12);
  const fieldCenter = new Vec2(backOffset.x * 0.28, crownY * 0.42);
  const fieldRx = Math.max(4.2, halfSpan * 0.54);
  const fieldRy = Math.max(5.2, archHeight * 0.32);
  const shadowCenter = new Vec2(backOffset.x * 0.05, footY + radius * 0.05);
  const shadowRx = Math.max(4.2, halfSpan * 0.52);
  const shadowRy = Math.max(0.9, radius * 0.1);
  const lipStartX = halfSpan * 0.7;
  const lipEndX = halfSpan * 0.7;
  const lipY = footY + radius * 0.015;
  const lipDepth = Math.max(0.8, archHeight * 0.05);
  const stubInset = Math.max(0.9, halfSpan * 0.045);
  const stubLift = Math.max(0.9, archHeight * 0.06);

  return {
    halfSpan,
    footY,
    shoulderX,
    shoulderY,
    crownY,
    backOffset,
    fieldCenter,
    fieldRx,
    fieldRy,
    shadowCenter,
    shadowRx,
    shadowRy,
    lipStartX,
    lipEndX,
    lipY,
    lipDepth,
    stubInset,
    stubLift,
  };
}

export function buildPortalArchPath(metrics: PortalSketchMetrics, offset = new Vec2()): PortalCubicPath {
  const { halfSpan, footY, crownY } = metrics;
  const kappa = 0.5522847498307936;
  const ry = footY - crownY;
  return {
    start: offset.add(new Vec2(-halfSpan, footY)),
    segments: [
      {
        c1: offset.add(new Vec2(-halfSpan, footY - ry * kappa)),
        c2: offset.add(new Vec2(-halfSpan * kappa, crownY)),
        to: offset.add(new Vec2(0, crownY)),
      },
      {
        c1: offset.add(new Vec2(halfSpan * kappa, crownY)),
        c2: offset.add(new Vec2(halfSpan, footY - ry * kappa)),
        to: offset.add(new Vec2(halfSpan, footY)),
      },
    ],
  };
}

export function buildPortalLipPath(metrics: PortalSketchMetrics): PortalCubicPath {
  const kappa = 0.5522847498307936;
  const sag = metrics.lipDepth;
  return {
    start: new Vec2(-metrics.lipStartX, metrics.lipY),
    segments: [
      {
        c1: new Vec2(-metrics.lipStartX, metrics.lipY + sag * kappa),
        c2: new Vec2(-metrics.lipEndX * kappa, metrics.lipY + sag),
        to: new Vec2(0, metrics.lipY + sag),
      },
      {
        c1: new Vec2(metrics.lipEndX * kappa, metrics.lipY + sag),
        c2: new Vec2(metrics.lipEndX, metrics.lipY + sag * kappa),
        to: new Vec2(metrics.lipEndX, metrics.lipY),
      },
    ],
  };
}

export function getPortalFrontStubSegments(metrics: PortalSketchMetrics): Array<{ start: Vec2; end: Vec2 }> {
  return [
    {
      start: new Vec2(-metrics.halfSpan + metrics.stubInset, metrics.footY),
      end: new Vec2(-metrics.halfSpan + metrics.stubInset * 0.4, metrics.footY - metrics.stubLift),
    },
    {
      start: new Vec2(metrics.halfSpan - metrics.stubInset, metrics.footY),
      end: new Vec2(metrics.halfSpan - metrics.stubInset * 0.4, metrics.footY - metrics.stubLift),
    },
  ];
}

export function tracePortalPath(ctx: CanvasRenderingContext2D, path: PortalCubicPath) {
  ctx.moveTo(path.start.x, path.start.y);
  for (const segment of path.segments) {
    ctx.bezierCurveTo(
      segment.c1.x,
      segment.c1.y,
      segment.c2.x,
      segment.c2.y,
      segment.to.x,
      segment.to.y,
    );
  }
}

export function portalPathToSvg(path: PortalCubicPath): string {
  const commands = [`M ${path.start.x} ${path.start.y}`];
  for (const segment of path.segments) {
    commands.push(
      `C ${segment.c1.x} ${segment.c1.y} ${segment.c2.x} ${segment.c2.y} ${segment.to.x} ${segment.to.y}`,
    );
  }
  return commands.join(' ');
}
