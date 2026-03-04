import { LineType } from '../physics/lines/LineTypes';

export class Toolbar {
  private container: HTMLElement;

  onToolSelect: ((tool: string) => void) | null = null;
  onLineTypeSelect: ((type: LineType) => void) | null = null;
  onClear: (() => void) | null = null;
  onSave: (() => void) | null = null;
  onLoad: (() => void) | null = null;
  onPlay: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onStop: (() => void) | null = null;

  private toolButtons: Map<string, HTMLButtonElement> = new Map();
  private lineTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
  private playBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;

  constructor() {
    this.container = document.getElementById('toolbar')!;
    this.build();
  }

  private build() {
    // Tools
    this.addToolBtn('pencil', 'Pencil (1)');
    this.addToolBtn('line', 'Line (2)');
    this.addToolBtn('eraser', 'Eraser (3)');
    this.addSeparator();

    // Line types
    this.addLineTypeBtn(LineType.SOLID, 'Normal (Q)', '#2266cc');
    this.addLineTypeBtn(LineType.ACC, 'Accel (W)', '#cc2222');
    this.addLineTypeBtn(LineType.SCENERY, 'Scenery (E)', '#00aa00');
    this.addSeparator();

    // Editing actions
    this.addBtn('Clear (Del)', () => this.onClear?.());
    this.addBtn('Save (Ctrl+S)', () => this.onSave?.());
    this.addBtn('Load (Ctrl+O)', () => this.onLoad?.());
    this.addSeparator();

    // Playback
    this.playBtn = this.addBtn('Play', () => this.onPlay?.());
    this.pauseBtn = this.addBtn('Pause', () => this.onPause?.());
    this.stopBtn = this.addBtn('Stop', () => this.onStop?.());
  }

  private addToolBtn(name: string, label: string) {
    const btn = this.addBtn(label, () => this.onToolSelect?.(name));
    this.toolButtons.set(name, btn);
  }

  private addLineTypeBtn(type: LineType, label: string, color: string) {
    const btn = this.addBtn(label, () => this.onLineTypeSelect?.(type));
    btn.style.borderBottom = `3px solid ${color}`;
    this.lineTypeButtons.set(type, btn);
  }

  private addBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    this.container.appendChild(btn);
    return btn;
  }

  private addSeparator() {
    const sep = document.createElement('div');
    sep.className = 'separator';
    this.container.appendChild(sep);
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
}
