import { LineType } from '../physics/lines/LineTypes';
import { GameState } from '../game/GameState';

export class Toolbar {
  private toolRail: HTMLElement;
  private fileActions: HTMLElement;
  private transport: HTMLElement;
  private layerStrip: HTMLElement;
  private lineTypeStrip: HTMLElement;

  onToolSelect: ((tool: string) => void) | null = null;
  onLineTypeSelect: ((type: LineType) => void) | null = null;
  onClear: (() => void) | null = null;
  onSave: (() => void) | null = null;
  onLoad: (() => void) | null = null;
  onPlay: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onStop: (() => void) | null = null;
  onLayerPrev: (() => void) | null = null;
  onLayerNext: (() => void) | null = null;
  onLayerNew: (() => void) | null = null;

  private toolButtons: Map<string, HTMLButtonElement> = new Map();
  private lineTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
  private playBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private layerPrevBtn!: HTMLButtonElement;
  private layerLabelBtn!: HTMLButtonElement;
  private layerNextBtn!: HTMLButtonElement;
  private layerNewBtn!: HTMLButtonElement;

  constructor() {
    this.toolRail = this.requireElement('tool-rail');
    this.fileActions = this.requireElement('file-actions');
    this.transport = this.requireElement('transport');
    this.layerStrip = this.requireElement('layer-strip');
    this.lineTypeStrip = this.requireElement('line-type-strip');
    this.build();
  }

  private build() {
    this.addToolBtn('pencil', 'Pencil (1)');
    this.addToolBtn('line', 'Line (2)');
    this.addToolBtn('eraser', 'Eraser (3)');
    this.addToolBtn('curve', 'Curve (4)');
    this.addToolBtn('flag', 'Flag (5)');

    this.addBtn(this.fileActions, 'New / Clear', () => this.onClear?.());
    this.addBtn(this.fileActions, 'Save', () => this.onSave?.());
    this.addBtn(this.fileActions, 'Load', () => this.onLoad?.());

    this.playBtn = this.addBtn(this.transport, 'Play', () => this.onPlay?.());
    this.playBtn.classList.add('play-button');
    this.pauseBtn = this.addBtn(this.transport, 'Pause', () => this.onPause?.());
    this.pauseBtn.classList.add('subtle');
    this.stopBtn = this.addBtn(this.transport, 'Stop', () => this.onStop?.());
    this.stopBtn.classList.add('subtle');

    this.layerPrevBtn = this.addBtn(this.layerStrip, '<', () => this.onLayerPrev?.());
    this.layerPrevBtn.classList.add('layer-button');
    this.layerLabelBtn = this.addBtn(this.layerStrip, 'Main', () => {});
    this.layerLabelBtn.classList.add('subtle', 'layer-label');
    this.layerLabelBtn.disabled = true;
    this.layerNextBtn = this.addBtn(this.layerStrip, '>', () => this.onLayerNext?.());
    this.layerNextBtn.classList.add('layer-button');
    this.layerNewBtn = this.addBtn(this.layerStrip, '+ Layer', () => this.onLayerNew?.());

    this.addLineTypeBtn(LineType.SOLID, 'Solid (Q)');
    this.addLineTypeBtn(LineType.ACC, 'Speed (W)');
    this.addLineTypeBtn(LineType.SCENERY, 'Scenery (E)');
  }

  private addToolBtn(name: string, label: string) {
    const btn = this.addBtn(this.toolRail, label, () => this.onToolSelect?.(name));
    this.toolButtons.set(name, btn);
  }

  private addLineTypeBtn(type: LineType, label: string) {
    const btn = this.addBtn(this.lineTypeStrip, label, () => this.onLineTypeSelect?.(type));
    btn.classList.add('line-type-button');
    btn.dataset.color = type;
    this.lineTypeButtons.set(type, btn);
  }

  private addBtn(container: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
    return btn;
  }

  private requireElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing toolbar element: ${id}`);
    }
    return element;
  }

  setActiveTool(name: string) {
    for (const [n, btn] of this.toolButtons) {
      btn.classList.toggle('active', n === name);
    }
  }

  setActiveLineType(type: LineType) {
    for (const [t, btn] of this.lineTypeButtons) {
      btn.classList.toggle('active', t === type);
    }
  }

  setPlaybackState(state: GameState) {
    this.playBtn.textContent = state === GameState.PAUSED ? 'Resume' : 'Play';
    this.playBtn.disabled = state === GameState.PLAYING;
    this.pauseBtn.disabled = state !== GameState.PLAYING;
    this.stopBtn.disabled = state === GameState.EDITING;
    this.pauseBtn.classList.toggle('active', state === GameState.PAUSED);
  }

  setLayerState(name: string, index: number, count: number) {
    this.layerLabelBtn.textContent = `${index}/${count} ${name}`;
    const multipleLayers = count > 1;
    this.layerPrevBtn.disabled = !multipleLayers;
    this.layerNextBtn.disabled = !multipleLayers;
  }
}
