import { Camera } from '../camera/Camera';
import { COLOR_BACKGROUND } from '../constants';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  private renderCallbacks: Array<(ctx: CanvasRenderingContext2D) => void> = [];

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const container = this.canvas.parentElement!;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.resize(w, h);
  }

  addRenderCallback(cb: (ctx: CanvasRenderingContext2D) => void) {
    this.renderCallbacks.push(cb);
  }

  render() {
    const { ctx, canvas, camera } = this;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply camera
    camera.applyTransform(ctx);

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
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 20);
    ctx.stroke();
  }
}
