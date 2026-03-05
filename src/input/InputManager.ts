import { Vec2 } from '../math/Vec2';
import { Camera } from '../camera/Camera';
import { Tool } from './tools/Tool';
import { GameState } from '../game/GameState';

export class InputManager {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private tool: Tool | null = null;
  private isPanning = false;
  private quickErasing = false;
  private isSpaceDown = false;
  private spacePanned = false;
  private activeMousePointerId: number | null = null;
  private touchPointers: Map<number, Vec2> = new Map();
  private touchDrawingPointerId: number | null = null;
  private touchGestureCenter: Vec2 | null = null;
  private touchGestureDistance = 0;
  private lastMouse = new Vec2();
  private mouseDown = false;

  onPlayPauseToggle: (() => void) | null = null;
  onStop: (() => void) | null = null;
  onFitView: (() => void) | null = null;
  onUndo: (() => void) | null = null;
  onRedo: (() => void) | null = null;
  onClearTrack: (() => void) | null = null;
  onQuickEraseStart: ((worldPos: Vec2) => void) | null = null;
  onQuickEraseMove: ((worldPos: Vec2) => void) | null = null;
  onQuickEraseEnd: (() => void) | null = null;
  onSaveTrack: (() => void) | null = null;
  onLoadTrack: (() => void) | null = null;
  onToolSwitch: ((name: string) => void) | null = null;
  onLineTypeSwitch: ((type: string) => void) | null = null;
  getGameState: (() => GameState) | null = null;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.setupEvents();
  }

  setTool(tool: Tool) {
    this.tool = tool;
  }

  private setupEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private screenPos(e: { clientX: number; clientY: number }): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vec2(e.clientX - rect.left, e.clientY - rect.top);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.onMousePointerDown(e);
      return;
    }

    this.onTouchPointerDown(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.onMousePointerMove(e);
      return;
    }

    this.onTouchPointerMove(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.onMousePointerUp(e);
      return;
    }

    this.onTouchPointerUp(e);
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.onMousePointerCancel(e);
      return;
    }

    this.onTouchPointerCancel(e);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const sp = this.screenPos(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.zoomAt(sp.x, sp.y, factor);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in an input
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.isSpaceDown) {
        this.isSpaceDown = true;
        this.spacePanned = false;
      }
    }

    if (e.ctrlKey && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) {
        this.onRedo?.();
      } else {
        this.onUndo?.();
      }
      return;
    }

    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      this.onSaveTrack?.();
      return;
    }

    if (e.ctrlKey && e.code === 'KeyO') {
      e.preventDefault();
      this.onLoadTrack?.();
      return;
    }

    if (e.code === 'Escape') {
      e.preventDefault();
      this.onStop?.();
    }

    if (e.code === 'Delete') {
      e.preventDefault();
      this.onClearTrack?.();
    }

    if (e.code === 'KeyF' && !(this.tool && this.tool.name === 'edit')) {
      e.preventDefault();
      this.onFitView?.();
    }

    if (e.code === 'Digit1') this.onToolSwitch?.('pencil');
    if (e.code === 'Digit2') this.onToolSwitch?.('line');
    if (e.code === 'Digit3') this.onToolSwitch?.('eraser');
    if (e.code === 'Digit4') this.onToolSwitch?.('curve');
    if (e.code === 'Digit5') this.onToolSwitch?.('flag');
    if (e.code === 'Digit6') this.onToolSwitch?.('select');
    if (e.code === 'Digit7') this.onToolSwitch?.('edit');
    if (e.code === 'KeyQ') this.onLineTypeSwitch?.('solid');
    if (e.code === 'KeyW') this.onLineTypeSwitch?.('acc');
    if (e.code === 'KeyE') this.onLineTypeSwitch?.('scenery');

    // Arrow key panning
    const panAmount = e.shiftKey ? 200 : 80;
    if (e.code === 'ArrowLeft') { e.preventDefault(); this.camera.pan(panAmount, 0); }
    if (e.code === 'ArrowRight') { e.preventDefault(); this.camera.pan(-panAmount, 0); }
    if (e.code === 'ArrowUp') { e.preventDefault(); this.camera.pan(0, panAmount); }
    if (e.code === 'ArrowDown') { e.preventDefault(); this.camera.pan(0, -panAmount); }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      const wasPanning = this.spacePanned;
      this.isSpaceDown = false;
      this.spacePanned = false;
      if (!this.isPanning) {
        this.canvas.style.cursor = '';
      }
      // Only toggle play/pause if space wasn't used for panning
      if (!wasPanning) {
        this.onPlayPauseToggle?.();
      }
    }
  };

  private getState(): GameState {
    return this.getGameState?.() ?? GameState.EDITING;
  }

  /** Drawing/erasing allowed in EDITING and PAUSED states */
  private canDraw(): boolean {
    const s = this.getState();
    return s === GameState.EDITING || s === GameState.PAUSED;
  }

  private onMousePointerDown(e: PointerEvent) {
    if (this.activeMousePointerId !== null || this.touchPointers.size > 0) {
      return;
    }

    const sp = this.screenPos(e);
    this.lastMouse.copyFrom(sp);
    this.activeMousePointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || (e.button === 0 && this.isSpaceDown)) {
      this.isPanning = true;
      this.spacePanned = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 2 && this.canDraw()) {
      this.quickErasing = true;
      const wp = this.camera.screenToWorld(sp);
      this.onQuickEraseStart?.(wp);
      return;
    }

    if (e.button === 0 && this.tool && this.canDraw()) {
      this.mouseDown = true;
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseDown(wp, sp, 0);
    }
  }

  private onMousePointerMove(e: PointerEvent) {
    if (this.activeMousePointerId !== null && e.pointerId !== this.activeMousePointerId) {
      return;
    }

    const sp = this.screenPos(e);

    if (this.isPanning) {
      const dx = sp.x - this.lastMouse.x;
      const dy = sp.y - this.lastMouse.y;
      this.camera.pan(dx, dy);
      this.lastMouse.copyFrom(sp);
      return;
    }

    if (this.quickErasing && this.canDraw()) {
      const wp = this.camera.screenToWorld(sp);
      this.onQuickEraseMove?.(wp);
      return;
    }

    if (this.tool && this.canDraw()) {
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseMove(wp, sp);
      // Update cursor from tool
      const cursor = this.tool.getCursor?.() ?? '';
      this.canvas.style.cursor = cursor;
    }
  }

  private onMousePointerUp(e: PointerEvent) {
    if (this.activeMousePointerId !== e.pointerId) {
      return;
    }

    const sp = this.screenPos(e);

    if (this.isPanning && (e.button === 1 || e.button === 0)) {
      this.isPanning = false;
      this.canvas.style.cursor = '';
      this.releaseCapturedPointer(e.pointerId);
      this.activeMousePointerId = null;
      return;
    }

    if (this.quickErasing && e.button === 2) {
      this.quickErasing = false;
      this.onQuickEraseEnd?.();
      this.releaseCapturedPointer(e.pointerId);
      this.activeMousePointerId = null;
      return;
    }

    if (this.mouseDown && this.tool && this.canDraw()) {
      this.mouseDown = false;
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseUp(wp, sp, e.button);
    }

    this.releaseCapturedPointer(e.pointerId);
    this.activeMousePointerId = null;
  }

  private onMousePointerCancel(e: PointerEvent) {
    if (this.activeMousePointerId !== e.pointerId) {
      return;
    }

    if (this.quickErasing) {
      this.quickErasing = false;
      this.onQuickEraseEnd?.();
    }

    this.isPanning = false;
    this.mouseDown = false;
    this.canvas.style.cursor = '';
    this.releaseCapturedPointer(e.pointerId);
    this.activeMousePointerId = null;
  }

  private onTouchPointerDown(e: PointerEvent) {
    if (this.activeMousePointerId !== null) {
      return;
    }

    e.preventDefault();
    const sp = this.screenPos(e);
    this.touchPointers.set(e.pointerId, sp);
    this.canvas.setPointerCapture(e.pointerId);

    if (this.touchPointers.size === 1) {
      this.touchDrawingPointerId = e.pointerId;
      this.resetTouchGesture();

      if (this.tool && this.canDraw()) {
        this.mouseDown = true;
        const wp = this.camera.screenToWorld(sp);
        this.tool.onMouseDown(wp, sp, 0);
      }
      return;
    }

    this.finishTouchStroke();
    this.beginTouchGesture();
  }

  private onTouchPointerMove(e: PointerEvent) {
    if (!this.touchPointers.has(e.pointerId)) {
      return;
    }

    e.preventDefault();
    const sp = this.screenPos(e);
    this.touchPointers.set(e.pointerId, sp);

    if (this.touchPointers.size >= 2) {
      this.updateTouchGesture();
      return;
    }

    if (
      this.touchDrawingPointerId === e.pointerId &&
      this.mouseDown &&
      this.tool &&
      this.canDraw()
    ) {
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseMove(wp, sp);
    }
  }

  private onTouchPointerUp(e: PointerEvent) {
    if (!this.touchPointers.has(e.pointerId)) {
      return;
    }

    e.preventDefault();
    const sp = this.screenPos(e);
    const wasDrawingPointer = this.touchDrawingPointerId === e.pointerId;

    if (
      wasDrawingPointer &&
      this.mouseDown &&
      this.tool &&
      this.canDraw() &&
      this.touchPointers.size === 1
    ) {
      this.mouseDown = false;
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseUp(wp, sp, 0);
    }

    this.touchPointers.delete(e.pointerId);
    this.releaseCapturedPointer(e.pointerId);

    if (this.touchPointers.size < 2) {
      this.resetTouchGesture();
    }

    if (this.touchPointers.size === 0) {
      this.touchDrawingPointerId = null;
      this.mouseDown = false;
      return;
    }

    this.touchDrawingPointerId = null;
  }

  private onTouchPointerCancel(e: PointerEvent) {
    if (!this.touchPointers.has(e.pointerId)) {
      return;
    }

    this.touchPointers.delete(e.pointerId);
    this.releaseCapturedPointer(e.pointerId);
    this.touchDrawingPointerId = null;
    this.mouseDown = false;
    this.resetTouchGesture();
  }

  private beginTouchGesture() {
    const metrics = this.getTouchGestureMetrics();
    if (!metrics) return;
    this.touchGestureCenter = metrics.center;
    this.touchGestureDistance = metrics.distance;
  }

  private updateTouchGesture() {
    const metrics = this.getTouchGestureMetrics();
    if (!metrics) return;

    if (!this.touchGestureCenter) {
      this.beginTouchGesture();
      return;
    }

    const dx = metrics.center.x - this.touchGestureCenter.x;
    const dy = metrics.center.y - this.touchGestureCenter.y;
    if (dx !== 0 || dy !== 0) {
      this.camera.pan(dx, dy);
    }

    if (this.touchGestureDistance > 0 && metrics.distance > 0) {
      this.camera.zoomAt(
        metrics.center.x,
        metrics.center.y,
        metrics.distance / this.touchGestureDistance,
      );
    }

    this.touchGestureCenter = metrics.center;
    this.touchGestureDistance = metrics.distance;
  }

  private getTouchGestureMetrics(): { center: Vec2; distance: number } | null {
    const points = [...this.touchPointers.values()];
    if (points.length < 2) return null;

    const [a, b] = points;
    return {
      center: new Vec2((a.x + b.x) / 2, (a.y + b.y) / 2),
      distance: a.distanceTo(b),
    };
  }

  private finishTouchStroke() {
    if (
      this.touchDrawingPointerId === null ||
      !this.mouseDown ||
      !this.tool ||
      !this.canDraw()
    ) {
      this.touchDrawingPointerId = null;
      this.mouseDown = false;
      return;
    }

    const screenPos = this.touchPointers.get(this.touchDrawingPointerId);
    if (!screenPos) {
      this.touchDrawingPointerId = null;
      this.mouseDown = false;
      return;
    }

    this.mouseDown = false;
    const worldPos = this.camera.screenToWorld(screenPos);
    this.tool.onMouseUp(worldPos, screenPos, 0);
    this.touchDrawingPointerId = null;
  }

  private resetTouchGesture() {
    this.touchGestureCenter = null;
    this.touchGestureDistance = 0;
  }

  private releaseCapturedPointer(pointerId: number) {
    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }
}
