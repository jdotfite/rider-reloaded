import { LineType } from '../physics/lines/LineTypes';
import { GameState } from '../game/GameState';
import { ICONS } from './icons';
import type {
  PortalColorTheme,
  PortalDirectionRule,
  PortalMode,
  PortalPair,
  PortalTriggerBody,
  PortalVelocityMode,
  PortalVisibility,
} from '../store/PortalTypes';

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
  onConvertSelectedType: ((type: LineType) => void) | null = null;
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
  onTimelineScrub: ((frame: number) => void) | null = null;
  onSmoothStart: (() => boolean) | null = null;
  onSmoothChange: ((amount: number) => void) | null = null;
  onSmoothApply: (() => void) | null = null;
  onSmoothCancel: (() => void) | null = null;
  onPortalModeChange: ((mode: PortalMode) => void) | null = null;
  onPortalThemeChange: ((theme: PortalColorTheme) => void) | null = null;
  onPortalVelocityModeChange: ((mode: PortalVelocityMode) => void) | null = null;
  onPortalSpeedMultiplierChange: ((multiplier: number) => void) | null = null;
  onPortalPreserveOffsetChange: ((enabled: boolean) => void) | null = null;
  onPortalDirectionRuleChange: ((rule: PortalDirectionRule) => void) | null = null;
  onPortalTriggerBodyChange: ((body: PortalTriggerBody) => void) | null = null;
  onPortalCooldownChange: ((frames: number) => void) | null = null;
  onPortalExitOffsetChange: ((offset: number) => void) | null = null;
  onPortalVisibilityChange: ((visibility: PortalVisibility) => void) | null = null;
  onPortalSizeChange: ((length: number) => void) | null = null;
  onPortalRadiusChange: ((radius: number) => void) | null = null;
  onPortalShowEditorLinkChange: ((enabled: boolean) => void) | null = null;
  onPortalShowDebugChange: ((enabled: boolean) => void) | null = null;
  onPortalEnabledChange: ((enabled: boolean) => void) | null = null;

  private toolButtons: Map<string, HTMLButtonElement> = new Map();
  private smoothContainer!: HTMLElement;
  private smoothBtn!: HTMLButtonElement;
  private smoothSliderRow!: HTMLElement;
  private smoothSlider!: HTMLInputElement;
  private smoothValue!: HTMLElement;
  private selectedCount!: HTMLElement;
  private portalSettings!: HTMLElement;
  private portalSelectionStatus!: HTMLElement;
  private portalEmptyHint!: HTMLElement;
  private portalWarningBox!: HTMLElement;
  private portalSettingsFields!: HTMLElement;
  private portalAdvancedFields!: HTMLElement;
  private portalDetailSimple!: HTMLButtonElement;
  private portalDetailAdvanced!: HTMLButtonElement;
  private portalModeOneWay!: HTMLButtonElement;
  private portalModeTwoWay!: HTMLButtonElement;
  private portalTheme!: HTMLSelectElement;
  private portalVelocityMode!: HTMLSelectElement;
  private portalSpeedMultiplier!: HTMLInputElement;
  private portalSpeedValue!: HTMLElement;
  private portalSize!: HTMLInputElement;
  private portalSizeValue!: HTMLElement;
  private portalRadius!: HTMLInputElement;
  private portalRadiusValue!: HTMLElement;
  private portalPreserveOffset!: HTMLInputElement;
  private portalDirectionRule!: HTMLSelectElement;
  private portalTriggerBody!: HTMLSelectElement;
  private portalExitOffset!: HTMLInputElement;
  private portalExitOffsetValue!: HTMLElement;
  private portalShowLink!: HTMLInputElement;
  private portalShowDebug!: HTMLInputElement;
  private portalEnabled!: HTMLInputElement;
  private portalCooldown!: HTMLInputElement;
  private portalCooldownValue!: HTMLElement;
  private portalVisibility!: HTMLSelectElement;
  private portalAdvancedMode = false;
  private lineTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
  private convertTypeButtons: Map<LineType, HTMLButtonElement> = new Map();
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
    this.addToolGridBtn('portal', ICONS.portal, 'Portal');
    this.addToolGridBtn('eraser', ICONS.eraser, 'Erase');
    this.addToolGridBtn('edit', ICONS.edit, 'Edit');
    this.addToolGridBtn('select', ICONS.select, 'Select');
    this.addToolGridBtn('flag', ICONS.flag, 'Flag');

    // Onion skin toggle
    const onionCheckbox = document.getElementById('onion-checkbox') as HTMLInputElement;
    const mobileOnionBtn = document.getElementById('mobile-onion-btn') as HTMLButtonElement | null;
    if (onionCheckbox) {
      onionCheckbox.addEventListener('change', () => {
        this.onOnionSkinToggle?.(onionCheckbox.checked);
      });
    }

    // Snap toggle
    const snapCheckbox = document.getElementById('snap-checkbox') as HTMLInputElement;
    const mobileSnapBtn = document.getElementById('mobile-snap-btn') as HTMLButtonElement | null;
    if (snapCheckbox) {
      snapCheckbox.addEventListener('change', () => {
        this.onSnapToggle?.(snapCheckbox.checked);
      });
    }

    const bindMobileToggle = (
      checkbox: HTMLInputElement | null,
      button: HTMLButtonElement | null,
      activeLabel: string,
      inactiveLabel: string,
    ) => {
      if (!checkbox || !button) return;
      const sync = () => {
        button.classList.toggle('active', checkbox.checked);
        button.setAttribute('aria-pressed', checkbox.checked ? 'true' : 'false');
        button.title = checkbox.checked ? activeLabel : inactiveLabel;
      };
      sync();
      checkbox.addEventListener('change', sync);
      button.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };

    bindMobileToggle(onionCheckbox, mobileOnionBtn, 'Onion skin on', 'Onion skin off');
    bindMobileToggle(snapCheckbox, mobileSnapBtn, 'Snap to endpoints on', 'Snap to endpoints off');

    // Smooth UI (visible only when select tool is active)
    this.smoothContainer = document.getElementById('smooth-container') as HTMLElement;
    this.smoothBtn = document.getElementById('smooth-btn') as HTMLButtonElement;
    this.smoothSliderRow = document.getElementById('smooth-slider-row') as HTMLElement;
    this.smoothSlider = document.getElementById('smooth-slider') as HTMLInputElement;
    this.smoothValue = document.getElementById('smooth-value') as HTMLElement;
    this.selectedCount = document.getElementById('selected-count') as HTMLElement;
    const smoothApply = document.getElementById('smooth-apply') as HTMLButtonElement;
    const smoothCancel = document.getElementById('smooth-cancel') as HTMLButtonElement;
    const convertSolid = document.getElementById('convert-solid-btn') as HTMLButtonElement;
    const convertAccel = document.getElementById('convert-accel-btn') as HTMLButtonElement;
    const convertScene = document.getElementById('convert-scene-btn') as HTMLButtonElement;

    if (convertSolid) {
      convertSolid.addEventListener('click', () => this.onConvertSelectedType?.(LineType.SOLID));
      this.convertTypeButtons.set(LineType.SOLID, convertSolid);
    }
    if (convertAccel) {
      convertAccel.addEventListener('click', () => this.onConvertSelectedType?.(LineType.ACC));
      this.convertTypeButtons.set(LineType.ACC, convertAccel);
    }
    if (convertScene) {
      convertScene.addEventListener('click', () => this.onConvertSelectedType?.(LineType.SCENERY));
      this.convertTypeButtons.set(LineType.SCENERY, convertScene);
    }

    if (this.smoothBtn) {
      this.smoothBtn.addEventListener('click', () => {
        const started = this.onSmoothStart?.() ?? false;
        if (started) this.showSmoothSlider();
      });
    }
    if (this.smoothSlider) {
      this.smoothSlider.addEventListener('input', () => {
        const v = parseInt(this.smoothSlider.value, 10);
        this.smoothValue.textContent = `${v}%`;
        this.onSmoothChange?.(v / 100);
      });
    }
    if (smoothApply) {
      smoothApply.addEventListener('click', () => {
        this.onSmoothApply?.();
        this.hideSmoothSlider();
      });
    }
    if (smoothCancel) {
      smoothCancel.addEventListener('click', () => {
        this.onSmoothCancel?.();
        this.hideSmoothSlider();
      });
    }
    this.setSelectedLineState(0, false);

    // Portal UI
    this.portalSettings = document.getElementById('portal-settings') as HTMLElement;
    this.portalSelectionStatus = document.getElementById('portal-selection-status') as HTMLElement;
    this.portalEmptyHint = document.getElementById('portal-empty-hint') as HTMLElement;
    this.portalWarningBox = document.getElementById('portal-warning-box') as HTMLElement;
    this.portalSettingsFields = document.getElementById('portal-settings-fields') as HTMLElement;
    this.portalAdvancedFields = document.getElementById('portal-advanced-fields') as HTMLElement;
    this.portalDetailSimple = document.getElementById('portal-detail-simple') as HTMLButtonElement;
    this.portalDetailAdvanced = document.getElementById('portal-detail-advanced') as HTMLButtonElement;
    this.portalModeOneWay = document.getElementById('portal-mode-oneway') as HTMLButtonElement;
    this.portalModeTwoWay = document.getElementById('portal-mode-twoway') as HTMLButtonElement;
    this.portalTheme = document.getElementById('portal-theme') as HTMLSelectElement;
    this.portalVelocityMode = document.getElementById('portal-velocity-mode') as HTMLSelectElement;
    this.portalSpeedMultiplier = document.getElementById('portal-speed-mult') as HTMLInputElement;
    this.portalSpeedValue = document.getElementById('portal-speed-value') as HTMLElement;
    this.portalSize = document.getElementById('portal-size') as HTMLInputElement;
    this.portalSizeValue = document.getElementById('portal-size-value') as HTMLElement;
    this.portalRadius = document.getElementById('portal-radius') as HTMLInputElement;
    this.portalRadiusValue = document.getElementById('portal-radius-value') as HTMLElement;
    this.portalPreserveOffset = document.getElementById('portal-preserve-offset') as HTMLInputElement;
    this.portalDirectionRule = document.getElementById('portal-direction-rule') as HTMLSelectElement;
    this.portalTriggerBody = document.getElementById('portal-trigger-body') as HTMLSelectElement;
    this.portalExitOffset = document.getElementById('portal-exit-offset') as HTMLInputElement;
    this.portalExitOffsetValue = document.getElementById('portal-exit-offset-value') as HTMLElement;
    this.portalShowLink = document.getElementById('portal-show-link') as HTMLInputElement;
    this.portalShowDebug = document.getElementById('portal-show-debug') as HTMLInputElement;
    this.portalEnabled = document.getElementById('portal-enabled') as HTMLInputElement;
    this.portalCooldown = document.getElementById('portal-cooldown') as HTMLInputElement;
    this.portalCooldownValue = document.getElementById('portal-cooldown-value') as HTMLElement;
    this.portalVisibility = document.getElementById('portal-visibility') as HTMLSelectElement;

    this.portalDetailSimple?.addEventListener('click', () => this.setPortalInspectorMode(false));
    this.portalDetailAdvanced?.addEventListener('click', () => this.setPortalInspectorMode(true));
    this.portalModeOneWay?.addEventListener('click', () => this.onPortalModeChange?.('oneWay'));
    this.portalModeTwoWay?.addEventListener('click', () => this.onPortalModeChange?.('twoWay'));
    this.portalTheme?.addEventListener('change', () => {
      const theme = this.portalTheme.value === 'amber'
        ? 'amber'
        : this.portalTheme.value === 'mint'
          ? 'mint'
          : 'violet';
      this.onPortalThemeChange?.(theme);
    });
    this.portalVelocityMode?.addEventListener('change', () => {
      this.onPortalVelocityModeChange?.((this.portalVelocityMode.value === 'world' ? 'world' : 'remap'));
    });
    this.portalSpeedMultiplier?.addEventListener('input', () => {
      const value = parseFloat(this.portalSpeedMultiplier.value || '1');
      this.portalSpeedValue.textContent = `${value.toFixed(2)}x`;
      this.onPortalSpeedMultiplierChange?.(value);
    });
    this.portalSize?.addEventListener('input', () => {
      const value = parseInt(this.portalSize.value || '34', 10);
      this.portalSizeValue.textContent = String(value);
      this.onPortalSizeChange?.(value);
    });
    this.portalRadius?.addEventListener('input', () => {
      const value = parseInt(this.portalRadius.value || '10', 10);
      this.portalRadiusValue.textContent = String(value);
      this.onPortalRadiusChange?.(value);
    });
    this.portalPreserveOffset?.addEventListener('change', () => {
      this.onPortalPreserveOffsetChange?.(this.portalPreserveOffset.checked);
    });
    this.portalDirectionRule?.addEventListener('change', () => {
      const rule = this.portalDirectionRule.value === 'frontOnly'
        ? 'frontOnly'
        : this.portalDirectionRule.value === 'backOnly'
          ? 'backOnly'
          : 'any';
      this.onPortalDirectionRuleChange?.(rule);
    });
    this.portalTriggerBody?.addEventListener('change', () => {
      const body = this.portalTriggerBody.value === 'center'
        ? 'center'
        : this.portalTriggerBody.value === 'front'
          ? 'front'
          : this.portalTriggerBody.value === 'rear'
            ? 'rear'
            : 'auto';
      this.onPortalTriggerBodyChange?.(body);
    });
    this.portalExitOffset?.addEventListener('input', () => {
      const value = parseInt(this.portalExitOffset.value || '3', 10);
      this.portalExitOffsetValue.textContent = String(value);
      this.onPortalExitOffsetChange?.(value);
    });
    this.portalShowLink?.addEventListener('change', () => {
      this.onPortalShowEditorLinkChange?.(this.portalShowLink.checked);
    });
    this.portalShowDebug?.addEventListener('change', () => {
      this.onPortalShowDebugChange?.(this.portalShowDebug.checked);
    });
    this.portalEnabled?.addEventListener('change', () => {
      this.onPortalEnabledChange?.(this.portalEnabled.checked);
    });
    this.portalCooldown?.addEventListener('input', () => {
      const value = parseInt(this.portalCooldown.value || '10', 10);
      this.portalCooldownValue.textContent = `${value}f`;
      this.onPortalCooldownChange?.(value);
    });
    this.portalVisibility?.addEventListener('change', () => {
      this.onPortalVisibilityChange?.(
        this.portalVisibility.value === 'always'
          ? 'always'
          : this.portalVisibility.value === 'activation'
            ? 'activation'
            : 'subtle',
      );
    });
    this.setPortalInspectorMode(false);
    this.setPortalState(false, null, false);

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

      // Audio scrub preview (fires on every input for immediate feedback)
      this.onTimelineScrub?.(frame);

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
    const topbar = document.getElementById('topbar');
    const topbarActions = document.getElementById('topbar-actions');
    const mobileActionsHost = document.getElementById('mobile-actions-host');
    const btnSound = document.getElementById('btn-sound');
    const btnDesktopLayout = document.getElementById('btn-desktop-layout') as HTMLButtonElement | null;
    const btnMobileDock = document.getElementById('btn-mobile-dock') as HTMLButtonElement | null;
    const btnEffects = document.getElementById('btn-effects');
    const btnSettings = document.getElementById('btn-settings');
    const hotkeysClose = document.getElementById('hotkeys-close');

    const desktopLayoutKey = 'line-rider-desktop-tools-layout';
    const applyDesktopLayoutMode = (mode: 'sidebar' | 'top') => {
      document.body.classList.toggle('desktop-top-tools', mode === 'top');
      if (!btnDesktopLayout) return;
      btnDesktopLayout.classList.toggle('active', mode === 'top');
      btnDesktopLayout.setAttribute('aria-pressed', mode === 'top' ? 'true' : 'false');
      btnDesktopLayout.title = mode === 'top'
        ? 'Switch to sidebar tools'
        : 'Switch to top tools';
      btnDesktopLayout.setAttribute('aria-label', btnDesktopLayout.title);
    };

    let desktopLayoutMode: 'sidebar' | 'top' = 'sidebar';
    try {
      const savedMode = window.localStorage.getItem(desktopLayoutKey);
      if (savedMode === 'top') desktopLayoutMode = 'top';
    } catch {}
    applyDesktopLayoutMode(desktopLayoutMode);
    btnDesktopLayout?.addEventListener('click', () => {
      desktopLayoutMode = desktopLayoutMode === 'sidebar' ? 'top' : 'sidebar';
      applyDesktopLayoutMode(desktopLayoutMode);
      try {
        window.localStorage.setItem(desktopLayoutKey, desktopLayoutMode);
      } catch {}
    });

    const mobileDockKey = 'line-rider-mobile-dock-mode';
    const applyMobileDockMode = (mode: 'center' | 'edge') => {
      document.body.classList.toggle('mobile-dock-edge', mode === 'edge');
      if (!btnMobileDock) return;
      btnMobileDock.classList.toggle('active', mode === 'edge');
      btnMobileDock.setAttribute('aria-pressed', mode === 'edge' ? 'true' : 'false');
      btnMobileDock.title = mode === 'edge'
        ? 'Float tools near the top center'
        : 'Dock tools to the right edge';
      btnMobileDock.setAttribute('aria-label', btnMobileDock.title);
    };

    let mobileDockMode: 'center' | 'edge' = 'center';
    try {
      const savedMode = window.localStorage.getItem(mobileDockKey);
      if (savedMode === 'edge') mobileDockMode = 'edge';
    } catch {}
    applyMobileDockMode(mobileDockMode);
    btnMobileDock?.addEventListener('click', () => {
      mobileDockMode = mobileDockMode === 'center' ? 'edge' : 'center';
      applyMobileDockMode(mobileDockMode);
      try {
        window.localStorage.setItem(mobileDockKey, mobileDockMode);
      } catch {}
    });

    const syncActionMount = () => {
      if (!topbar || !topbarActions || !mobileActionsHost) return;
      if (window.innerWidth <= 899) {
        if (topbarActions.parentElement !== mobileActionsHost) {
          mobileActionsHost.appendChild(topbarActions);
        }
      } else if (topbarActions.parentElement !== topbar) {
        topbar.appendChild(topbarActions);
      }
    };
    syncActionMount();
    window.addEventListener('resize', syncActionMount);

    // Sound button is handled directly in main.ts (opens audio panel)
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
    if (this.smoothContainer) {
      this.smoothContainer.style.display = name === 'select' ? '' : 'none';
      if (name !== 'select') this.hideSmoothSlider();
    }
    if (this.portalSettings) {
      this.portalSettings.style.display = name === 'portal' ? '' : 'none';
    }
  }

  showSmoothSlider() {
    if (this.smoothBtn) this.smoothBtn.style.display = 'none';
    if (this.smoothSliderRow) this.smoothSliderRow.style.display = '';
    if (this.smoothSlider) {
      this.smoothSlider.value = '0';
      this.smoothValue.textContent = '0%';
    }
  }

  hideSmoothSlider() {
    if (this.smoothBtn) this.smoothBtn.style.display = '';
    if (this.smoothSliderRow) this.smoothSliderRow.style.display = 'none';
  }

  setSelectedLineState(count: number, smoothing: boolean) {
    const hasSelection = count > 0;
    if (this.selectedCount) {
      this.selectedCount.textContent = smoothing
        ? `Smoothing ${count}`
        : (hasSelection ? `${count} selected` : 'No selection');
    }
    for (const btn of this.convertTypeButtons.values()) {
      btn.disabled = !hasSelection || smoothing;
    }
    if (this.smoothBtn) {
      this.smoothBtn.disabled = !hasSelection || smoothing;
    }
  }

  setPortalState(
    active: boolean,
    portal: PortalPair | null,
    placing: boolean,
    activeEndpoint: 'entry' | 'exit' | null = null,
    diagnostics: { messages: string[] } | null = null,
  ) {
    if (!this.portalSettings) return;
    this.portalSettings.style.display = active ? '' : 'none';
    if (!active) return;

    const hasPortal = !!portal;
    this.portalSelectionStatus.textContent = placing
      ? 'Place exit'
      : hasPortal
        ? `${portal!.name} · ${activeEndpoint === 'exit' ? 'Exit' : 'Entry'}`
        : 'Place entry';
    this.portalEmptyHint.style.display = hasPortal ? 'none' : '';
    this.portalEmptyHint.textContent = placing
      ? 'Click a second point to place the exit portal.'
      : 'Click once to place the entry portal, then click again to place the exit. Select a portal to rotate or stretch its endpoints.';
    if (hasPortal && !placing) {
      this.portalSelectionStatus.textContent = `${portal!.name}: ${activeEndpoint === 'exit' ? 'Exit' : 'Entry'}`;
    }
    this.portalSettingsFields.style.display = hasPortal ? '' : 'none';
    const warningMessages = diagnostics?.messages ?? [];
    this.portalWarningBox.style.display = warningMessages.length > 0 ? '' : 'none';
    this.portalWarningBox.textContent = warningMessages.join(' ');

    const disableFields = !hasPortal;
    this.portalDetailSimple.disabled = disableFields;
    this.portalDetailAdvanced.disabled = disableFields;
    this.portalModeOneWay.disabled = disableFields;
    this.portalModeTwoWay.disabled = disableFields;
    this.portalTheme.disabled = disableFields;
    this.portalVelocityMode.disabled = disableFields;
    this.portalSpeedMultiplier.disabled = disableFields;
    this.portalSize.disabled = disableFields;
    this.portalRadius.disabled = disableFields;
    this.portalPreserveOffset.disabled = disableFields;
    this.portalDirectionRule.disabled = disableFields;
    this.portalTriggerBody.disabled = disableFields;
    this.portalExitOffset.disabled = disableFields;
    this.portalShowLink.disabled = disableFields;
    this.portalShowDebug.disabled = disableFields;
    this.portalEnabled.disabled = disableFields;
    this.portalCooldown.disabled = disableFields;
    this.portalVisibility.disabled = disableFields;

    if (!portal) {
      this.portalModeOneWay.classList.remove('active');
      this.portalModeTwoWay.classList.remove('active');
      this.portalTheme.value = 'violet';
      this.portalShowLink.checked = false;
      this.portalShowDebug.checked = false;
      this.portalEnabled.checked = true;
      return;
    }

    this.portalModeOneWay.classList.toggle('active', portal.mode === 'oneWay');
    this.portalModeTwoWay.classList.toggle('active', portal.mode === 'twoWay');
    this.portalTheme.value = portal.visual.colorTheme;
    this.portalVelocityMode.value = portal.physics.velocityMode;
    this.portalSpeedMultiplier.value = String(portal.physics.speedMultiplier);
    this.portalSpeedValue.textContent = `${portal.physics.speedMultiplier.toFixed(2)}x`;
    this.portalSize.value = String(Math.round((portal.entry.length + portal.exit.length) / 2));
    this.portalSizeValue.textContent = this.portalSize.value;
    this.portalRadius.value = String(Math.round((portal.entry.radius + portal.exit.radius) / 2));
    this.portalRadiusValue.textContent = this.portalRadius.value;
    this.portalPreserveOffset.checked = portal.physics.preserveLocalOffset;
    this.portalDirectionRule.value = portal.physics.entryDirectionRule;
    this.portalTriggerBody.value = portal.physics.triggerBody;
    this.portalExitOffset.value = String(portal.physics.exitOffset);
    this.portalExitOffsetValue.textContent = this.portalExitOffset.value;
    this.portalShowLink.checked = portal.visual.showEditorLink;
    this.portalShowDebug.checked = portal.visual.showDebug;
    this.portalEnabled.checked = portal.enabled;
    this.portalCooldown.value = String(portal.physics.cooldownFrames);
    this.portalCooldownValue.textContent = `${portal.physics.cooldownFrames}f`;
    this.portalVisibility.value = portal.visual.visibility;
  }

  private setPortalInspectorMode(advanced: boolean) {
    this.portalAdvancedMode = advanced;
    this.portalDetailSimple?.classList.toggle('active', !advanced);
    this.portalDetailAdvanced?.classList.toggle('active', advanced);
    this.portalAdvancedFields.style.display = advanced ? '' : 'none';
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
