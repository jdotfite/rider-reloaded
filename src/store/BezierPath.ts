import { Vec2 } from '../math/Vec2';
import { LineType } from '../physics/lines/LineTypes';

export interface BezierAnchor {
  position: Vec2;
  handleIn: Vec2;   // relative to position (incoming tangent)
  handleOut: Vec2;  // relative to position (outgoing tangent)
  smooth: boolean;  // true = handles mirror angle when dragged
}

export interface BezierPath {
  id: number;
  anchors: BezierAnchor[];
  lineType: LineType;
  layer: number;
  lineIds: number[];  // generated physics line segments
}

export interface SerializedBezierAnchor {
  px: number; py: number;
  hix: number; hiy: number;
  hox: number; hoy: number;
  smooth: boolean;
}

export interface SerializedBezierPath {
  id: number;
  anchors: SerializedBezierAnchor[];
  lineType: number;
  layer: number;
  lineIds: number[];
}

export function serializeAnchor(a: BezierAnchor): SerializedBezierAnchor {
  return {
    px: a.position.x, py: a.position.y,
    hix: a.handleIn.x, hiy: a.handleIn.y,
    hox: a.handleOut.x, hoy: a.handleOut.y,
    smooth: a.smooth,
  };
}

export function deserializeAnchor(s: SerializedBezierAnchor): BezierAnchor {
  return {
    position: new Vec2(s.px, s.py),
    handleIn: new Vec2(s.hix, s.hiy),
    handleOut: new Vec2(s.hox, s.hoy),
    smooth: s.smooth,
  };
}

export function cloneAnchor(a: BezierAnchor): BezierAnchor {
  return {
    position: a.position.clone(),
    handleIn: a.handleIn.clone(),
    handleOut: a.handleOut.clone(),
    smooth: a.smooth,
  };
}

export function cloneBezierPath(p: BezierPath): BezierPath {
  return {
    id: p.id,
    anchors: p.anchors.map(cloneAnchor),
    lineType: p.lineType,
    layer: p.layer,
    lineIds: [...p.lineIds],
  };
}
