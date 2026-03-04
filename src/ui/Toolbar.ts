import { LineType } from '../physics/lines/LineTypes';
import { GameState } from '../game/GameState';

export class Toolbar {
  private static readonly COMPACT_BREAKPOINT = 1240;
  private static readonly ICON_BREAKPOINT = 560;

  private toolRail: HTMLElement;
  private fileActions: HTMLElement;
  private transport: HTMLElement;
  private layerStrip: HTMLElement;
  private lineTypeStrip: HTMLElement;
  private labelMode: 'wide' | 'compact' | 'icon' = 'wide';

  onToolSelect: ((tool: string) => void) | null = null;
  onLineTypeSelect: ((type: LineType) => void) | null = null;
  onClear: (() => void) | null = null;
  onUndo: (() => void) | null = null;
  onRedo: (() => void) | null = null;
  onSave: (() => void) | null = null;
  onLoad: (() => void) | null = null;
  onPlay: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onStop: (() => void) | null = null;
  onLayerPrev: (() => void) | null = null;
  onLayerNext: (() => void) | null = null;
  onLayerNew: (() => void) | null = null;
  onLayerToggleVisibility: (() => void) | null = null;
  onLayerToggleEditability: (() => void) | null = null;
  onLayerMovePrev: (() => void) | null = null;
  onLayerMoveNext: (() => void) | null = null;
  onLayerRename: (() => void) | null = null;

  private toolButtons: Map<string, HTMLButtonElement> = new Map();
  private lineTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
  private playBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private layerPrevBtn!: HTMLButtonElement;
  private layerLabelBtn!: HTMLButtonElement;
  private layerVisibilityBtn!: HTMLButtonElement;
  private layerEditBtn!: HTMLButtonElement;
  private layerNextBtn!: HTMLButtonElement;
  private layerMovePrevBtn!: HTMLButtonElement;
  private layerMoveNextBtn!: HTMLButtonElement;
  private layerRenameBtn!: HTMLButtonElement;
  private layerNewBtn!: HTMLButtonElement;
  private responsiveButtons: Map<HTMLButtonElement, { wide: string; compact: string; icon: string }> = new Map();

  constructor() {
    this.toolRail = this.requireElement('tool-rail');
    this.fileActions = this.requireElement('file-actions');
    this.transport = this.requireElement('transport');
    this.layerStrip = this.requireElement('layer-strip');
    this.lineTypeStrip = this.requireElement('line-type-strip');
    this.build();
    this.applyResponsiveLabels();
    window.addEventListener('resize', this.applyResponsiveLabels);
  }

  private build() {
    this.addToolBtn('pencil', 'Pencil (1)', 'Pen', 'P');
    this.addToolBtn('line', 'Line (2)', 'Line', 'L');
    this.addToolBtn('eraser', 'Eraser (3)', 'Erase', 'X');
    this.addToolBtn('curve', 'Curve (4)', 'Curve', 'C');
    this.addToolBtn('flag', 'Flag (5)', 'Flag', 'F');

    this.addBtn(this.fileActions, 'Clear', () => this.onClear?.(), 'Clr', 'C');
    this.addBtn(this.fileActions, 'Undo', () => this.onUndo?.(), 'Undo', 'U');
    this.addBtn(this.fileActions, 'Redo', () => this.onRedo?.(), 'Redo', 'R');
    this.addBtn(this.fileActions, 'Save', () => this.onSave?.(), 'Save', 'S');
    this.addBtn(this.fileActions, 'Load', () => this.onLoad?.(), 'Load', 'L');

    this.playBtn = this.addBtn(this.transport, 'Play', () => this.onPlay?.(), 'Play', '>');
    this.playBtn.classList.add('play-button');
    this.pauseBtn = this.addBtn(this.transport, 'Pause', () => this.onPause?.(), 'Pause', '||');
    this.pauseBtn.classList.add('subtle');
    this.stopBtn = this.addBtn(this.transport, 'Stop', () => this.onStop?.(), 'Stop', '[]');
    this.stopBtn.classList.add('subtle');

    this.layerPrevBtn = this.addBtn(this.layerStrip, '<', () => this.onLayerPrev?.());
    this.layerPrevBtn.classList.add('layer-button');
    this.layerLabelBtn = this.addBtn(this.layerStrip, 'Main', () => {});
    this.layerLabelBtn.classList.add('subtle', 'layer-label');
    this.layerLabelBtn.disabled = true;
    this.layerVisibilityBtn = this.addBtn(this.layerStrip, 'Shown', () => this.onLayerToggleVisibility?.(), 'Visible', 'V');
    this.layerVisibilityBtn.classList.add('layer-state-button');
    this.layerEditBtn = this.addBtn(this.layerStrip, 'Edit', () => this.onLayerToggleEditability?.(), 'Editable', 'E');
    this.layerEditBtn.classList.add('layer-state-button');
    this.layerNextBtn = this.addBtn(this.layerStrip, '>', () => this.onLayerNext?.());
    this.layerNextBtn.classList.add('layer-button');
    this.layerMovePrevBtn = this.addBtn(this.layerStrip, '<<', () => this.onLayerMovePrev?.());
    this.layerMovePrevBtn.classList.add('layer-button');
    this.layerMoveNextBtn = this.addBtn(this.layerStrip, '>>', () => this.onLayerMoveNext?.());
    this.layerMoveNextBtn.classList.add('layer-button');
    this.layerRenameBtn = this.addBtn(this.layerStrip, 'Rename', () => this.onLayerRename?.(), 'Ren', 'N');
    this.layerRenameBtn.classList.add('layer-state-button');
    this.layerNewBtn = this.addBtn(this.layerStrip, '+ Layer', () => this.onLayerNew?.(), '+', '+');

    this.addLineTypeBtn(LineType.SOLID, 'Solid (Q)', 'Solid', 'N');
    this.addLineTypeBtn(LineType.ACC, 'Speed (W)', 'Speed', 'R');
    this.addLineTypeBtn(LineType.SCENERY, 'Scenery (E)', 'Scene', 'S');
  }

  private addToolBtn(name: string, label: string, compactLabel?: string, iconLabel?: string) {
    const btn = this.addBtn(this.toolRail, label, () => this.onToolSelect?.(name), compactLabel, iconLabel);
    this.toolButtons.set(name, btn);
  }

  private addLineTypeBtn(type: LineType, label: string, compactLabel?: string, iconLabel?: string) {
    const btn = this.addBtn(this.lineTypeStrip, label, () => this.onLineTypeSelect?.(type), compactLabel, iconLabel);
    btn.classList.add('line-type-button');
    btn.dataset.color = type;
    this.lineTypeButtons.set(type, btn);
  }

  private addBtn(
    container: HTMLElement,
    label: string,
    onClick: () => void,
    compactLabel: string = label,
    iconLabel: string = compactLabel,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    this.setResponsiveLabel(btn, label, compactLabel, iconLabel);
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
    this.setResponsiveLabel(this.playBtn, state === GameState.PAUSED ? 'Resume' : 'Play', 'Play', '>');
    this.playBtn.disabled = state === GameState.PLAYING;
    this.pauseBtn.disabled = state !== GameState.PLAYING;
    this.stopBtn.disabled = state === GameState.EDITING;
    this.pauseBtn.classList.toggle('active', state === GameState.PAUSED);
  }

  setLayerState(name: string, index: number, count: number, visible: boolean, editable: boolean) {
    this.layerLabelBtn.textContent = this.labelMode === 'icon' ? `${index}/${count}` : `${index}/${count} ${name}`;
    this.layerLabelBtn.title = name;
    const multipleLayers = count > 1;
    this.layerPrevBtn.disabled = !multipleLayers;
    this.layerNextBtn.disabled = !multipleLayers;
    this.layerMovePrevBtn.disabled = !multipleLayers || index <= 1;
    this.layerMoveNextBtn.disabled = !multipleLayers || index >= count;
    this.setResponsiveLabel(
      this.layerVisibilityBtn,
      visible ? 'Shown' : 'Hidden',
      visible ? 'Visible' : 'Hidden',
      visible ? 'V' : 'H',
    );
    this.layerVisibilityBtn.classList.toggle('active', !visible);
    this.setResponsiveLabel(
      this.layerEditBtn,
      editable ? 'Edit' : 'Locked',
      editable ? 'Editable' : 'Locked',
      editable ? 'E' : 'L',
    );
    this.layerEditBtn.classList.toggle('active', !editable);
  }

  private setResponsiveLabel(button: HTMLButtonElement, wide: string, compact: string, icon: string = compact) {
    this.responsiveButtons.set(button, { wide, compact, icon });
    button.title = wide;
    button.setAttribute('aria-label', wide);
    button.textContent =
      this.labelMode === 'icon' ? icon : this.labelMode === 'compact' ? compact : wide;
  }

  private applyResponsiveLabels = () => {
    if (window.innerWidth <= Toolbar.ICON_BREAKPOINT) {
      this.labelMode = 'icon';
    } else if (window.innerWidth <= Toolbar.COMPACT_BREAKPOINT) {
      this.labelMode = 'compact';
    } else {
      this.labelMode = 'wide';
    }

    for (const [button, labels] of this.responsiveButtons) {
      button.title = labels.wide;
      button.setAttribute('aria-label', labels.wide);
      button.textContent =
        this.labelMode === 'icon'
          ? labels.icon
          : this.labelMode === 'compact'
            ? labels.compact
            : labels.wide;
    }
  };
}
