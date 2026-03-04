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
  private lastMouse = new Vec2();
  private mouseDown = false;

  onPlayPauseToggle: (() => void) | null = null;
  onStop: (() => void) | null = null;
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
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private screenPos(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vec2(e.clientX - rect.left, e.clientY - rect.top);
  }

  private onMouseDown = (e: MouseEvent) => {
    const sp = this.screenPos(e);
    this.lastMouse.copyFrom(sp);

    // Middle mouse or space+left = pan
    if (e.button === 1 || (e.button === 0 && this.isSpaceDown)) {
      this.isPanning = true;
      this.canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (e.button === 2 && this.getState() === GameState.EDITING) {
      this.quickErasing = true;
      const wp = this.camera.screenToWorld(sp);
      this.onQuickEraseStart?.(wp);
      return;
    }

    if (e.button === 0 && this.tool && this.getState() === GameState.EDITING) {
      this.mouseDown = true;
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseDown(wp, sp, e.button);
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    const sp = this.screenPos(e);

    if (this.isPanning) {
      const dx = sp.x - this.lastMouse.x;
      const dy = sp.y - this.lastMouse.y;
      this.camera.pan(dx, dy);
      this.lastMouse.copyFrom(sp);
      return;
    }

    if (this.quickErasing && this.getState() === GameState.EDITING) {
      const wp = this.camera.screenToWorld(sp);
      this.onQuickEraseMove?.(wp);
      return;
    }

    if (this.tool && this.getState() === GameState.EDITING) {
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseMove(wp, sp);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    const sp = this.screenPos(e);

    if (this.isPanning && (e.button === 1 || e.button === 0)) {
      this.isPanning = false;
      this.canvas.style.cursor = '';
      return;
    }

    if (this.quickErasing && e.button === 2) {
      this.quickErasing = false;
      this.onQuickEraseEnd?.();
      return;
    }

    if (this.mouseDown && this.tool && this.getState() === GameState.EDITING) {
      this.mouseDown = false;
      const wp = this.camera.screenToWorld(sp);
      this.tool.onMouseUp(wp, sp, e.button);
    }
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
        if (this.getState() !== GameState.EDITING) {
          this.onPlayPauseToggle?.();
        } else {
          this.canvas.style.cursor = 'grab';
        }
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

    if (e.code === 'Delete') {
      e.preventDefault();
      this.onClearTrack?.();
    }

    if (e.code === 'Digit1') this.onToolSwitch?.('pencil');
    if (e.code === 'Digit2') this.onToolSwitch?.('line');
    if (e.code === 'Digit3') this.onToolSwitch?.('eraser');
    if (e.code === 'Digit4') this.onToolSwitch?.('curve');
    if (e.code === 'KeyQ') this.onLineTypeSwitch?.('solid');
    if (e.code === 'KeyW') this.onLineTypeSwitch?.('acc');
    if (e.code === 'KeyE') this.onLineTypeSwitch?.('scenery');
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.isSpaceDown = false;
      if (!this.isPanning) {
        this.canvas.style.cursor = '';
      }
    }
  };

  private getState(): GameState {
    return this.getGameState?.() ?? GameState.EDITING;
  }
}
