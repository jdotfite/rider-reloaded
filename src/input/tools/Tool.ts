import { Vec2 } from '../../math/Vec2';

export interface Tool {
  name: string;
  onMouseDown(worldPos: Vec2, screenPos: Vec2, button: number): void;
  onMouseMove(worldPos: Vec2, screenPos: Vec2): void;
  onMouseUp(worldPos: Vec2, screenPos: Vec2, button: number): void;
  render?(ctx: CanvasRenderingContext2D): void;
  getCursor?(): string | null;
}
