import { Camera } from '../camera/Camera';
import { COLOR_BACKGROUND } from '../constants';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  private renderCallbacks: Array<(ctx: CanvasRenderingContext2D) => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private pixelRatio = 1;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') {
      const container = this.canvas.parentElement;
      if (container) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
      }
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.canvas.width = Math.round(w * this.pixelRatio);
    this.canvas.height = Math.round(h * this.pixelRatio);
    this.camera.resize(w, h);
  }

  addRenderCallback(cb: (ctx: CanvasRenderingContext2D) => void) {
    this.renderCallbacks.push(cb);
  }

  render() {
    const { ctx, camera } = this;

    // Clear
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);

    // Apply camera
    camera.applyTransform(ctx, this.pixelRatio);

    // Draw origin crosshair
    this.drawOriginMarker(ctx);

    // Render callbacks (lines, rider, etc.)
    for (const cb of this.renderCallbacks) {
      cb(ctx);
    }

    // Reset transform for HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawOriginMarker(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 20);
    ctx.stroke();
  }
}
