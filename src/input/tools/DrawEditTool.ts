import { Vec2 } from '../../math/Vec2';
import { Tool } from './Tool';

interface AmbientEditTool extends Tool {
  canStartInteraction(worldPos: Vec2): boolean;
  clearSelection(): void;
}

type PointerOwner = 'draw' | 'edit' | null;

export class DrawEditTool implements Tool {
  name: string;
  private pointerOwner: PointerOwner = null;

  constructor(
    name: string,
    private drawTool: Tool,
    private editTool: AmbientEditTool,
  ) {
    this.name = name;
  }

  onMouseDown(worldPos: Vec2, screenPos: Vec2, button: number): void {
    if (this.editTool.canStartInteraction(worldPos)) {
      this.pointerOwner = 'edit';
      this.editTool.onMouseDown(worldPos, screenPos, button);
      return;
    }

    this.pointerOwner = 'draw';
    this.editTool.clearSelection();
    this.drawTool.onMouseDown(worldPos, screenPos, button);
  }

  onMouseMove(worldPos: Vec2, screenPos: Vec2): void {
    if (this.pointerOwner === 'draw') {
      this.drawTool.onMouseMove(worldPos, screenPos);
      return;
    }

    this.editTool.onMouseMove(worldPos, screenPos);
  }

  onMouseUp(worldPos: Vec2, screenPos: Vec2, button: number): void {
    if (this.pointerOwner === 'draw') {
      this.drawTool.onMouseUp(worldPos, screenPos, button);
    } else {
      this.editTool.onMouseUp(worldPos, screenPos, button);
      this.editTool.onMouseMove(worldPos, screenPos);
    }
    this.pointerOwner = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.drawTool.render?.(ctx);
    this.editTool.render?.(ctx);
  }

  getCursor(): string | null {
    return this.editTool.getCursor?.() ?? this.drawTool.getCursor?.() ?? null;
  }

  onKeyDown(e: KeyboardEvent): void {
    this.editTool.onKeyDown?.(e);
    if (!e.defaultPrevented) {
      this.drawTool.onKeyDown?.(e);
    }
  }
}
