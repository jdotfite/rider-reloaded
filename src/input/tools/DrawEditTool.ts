import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';

interface AmbientEditTool extends Tool {
  canStartInteraction(worldPos: Vec2): boolean;
  clearSelection(): void;
}

type PointerOwner = 'draw' | AmbientEditTool | null;

export class DrawEditTool implements Tool {
  name: string;
  private pointerOwner: PointerOwner = null;
  private ambientTools: AmbientEditTool[];

  constructor(
    name: string,
    private drawTool: Tool,
    ...ambientTools: AmbientEditTool[]
  ) {
    this.name = name;
    this.ambientTools = ambientTools;
  }

  onMouseDown(worldPos: Vec2, screenPos: Vec2, button: number): void {
    for (const ambientTool of this.ambientTools) {
      if (!ambientTool.canStartInteraction(worldPos)) continue;
      this.pointerOwner = ambientTool;
      for (const otherAmbient of this.ambientTools) {
        if (otherAmbient !== ambientTool) {
          otherAmbient.clearSelection();
        }
      }
      ambientTool.onMouseDown(worldPos, screenPos, button);
      return;
    }

    this.pointerOwner = 'draw';
    for (const ambientTool of this.ambientTools) {
      ambientTool.clearSelection();
    }
    this.drawTool.onMouseDown(worldPos, screenPos, button);
  }

  onMouseMove(worldPos: Vec2, screenPos: Vec2): void {
    if (this.pointerOwner === 'draw') {
      this.drawTool.onMouseMove(worldPos, screenPos);
      return;
    }

    if (this.pointerOwner) {
      this.pointerOwner.onMouseMove(worldPos, screenPos);
      return;
    }

    for (const ambientTool of this.ambientTools) {
      ambientTool.onMouseMove(worldPos, screenPos);
    }
  }

  onMouseUp(worldPos: Vec2, screenPos: Vec2, button: number): void {
    if (this.pointerOwner === 'draw') {
      this.drawTool.onMouseUp(worldPos, screenPos, button);
    } else if (this.pointerOwner) {
      this.pointerOwner.onMouseUp(worldPos, screenPos, button);
      this.pointerOwner.onMouseMove(worldPos, screenPos);
    }
    this.pointerOwner = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.drawTool.render?.(ctx);
    for (const ambientTool of this.ambientTools) {
      ambientTool.render?.(ctx);
    }
  }

  getCursor(): string | null {
    for (const ambientTool of this.ambientTools) {
      const cursor = ambientTool.getCursor?.();
      if (cursor) return cursor;
    }
    return this.drawTool.getCursor?.() ?? null;
  }

  onKeyDown(e: KeyboardEvent): void {
    for (const ambientTool of this.ambientTools) {
      ambientTool.onKeyDown?.(e);
      if (e.defaultPrevented) return;
    }
    this.drawTool.onKeyDown?.(e);
  }
}
