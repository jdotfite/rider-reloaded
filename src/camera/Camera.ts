import { Vec2 } from '../math/Vec2';

export class Camera {
  position: Vec2 = new Vec2(0, 0); // world position of screen center
  zoom: number = 1;
  private _width: number = 0;
  private _height: number = 0;

  get width(): number { return this._width; }
  get height(): number { return this._height; }

  resize(w: number, h: number) {
    this._width = w;
    this._height = h;
  }

  /** Convert world coords to screen coords */
  worldToScreen(world: Vec2): Vec2 {
    return new Vec2(
      (world.x - this.position.x) * this.zoom + this._width / 2,
      (world.y - this.position.y) * this.zoom + this._height / 2
    );
  }

  /** Convert screen coords to world coords */
  screenToWorld(screen: Vec2): Vec2 {
    return new Vec2(
      (screen.x - this._width / 2) / this.zoom + this.position.x,
      (screen.y - this._height / 2) / this.zoom + this.position.y
    );
  }

  /** Pan by a screen-space delta */
  pan(screenDx: number, screenDy: number) {
    this.position.x -= screenDx / this.zoom;
    this.position.y -= screenDy / this.zoom;
  }

  /** Zoom centered on a screen point */
  zoomAt(screenX: number, screenY: number, factor: number) {
    const worldBefore = this.screenToWorld(new Vec2(screenX, screenY));
    this.zoom *= factor;
    this.zoom = Math.max(0.1, Math.min(30, this.zoom));
    const worldAfter = this.screenToWorld(new Vec2(screenX, screenY));
    this.position.x -= worldAfter.x - worldBefore.x;
    this.position.y -= worldAfter.y - worldBefore.y;
  }

  /** Apply camera transform to canvas context */
  applyTransform(ctx: CanvasRenderingContext2D, pixelRatio: number = 1) {
    ctx.setTransform(
      this.zoom * pixelRatio, 0,
      0, this.zoom * pixelRatio,
      (this._width / 2 - this.position.x * this.zoom) * pixelRatio,
      (this._height / 2 - this.position.y * this.zoom) * pixelRatio
    );
  }
}
