import { LineType } from '../physics/lines/LineTypes';
import { GameState } from '../game/GameState';
import { ICONS } from './icons';

export class Toolbar {
  // Left sidebar
  private fileActions: HTMLElement;
  private layerList: HTMLElement;
  private layerControls: HTMLElement;
  private lineTypeStrip: HTMLElement;
  private sidebarLeftFooter: HTMLElement;

  // Right sidebar
  private drawBtn: HTMLButtonElement;
  private rideBtn: HTMLButtonElement;
  private toolGrid: HTMLElement;

  // Bottom bar
  private transport: HTMLElement;
  private timelineScrubber: HTMLInputElement;
  private timelineStart: HTMLElement;
  private timelineEnd: HTMLElement;
  private speedButtons: HTMLButtonElement[] = [];

  // Canvas HUD
  private statScore: HTMLElement;
  private statSpeed: HTMLElement;
  private frameDisplay: HTMLElement;

  // Callbacks
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
  onFit: (() => void) | null = null;
  onLayerPrev: (() => void) | null = null;
  onLayerNext: (() => void) | null = null;
  onLayerNew: (() => void) | null = null;
  onLayerToggleVisibility: (() => void) | null = null;
  onLayerToggleEditability: (() => void) | null = null;
  onLayerMovePrev: (() => void) | null = null;
  onLayerMoveNext: (() => void) | null = null;
  onLayerRename: (() => void) | null = null;
  onLayerDelete: (() => void) | null = null;
  onLayerReorder: ((fromIndex: number, toIndex: number) => void) | null = null;
  onSpeedChange: ((speed: number) => void) | null = null;
  onTimelineSeek: ((frame: number) => void) | null = null;
  onDrawRideToggle: (() => void) | null = null;
  onDrawClick: (() => void) | null = null;
  onRideClick: (() => void) | null = null;
  onSvgImport: (() => void) | null = null;
  onSvgExport: (() => void) | null = null;
  onOnionSkinToggle: ((enabled: boolean) => void) | null = null;
  onScreenshot: (() => void) | null = null;
  onStepForward: (() => void) | null = null;
  onStepBack: (() => void) | null = null;
  onSnapToggle: ((enabled: boolean) => void) | null = null;
  onSmooth: (() => void) | null = null;

  private toolButtons: Map<string, HTMLButtonElement> = new Map();
  private smoothBtn!: HTMLButtonElement;
  private lineTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
  private playBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;

  // Layer state
  private layerRows: HTMLElement[] = [];
  private isSeeking = false;
  private lastLayerFingerprint = '';

  constructor() {
    // Left sidebar elements
    this.fileActions = this.requireElement('file-actions');
    this.layerList = this.requireElement('layer-list');
    this.layerControls = this.requireElement('layer-controls');
    this.lineTypeStrip = this.requireElement('line-type-strip');
    this.sidebarLeftFooter = this.requireElement('sidebar-left-footer');

    // Right sidebar elements
    this.drawBtn = this.requireElement('draw-btn') as HTMLButtonElement;
    this.rideBtn = this.requireElement('ride-btn') as HTMLButtonElement;
    this.toolGrid = this.requireElement('tool-grid');

    // Bottom bar
    this.transport = this.requireElement('transport');
    this.timelineScrubber = this.requireElement('timeline-scrubber') as HTMLInputElement;
    this.timelineStart = this.requireElement('timeline-start');
    this.timelineEnd = this.requireElement('timeline-end');

    // Canvas HUD
    this.statScore = this.requireElement('stat-score');
    this.statSpeed = this.requireElement('stat-speed');
    this.frameDisplay = this.requireElement('frame-display');

    this.build();
    this.setupTimelineScrubber();
    this.setupSpeedPresets();
    this.setupPlaceholders();
  }

  private build() {
    // Draw/Ride toggle
    this.drawBtn.addEventListener('click', () => this.onDrawClick?.());
    this.rideBtn.addEventListener('click', () => this.onRideClick?.());

    // File actions bar: New | Open | Save | separator | Undo | Redo
    this.addIconBtn(this.fileActions, ICONS.newFile, 'New track', () => this.onClear?.());
    this.addIconBtn(this.fileActions, ICONS.open, 'Open track', () => this.onLoad?.());
    this.addIconBtn(this.fileActions, ICONS.save, 'Save track', () => this.onSave?.());

    // Separator
    const sep = document.createElement('div');
    sep.className = 'separator';
    this.fileActions.appendChild(sep);

    this.addIconBtn(this.fileActions, ICONS.undo, 'Undo', () => this.onUndo?.());
    this.addIconBtn(this.fileActions, ICONS.redo, 'Redo', () => this.onRedo?.());

    // Layer controls: + New | Rename | Delete
    this.addIconBtn(this.layerControls, ICONS.plus, 'Add layer', () => this.onLayerNew?.());
    this.addIconBtn(this.layerControls, ICONS.pencilSmall, 'Rename layer', () => this.onLayerRename?.());
    this.addIconBtn(this.layerControls, ICONS.trash, 'Delete layer', () => this.onLayerDelete?.());
    // Spacer to push move buttons right
    const layerSpacer = document.createElement('div');
    layerSpacer.className = 'spacer';
    this.layerControls.appendChild(layerSpacer);
    this.addIconBtn(this.layerControls, ICONS.arrowUp, 'Move layer up', () => this.onLayerMovePrev?.());
    this.addIconBtn(this.layerControls, ICONS.arrowDown, 'Move layer down', () => this.onLayerMoveNext?.());

    // Line type buttons (right sidebar)
    this.addLineTypeBtn(LineType.SOLID, 'Solid (Q)', 'Solid');
    this.addLineTypeBtn(LineType.ACC, 'Speed (W)', 'Accel');
    this.addLineTypeBtn(LineType.SCENERY, 'Scenery (E)', 'Scene');

    // Tool grid (right sidebar, 2-column) — SVG icons
    this.addToolGridBtn('pencil', ICONS.pen, 'Pen');
    this.addToolGridBtn('line', ICONS.line, 'Line');
    this.addToolGridBtn('eraser', ICONS.eraser, 'Erase');
    this.addToolGridBtn('edit', ICONS.edit, 'Edit');
    this.addToolGridBtn('select', ICONS.select, 'Select');
    this.addToolGridBtn('flag', ICONS.flag, 'Flag');

    // Onion skin toggle
    const onionCheckbox = document.getElementById('onion-checkbox') as HTMLInputElement;
    if (onionCheckbox) {
      onionCheckbox.addEventListener('change', () => {
        this.onOnionSkinToggle?.(onionCheckbox.checked);
      });
    }

    // Snap toggle
    const snapCheckbox = document.getElementById('snap-checkbox') as HTMLInputElement;
    if (snapCheckbox) {
      snapCheckbox.addEventListener('change', () => {
        this.onSnapToggle?.(snapCheckbox.checked);
      });
    }

    // Smooth button (visible only when select tool is active)
    this.smoothBtn = document.getElementById('smooth-btn') as HTMLButtonElement;
    if (this.smoothBtn) {
      this.smoothBtn.addEventListener('click', () => this.onSmooth?.());
    }

    // Transport buttons
    this.pauseBtn = this.requireElement('pause-btn') as HTMLButtonElement;
    this.playBtn = this.requireElement('play-btn') as HTMLButtonElement;
    this.stopBtn = this.requireElement('stop-btn') as HTMLButtonElement;
    const fitBtn = this.requireElement('btn-zoom') as HTMLButtonElement;

    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    this.playBtn.addEventListener('click', () => this.onPlay?.());
    this.stopBtn.addEventListener('click', () => this.onStop?.());
    fitBtn.addEventListener('click', () => this.onFit?.());

    // Sidebar footer icons
    this.addFooterIconBtn(ICONS.screenshot, 'Screenshot', () => this.onScreenshot?.());
    this.addFooterIconBtn(ICONS.download, 'Export', () => alert('Export coming soon'));
    this.addFooterIconBtn(ICONS.cloud, 'Cloud', () => alert('Cloud save coming soon'));
    this.addFooterIconBtn(ICONS.settings, 'Settings', () => alert('Settings coming soon'));
  }

  private addToolGridBtn(name: string, iconSvg: string, label: string) {
    const btn = document.createElement('button');
    btn.dataset.tool = name;
    btn.innerHTML = `<span class="tool-icon">${iconSvg}</span><span class="tool-label">${label}</span>`;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', () => this.onToolSelect?.(name));
    this.toolGrid.appendChild(btn);
    this.toolButtons.set(name, btn);
  }

  private addLineTypeBtn(type: LineType, tooltip: string, label: string) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = tooltip;
    btn.dataset.color = type;
    btn.addEventListener('click', () => this.onLineTypeSelect?.(type));
    this.lineTypeStrip.appendChild(btn);
    this.lineTypeButtons.set(type, btn);
  }

  private addBtn(container: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
    return btn;
  }

  private addIconBtn(container: HTMLElement, iconSvg: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.innerHTML = iconSvg;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
    return btn;
  }

  private addFooterIconBtn(iconSvg: string, title: string, onClick: () => void) {
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.innerHTML = iconSvg;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('click', onClick);
    this.sidebarLeftFooter.appendChild(btn);
  }

  private requireElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing toolbar element: ${id}`);
    return element;
  }

  private seekThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSeekFrame: number | null = null;

  private setupTimelineScrubber() {
    this.timelineScrubber.addEventListener('input', () => {
      this.isSeeking = true;
      const frame = parseInt(this.timelineScrubber.value, 10);
      this.pendingSeekFrame = frame;

      const fps = 40;
      const seconds = frame / fps;
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      this.timelineStart.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
      this.frameDisplay.textContent = `F${frame}`;

      if (!this.seekThrottleTimer) {
        this.seekThrottleTimer = setTimeout(() => {
          this.seekThrottleTimer = null;
          if (this.pendingSeekFrame !== null) {
            this.onTimelineSeek?.(this.pendingSeekFrame);
          }
        }, 80);
      }
    });

    this.timelineScrubber.addEventListener('change', () => {
      if (this.seekThrottleTimer) {
        clearTimeout(this.seekThrottleTimer);
        this.seekThrottleTimer = null;
      }
      if (this.pendingSeekFrame !== null) {
        this.onTimelineSeek?.(this.pendingSeekFrame);
        this.pendingSeekFrame = null;
      }
      this.isSeeking = false;
    });
  }

  private setupSpeedPresets() {
    const container = this.requireElement('speed-presets');
    const buttons = container.querySelectorAll<HTMLButtonElement>('.speed-btn');
    buttons.forEach((btn) => {
      this.speedButtons.push(btn);
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed || '1');
        this.setActiveSpeed(speed);
        this.onSpeedChange?.(speed);
      });
    });
  }

  private setupPlaceholders() {
    const btnSound = document.getElementById('btn-sound');
    const btnEffects = document.getElementById('btn-effects');
    const btnSettings = document.getElementById('btn-settings');
    const hotkeysClose = document.getElementById('hotkeys-close');
    btnSound?.addEventListener('click', () => alert('Sound controls coming soon'));
    btnEffects?.addEventListener('click', () => alert('Effects coming soon'));
    btnSettings?.addEventListener('click', () => {
      document.body.classList.toggle('hotkeys-open');
    });
    hotkeysClose?.addEventListener('click', () => {
      document.body.classList.remove('hotkeys-open');
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && document.body.classList.contains('hotkeys-open')) {
        document.body.classList.remove('hotkeys-open');
      }
    });

    const svgImport = document.getElementById('svg-import-btn');
    const svgExport = document.getElementById('svg-export-btn');
    svgImport?.addEventListener('click', () => {
      this.onSvgImport?.();
      if (!this.onSvgImport) alert('SVG Import coming soon');
    });
    svgExport?.addEventListener('click', () => this.onSvgExport?.());

    const stepFwd = document.getElementById('step-fwd-btn');
    const stepBack = document.getElementById('step-back-btn');
    stepFwd?.addEventListener('click', () => this.onStepForward?.());
    stepBack?.addEventListener('click', () => this.onStepBack?.());
  }

  private setActiveSpeed(speed: number) {
    for (const btn of this.speedButtons) {
      const btnSpeed = parseFloat(btn.dataset.speed || '1');
      btn.classList.toggle('active', btnSpeed === speed);
    }
  }

  setActiveTool(name: string) {
    for (const [n, btn] of this.toolButtons) {
      btn.classList.toggle('active', n === name);
    }
    if (this.smoothBtn) {
      this.smoothBtn.style.display = name === 'select' ? '' : 'none';
    }
  }

  setActiveLineType(type: LineType) {
    for (const [t, btn] of this.lineTypeButtons) {
      btn.classList.toggle('active', t === type);
    }
  }

  setPlaybackState(state: GameState) {
    this.playBtn.disabled = state === GameState.PLAYING;
    this.pauseBtn.disabled = state !== GameState.PLAYING;
    this.stopBtn.disabled = state === GameState.EDITING;
    this.pauseBtn.classList.toggle('active', state === GameState.PAUSED);

    this.drawBtn.classList.toggle('active', state !== GameState.PLAYING);
    this.rideBtn.classList.toggle('active', state === GameState.PLAYING);
  }

  setLayerState(layers: Array<{ id: number; name: string; visible: boolean; editable: boolean }>, activeIndex: number) {
    const fingerprint = layers.map((l, i) =>
      `${l.id}:${l.name}:${l.visible}:${l.editable}:${i === activeIndex}`
    ).join('|');
    if (fingerprint === this.lastLayerFingerprint) return;
    this.lastLayerFingerprint = fingerprint;

    this.layerList.innerHTML = '';
    this.layerRows = [];

    let dragSrcIndex: number | null = null;

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const isActive = i === activeIndex;

      const row = document.createElement('div');
      row.className = 'layer-row' + (isActive ? ' active' : '');
      row.draggable = true;
      row.dataset.layerIndex = String(i);

      // Visibility icon
      const visIcon = document.createElement('span');
      visIcon.className = 'layer-icon' + (layer.visible ? '' : ' off');
      visIcon.innerHTML = layer.visible ? ICONS.eyeOpen : ICONS.eyeClosed;
      visIcon.title = layer.visible ? 'Hide layer' : 'Show layer';
      visIcon.setAttribute('role', 'button');
      visIcon.setAttribute('aria-label', visIcon.title);
      visIcon.tabIndex = 0;
      visIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        // Select layer first if not active, then toggle
        this.selectLayerByIndex(i, activeIndex);
        this.onLayerToggleVisibility?.();
      });

      // Lock icon
      const lockIcon = document.createElement('span');
      lockIcon.className = 'layer-icon' + (layer.editable ? '' : ' off');
      lockIcon.innerHTML = layer.editable ? ICONS.unlock : ICONS.lock;
      lockIcon.title = layer.editable ? 'Lock layer' : 'Unlock layer';
      lockIcon.setAttribute('role', 'button');
      lockIcon.setAttribute('aria-label', lockIcon.title);
      lockIcon.tabIndex = 0;
      lockIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectLayerByIndex(i, activeIndex);
        this.onLayerToggleEditability?.();
      });

      // Name — double-click to rename
      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layer.name;
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.selectLayerByIndex(i, activeIndex);
        this.onLayerRename?.();
      });

      row.appendChild(visIcon);
      row.appendChild(lockIcon);
      row.appendChild(nameSpan);

      // Click row to select
      const layerIdx = i;
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.layer-icon')) return;
        this.selectLayerByIndex(layerIdx, activeIndex);
      });

      // Drag-to-reorder
      row.addEventListener('dragstart', (e) => {
        dragSrcIndex = layerIdx;
        row.classList.add('dragging');
        e.dataTransfer!.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        dragSrcIndex = null;
        // Clean up all drag-over indicators
        this.layerRows.forEach(r => r.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        // Show drop indicator
        this.layerRows.forEach(r => r.classList.remove('drag-over'));
        if (dragSrcIndex !== null && dragSrcIndex !== layerIdx) {
          row.classList.add('drag-over');
        }
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (dragSrcIndex !== null && dragSrcIndex !== layerIdx) {
          this.onLayerReorder?.(dragSrcIndex, layerIdx);
        }
        dragSrcIndex = null;
      });

      this.layerList.appendChild(row);
      this.layerRows.push(row);
    }
  }

  private selectLayerByIndex(targetIndex: number, currentIndex: number) {
    const diff = targetIndex - currentIndex;
    if (diff < 0) {
      for (let j = 0; j < Math.abs(diff); j++) this.onLayerPrev?.();
    } else if (diff > 0) {
      for (let j = 0; j < diff; j++) this.onLayerNext?.();
    }
  }

  updateStats(lineCount: number, speed: number) {
    this.statScore.textContent = String(lineCount);
    this.statSpeed.textContent = speed.toFixed(0);
  }

  updateTimeline(frame: number, maxFrame: number) {
    if (this.isSeeking) return;
    // Minimum 30 seconds (1200 frames at 40fps) so scrubber has range from the start
    const displayMax = Math.max(maxFrame, 1200);
    this.timelineScrubber.max = String(displayMax);
    this.timelineScrubber.value = String(frame);

    const fps = 40;
    const seconds = frame / fps;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    this.timelineStart.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    const maxSeconds = displayMax / fps;
    const maxMins = Math.floor(maxSeconds / 60);
    const maxSecs = Math.floor(maxSeconds % 60);
    this.timelineEnd.textContent = `${maxMins}:${String(maxSecs).padStart(2, '0')}`;

    this.frameDisplay.textContent = `F${frame}`;
  }
}
