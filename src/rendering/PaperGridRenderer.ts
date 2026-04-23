import { Camera } from '../camera/Camera';
import {
  clampEditorGridSize,
  DEFAULT_EDITOR_GRID_MAJOR_EVERY,
} from '../editor/GridMath';
import { Vec2 } from '../math/Vec2';

const MIN_MINOR_SPACING_PX = 14;
const MIN_MAJOR_SPACING_PX = 24;

export class PaperGridRenderer {
  constructor(
    private camera: Camera,
    private getSettings: () => { enabled: boolean; size: number; majorEvery?: number },
  ) {}

  render(ctx: CanvasRenderingContext2D) {
    const settings = this.getSettings();
    if (!settings.enabled) return;

    const baseStep = clampEditorGridSize(settings.size);
    const majorEvery = Math.max(2, Math.round(settings.majorEvery ?? DEFAULT_EDITOR_GRID_MAJOR_EVERY));
    const baseSpacingPx = baseStep * this.camera.zoom;
    const bounds = this.getVisibleBounds(baseStep);

    const minorMultiplier = Math.max(1, Math.ceil(MIN_MINOR_SPACING_PX / Math.max(baseSpacingPx, 1)));
    const minorStep = baseStep * minorMultiplier;

    const majorBaseStep = baseStep * majorEvery;
    const majorSpacingPx = majorBaseStep * this.camera.zoom;
    const majorMultiplier = Math.max(1, Math.ceil(MIN_MAJOR_SPACING_PX / Math.max(majorSpacingPx, 1)));
    const majorStep = majorBaseStep * majorMultiplier;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    if (baseSpacingPx >= 6) {
      this.drawGridLayer(
        ctx,
        bounds,
        minorStep,
        'rgba(32, 34, 38, 0.06)',
        majorStep,
      );
    }

    this.drawGridLayer(
      ctx,
      bounds,
      majorStep,
      'rgba(32, 34, 38, 0.1)',
    );

    ctx.restore();
  }

  private drawGridLayer(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    step: number,
    color: string,
    skipStep?: number,
  ) {
    if (!Number.isFinite(step) || step <= 0) return;

    const width = 1 / this.camera.zoom;
    const epsilon = step * 0.0001;

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();

    const startX = Math.floor(bounds.minX / step);
    const endX = Math.ceil(bounds.maxX / step);
    for (let ix = startX; ix <= endX; ix++) {
      const x = ix * step;
      if (skipStep && this.isAlignedToStep(x, skipStep, epsilon)) continue;
      ctx.moveTo(x, bounds.minY);
      ctx.lineTo(x, bounds.maxY);
    }

    const startY = Math.floor(bounds.minY / step);
    const endY = Math.ceil(bounds.maxY / step);
    for (let iy = startY; iy <= endY; iy++) {
      const y = iy * step;
      if (skipStep && this.isAlignedToStep(y, skipStep, epsilon)) continue;
      ctx.moveTo(bounds.minX, y);
      ctx.lineTo(bounds.maxX, y);
    }

    ctx.stroke();
  }

  private isAlignedToStep(value: number, step: number, epsilon: number): boolean {
    const snapped = Math.round(value / step) * step;
    return Math.abs(snapped - value) <= epsilon;
  }

  private getVisibleBounds(padding: number) {
    const topLeft = this.camera.screenToWorld(new Vec2(0, 0));
    const bottomRight = this.camera.screenToWorld(new Vec2(
      this.camera.width,
      this.camera.height,
    ));

    return {
      minX: Math.min(topLeft.x, bottomRight.x) - padding,
      minY: Math.min(topLeft.y, bottomRight.y) - padding,
      maxX: Math.max(topLeft.x, bottomRight.x) + padding,
      maxY: Math.max(topLeft.y, bottomRight.y) + padding,
    };
  }
}
