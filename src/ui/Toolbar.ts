import { LineType } from '../physics/lines/LineTypes';
import { GameState } from '../game/GameState';

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
  onSpeedChange: ((speed: number) => void) | null = null;
  onTimelineSeek: ((frame: number) => void) | null = null;
  onDrawRideToggle: (() => void) | null = null;
  onSvgImport: (() => void) | null = null;
  onSvgExport: (() => void) | null = null;
  onSmoothToggle: ((enabled: boolean) => void) | null = null;
  onScreenshot: (() => void) | null = null;
  onStepForward: (() => void) | null = null;
  onStepBack: (() => void) | null = null;

  private toolButtons: Map<string, HTMLButtonElement> = new Map();
  private lineTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
  private playBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;

  // Layer state
  private layerRows: HTMLElement[] = [];
  private isSeeking = false;

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
    this.drawBtn.addEventListener('click', () => this.onDrawRideToggle?.());
    this.rideBtn.addEventListener('click', () => this.onDrawRideToggle?.());

    // File actions (left sidebar)
    this.addBtn(this.fileActions, 'Clear', () => this.onClear?.());
    this.addBtn(this.fileActions, 'Undo', () => this.onUndo?.());
    this.addBtn(this.fileActions, 'Redo', () => this.onRedo?.());

    // Layer controls
    this.addBtn(this.layerControls, 'Edit', () => this.onLayerRename?.());
    this.addBtn(this.layerControls, '‹', () => this.onLayerPrev?.());
    this.addBtn(this.layerControls, '+ Layer', () => this.onLayerNew?.());

    // Line type buttons (left sidebar)
    this.addLineTypeBtn(LineType.SOLID, 'Solid (Q)', 'Solid');
    this.addLineTypeBtn(LineType.ACC, 'Speed (W)', 'Accel');
    this.addLineTypeBtn(LineType.SCENERY, 'Scenery (E)', 'Scene');

    // Tool grid (right sidebar, 2-column)
    this.addToolGridBtn('pencil', '✏️', 'Pen');
    this.addToolGridBtn('line', '📏', 'Line');
    this.addToolGridBtn('eraser', '✕', 'Erase');
    this.addToolGridBtn('curve', '↩', 'Curve');
    this.addToolGridBtn('flag', '⚑', 'Flag');

    // Smooth toggle
    const smoothCheckbox = document.getElementById('smooth-checkbox') as HTMLInputElement;
    if (smoothCheckbox) {
      smoothCheckbox.addEventListener('change', () => {
        this.onSmoothToggle?.(smoothCheckbox.checked);
      });
    }

    // Edit actions (undo/redo in right sidebar)
    const editActions = document.getElementById('edit-actions');
    if (editActions) {
      this.addBtn(editActions, 'Undo', () => this.onUndo?.());
      this.addBtn(editActions, 'Redo', () => this.onRedo?.());
    }

    // Transport buttons (bottom bar) — play/pause/stop already in HTML
    this.pauseBtn = this.requireElement('pause-btn') as HTMLButtonElement;
    this.playBtn = this.requireElement('play-btn') as HTMLButtonElement;
    this.stopBtn = this.requireElement('stop-btn') as HTMLButtonElement;
    const fitBtn = this.requireElement('btn-zoom') as HTMLButtonElement;

    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    this.playBtn.addEventListener('click', () => this.onPlay?.());
    this.stopBtn.addEventListener('click', () => this.onStop?.());
    fitBtn.addEventListener('click', () => this.onFit?.());

    // Sidebar footer icons
    this.addFooterBtn('💾', 'Save', () => this.onSave?.());
    this.addFooterBtn('📂', 'Load', () => this.onLoad?.());
    this.addFooterBtn('📦', 'Export', () => alert('Export coming soon'));
    this.addFooterBtn('☁', 'Cloud', () => alert('Cloud save coming soon'));
    this.addFooterBtn('📷', 'Screenshot', () => this.onScreenshot?.());
    this.addFooterBtn('🔧', 'Settings', () => alert('Settings coming soon'));
  }

  private addToolGridBtn(name: string, icon: string, label: string) {
    const btn = document.createElement('button');
    btn.dataset.tool = name;
    btn.innerHTML = `<span class="tool-icon">${icon}</span><span class="tool-label">${label}</span>`;
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

  private addFooterBtn(icon: string, title: string, onClick: () => void) {
    const btn = document.createElement('button');
    btn.textContent = icon;
    btn.title = title;
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
    // 'input' fires continuously during drag
    this.timelineScrubber.addEventListener('input', () => {
      this.isSeeking = true;
      const frame = parseInt(this.timelineScrubber.value, 10);
      this.pendingSeekFrame = frame;

      // Update time display immediately (cheap)
      const fps = 40;
      const seconds = frame / fps;
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toFixed(3);
      this.timelineStart.textContent = `${mins}:${secs.padStart(6, '0')}`;
      this.frameDisplay.textContent = `F${frame}`;

      // Throttle the actual physics seek to ~80ms intervals
      if (!this.seekThrottleTimer) {
        this.seekThrottleTimer = setTimeout(() => {
          this.seekThrottleTimer = null;
          if (this.pendingSeekFrame !== null) {
            this.onTimelineSeek?.(this.pendingSeekFrame);
          }
        }, 80);
      }
    });

    // 'change' fires on release — do final seek
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
    // Top bar buttons
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

    // SVG import/export
    const svgImport = document.getElementById('svg-import-btn');
    const svgExport = document.getElementById('svg-export-btn');
    svgImport?.addEventListener('click', () => {
      this.onSvgImport?.();
      if (!this.onSvgImport) alert('SVG Import coming soon');
    });
    svgExport?.addEventListener('click', () => this.onSvgExport?.());

    // Step forward / backward
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

    // Draw/Ride toggle
    this.drawBtn.classList.toggle('active', state === GameState.EDITING);
    this.rideBtn.classList.toggle('active', state !== GameState.EDITING);

    // Timeline — always enabled so user can scrub anytime
  }

  setLayerState(name: string, index: number, count: number, visible: boolean, editable: boolean) {
    // Rebuild layer list
    this.layerList.innerHTML = '';
    this.layerRows = [];

    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'layer-row' + (i === index - 1 ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = i === index - 1 ? name : `Layer ${i + 1}`;

      const visBtn = document.createElement('button');
      visBtn.className = 'layer-btn';
      visBtn.textContent = (i === index - 1 && !visible) ? '🔇' : '👁';
      visBtn.title = 'Toggle visibility';
      if (i === index - 1) {
        visBtn.addEventListener('click', () => this.onLayerToggleVisibility?.());
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'layer-btn';
      editBtn.textContent = (i === index - 1 && !editable) ? '🔒' : '✏';
      editBtn.title = 'Toggle editability';
      if (i === index - 1) {
        editBtn.addEventListener('click', () => this.onLayerToggleEditability?.());
      }

      row.appendChild(visBtn);
      row.appendChild(editBtn);
      row.appendChild(nameSpan);

      // Click row to select layer
      const layerIdx = i;
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        const diff = layerIdx - (index - 1);
        if (diff < 0) {
          for (let j = 0; j < Math.abs(diff); j++) this.onLayerPrev?.();
        } else if (diff > 0) {
          for (let j = 0; j < diff; j++) this.onLayerNext?.();
        }
      });

      this.layerList.appendChild(row);
      this.layerRows.push(row);
    }
  }

  updateStats(lineCount: number, speed: number) {
    this.statScore.textContent = String(lineCount);
    this.statSpeed.textContent = speed.toFixed(0);
  }

  updateTimeline(frame: number, maxFrame: number) {
    if (this.isSeeking) return;
    this.timelineScrubber.max = String(maxFrame);
    this.timelineScrubber.value = String(frame);

    // Format as time
    const fps = 40;
    const seconds = frame / fps;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    this.timelineStart.textContent = `${mins}:${secs.padStart(6, '0')}`;

    const maxSeconds = maxFrame / fps;
    const maxMins = Math.floor(maxSeconds / 60);
    const maxSecs = (maxSeconds % 60).toFixed(3);
    this.timelineEnd.textContent = `${maxMins}:${maxSecs.padStart(6, '0')}`;

    this.frameDisplay.textContent = `F${frame}`;
  }
}
