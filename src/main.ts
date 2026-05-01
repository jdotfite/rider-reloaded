import { Vec2 } from './math/Vec2';
import { Camera } from './camera/Camera';
import { Renderer } from './rendering/Renderer';
import { PaperGridRenderer } from './rendering/PaperGridRenderer';
import { LineRenderer } from './rendering/LineRenderer';
import { FlagRenderer } from './rendering/FlagRenderer';
import { UIRenderer } from './rendering/UIRenderer';
import { InputManager } from './input/InputManager';
import { PencilTool } from './input/tools/PencilTool';
import { LineTool } from './input/tools/LineTool';
import { EraserTool } from './input/tools/EraserTool';
import { FlagTool } from './input/tools/FlagTool';
import { SelectTool } from './input/tools/SelectTool';
import { EditTool } from './input/tools/EditTool';
import { DrawEditTool } from './input/tools/DrawEditTool';
import { GeneratorTool } from './input/tools/GeneratorTool';
import { PortalTool } from './input/tools/PortalTool';
import { TrackStore } from './store/TrackStore';
import { Rider } from './physics/Rider';
import { PhysicsEngine } from './physics/PhysicsEngine';
import { SpatialGrid } from './physics/grid/SpatialGrid';
import { GameLoop } from './game/GameLoop';
import { GameState } from './game/GameState';
import { Toolbar } from './ui/Toolbar';
import { LineType } from './physics/lines/LineTypes';
import { Tool } from './input/tools/Tool';
import { ERASER_RADIUS, TIMESTEP } from './constants';
import { TriggerStore } from './store/TriggerStore';
import { TriggerRenderer } from './rendering/TriggerRenderer';
import { PortalRenderer, PortalRenderEvent } from './rendering/PortalRenderer';
import { VEHICLE_MANIFESTS, getVehicleManifest } from './vehicles';
import type { VehicleRenderer } from './vehicles';
import { AudioPlayer } from './audio/AudioPlayer';
import { PortalAudio } from './audio/PortalAudio';
import { WaveformRenderer } from './audio/WaveformRenderer';
import { parseYouTubeId, YouTubePlayer } from './audio/youtube';
import {
  clampEditorGridSize,
  DEFAULT_EDITOR_GRID_MAJOR_EVERY,
  DEFAULT_EDITOR_GRID_SIZE,
  type EditorGridSettings,
} from './editor/GridMath';
import { buildCloudGeneratorAssets } from './stamps/cloudAssets';
import {
  buildGeneratorAssets,
  buildGeneratorPreviewMarkup,
  computeGeneratedSegmentBounds,
  formatGeneratorControlValue,
  sanitizeGeneratorSettings,
  type GeneratorAsset,
  type GeneratorSettings,
} from './generators/catalog';
import { exportTrackAsSvg } from './export/svgExport';

interface EditorPreferences {
  endpointSnapEnabled: boolean;
  paperGrid: EditorGridSettings;
  cameraFollowStrength: number;
}

const EDITOR_PREFERENCES_KEY = 'line-rider-editor-preferences';
const GENERATOR_LINE_TYPE_LABELS: Record<LineType, string> = {
  [LineType.SOLID]: 'Solid',
  [LineType.ACC]: 'Accel',
  [LineType.SCENERY]: 'Scenery',
};

function loadEditorPreferences(): EditorPreferences {
  const defaults: EditorPreferences = {
    endpointSnapEnabled: true,
    paperGrid: {
      enabled: true,
      snapEnabled: false,
      size: DEFAULT_EDITOR_GRID_SIZE,
      majorEvery: DEFAULT_EDITOR_GRID_MAJOR_EVERY,
    },
    cameraFollowStrength: 50,
  };

  try {
    const raw = window.localStorage.getItem(EDITOR_PREFERENCES_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<EditorPreferences> & {
      paperGrid?: Partial<EditorGridSettings>;
    };

    return {
      endpointSnapEnabled: parsed.endpointSnapEnabled ?? defaults.endpointSnapEnabled,
      paperGrid: {
        enabled: parsed.paperGrid?.enabled ?? defaults.paperGrid.enabled,
        snapEnabled: parsed.paperGrid?.snapEnabled ?? defaults.paperGrid.snapEnabled,
        size: clampEditorGridSize(parsed.paperGrid?.size ?? defaults.paperGrid.size),
        majorEvery: Math.max(2, Math.round(parsed.paperGrid?.majorEvery ?? defaults.paperGrid.majorEvery)),
      },
      cameraFollowStrength: clampCameraFollowStrength(
        typeof parsed.cameraFollowStrength === 'number'
          ? parsed.cameraFollowStrength
          : defaults.cameraFollowStrength,
      ),
    };
  } catch {
    return defaults;
  }
}

function saveEditorPreferences(preferences: EditorPreferences) {
  try {
    window.localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch { /* ignore */ }
}

function clampCameraFollowStrength(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Core
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const editorPreferences = loadEditorPreferences();
const store = new TrackStore();
store.onMutation = () => {
  markGridDirty();
  scheduleAutosave();
};
const grid = new SpatialGrid();
const triggerStore = new TriggerStore();
const triggerRenderer = new TriggerRenderer();
const portalRenderer = new PortalRenderer();
const audioPlayer = new AudioPlayer();
const portalAudio = new PortalAudio();
const ytPlayer = new YouTubePlayer();
const waveformCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const waveformRenderer = new WaveformRenderer(waveformCanvas);
const paperGridRenderer = new PaperGridRenderer(camera, () => paperGrid);
const hudBeat = document.getElementById('hud-beat') as HTMLElement;
const statBeat = document.getElementById('stat-beat') as HTMLElement;
const metronomeFlash = document.getElementById('metronome-flash') as HTMLElement;
let lastBeatIndex = -1; // track which beat we were on to detect crossings
let portalCameraBias: { target: Vec2; strength: number; framesLeft: number } | null = null;
let endpointSnapEnabled = editorPreferences.endpointSnapEnabled;
const paperGrid: EditorGridSettings = { ...editorPreferences.paperGrid };

// Unified audio helpers — forward to whichever source is loaded
function audioPlay() {
  if (audioPlayer.loaded) { audioPlayer.playbackRate = gameLoop.playbackSpeed; audioPlayer.play(); }
  if (ytPlayer.loaded) { ytPlayer.playbackRate = gameLoop.playbackSpeed; ytPlayer.play(); }
}
function audioPause() {
  audioPlayer.pause();
  ytPlayer.pause();
}
function audioStop() {
  audioPlayer.stop();
  ytPlayer.stop();
}
function audioSeekFrame(frame: number) {
  audioPlayer.seekToFrame(frame);
  ytPlayer.seekToFrame(frame);
}
function audioSyncFrame(frame: number) {
  if (audioPlayer.loaded) audioPlayer.syncToFrame(frame);
  if (ytPlayer.loaded) ytPlayer.syncToFrame(frame);
}
function audioSetSpeed(speed: number) {
  audioPlayer.playbackRate = speed;
  ytPlayer.playbackRate = speed;
}
function audioAnyLoaded(): boolean {
  return audioPlayer.loaded || ytPlayer.loaded;
}

// Start position
store.startPosition = new Vec2(0, 0);

// Rider + Physics
let rider = new Rider(store.startPosition);
let physics = new PhysicsEngine(
  rider,
  grid,
  () => store.portals.filter(portal => portal.enabled && (store.layers.find(layer => layer.id === portal.layer)?.visible ?? true)),
);
const portalFxEvents: PortalRenderEvent[] = [];
physics.onPortalTeleport = (event) => {
  portalFxEvents.push({
    pairId: event.pairId,
    entryPosition: { x: event.entryPosition.x, y: event.entryPosition.y },
    exitPosition: { x: event.exitPosition.x, y: event.exitPosition.y },
    startedAt: performance.now(),
  });
  portalAudio.playTeleport(event.theme, event.speed);
  portalCameraBias = {
    target: event.exitPosition.clone(),
    strength: 0.42,
    framesLeft: 10,
  };
};

// Sub-renderers
const lineRenderer = new LineRenderer();
const flagRenderer = new FlagRenderer();
const uiRenderer = new UIRenderer();
const vehicleRenderers = new Map<string, VehicleRenderer>(
  VEHICLE_MANIFESTS.map(vehicle => [vehicle.id, vehicle.createRenderer()]),
);

// Vehicle state
let activeVehicle = getVehicleManifest(localStorage.getItem('line-rider-vehicle') ?? 'sled');

function resetVehicleRenderers() {
  for (const renderer of vehicleRenderers.values()) {
    renderer.reset?.();
  }
}

function setVehicle(id: string) {
  const vehicle = getVehicleManifest(id);
  if (vehicle.available === false) return;
  activeVehicle = vehicle;
  localStorage.setItem('line-rider-vehicle', id);
  resetVehicleRenderers();
  rider.setVehicle(vehicle.physics);
  // Update topbar sled info
  const sledInfo = document.querySelector('#sled-info span');
  if (sledInfo) sledInfo.textContent = vehicle.name;
  updateVehiclePickerSummary();
  updateVehiclePickerSelection();
}

function renderVehicle(ctx: CanvasRenderingContext2D, data: import('./rendering/RiderRenderer').RiderRenderData) {
  vehicleRenderers.get(activeVehicle.id)?.render(ctx, data);
}

// Current state
let currentLineType: LineType = LineType.SOLID;
let currentTool: Tool;
let currentToolName = 'pencil';

// Tools
const rawPencilTool = new PencilTool(
  store,
  () => currentLineType,
  () => endpointSnapEnabled,
  () => paperGrid.snapEnabled,
  () => paperGrid.size,
  () => camera.zoom,
);
const rawLineTool = new LineTool(
  store,
  () => currentLineType,
  () => endpointSnapEnabled,
  () => paperGrid.snapEnabled,
  () => paperGrid.size,
  () => camera.zoom,
);
const eraserTool = new EraserTool(store);
const selectTool = new SelectTool(
  store,
  () => paperGrid.snapEnabled,
  () => paperGrid.size,
  () => camera.zoom,
);
const editTool = new EditTool(
  store,
  () => camera.zoom,
  () => endpointSnapEnabled,
  () => paperGrid.snapEnabled,
  () => paperGrid.size,
);
const portalTool = new PortalTool(
  store,
  () => camera.zoom,
  () => endpointSnapEnabled,
  () => paperGrid.snapEnabled,
  () => paperGrid.size,
  () => currentToolName === 'portal',
);
const pencilTool = new DrawEditTool('pencil', rawPencilTool, portalTool, editTool);
const lineTool = new DrawEditTool('line', rawLineTool, portalTool, editTool);
const selectAmbientTool = new DrawEditTool('select', selectTool, portalTool);
const generatorTool = new GeneratorTool(
  store,
  () => currentLineType,
  () => getActiveGeneratorSettings(),
  () => paperGrid.snapEnabled,
  () => paperGrid.size,
  () => camera.zoom,
);
portalTool.onPortalCreated = (portal) => {
  portalFxEvents.push({
    pairId: portal.id,
    entryPosition: { x: portal.entry.position.x, y: portal.entry.position.y },
    exitPosition: { x: portal.exit.position.x, y: portal.exit.position.y },
    startedAt: performance.now(),
  });
  portalAudio.playPlacement(portal.visual.colorTheme);
};
const flagTool = new FlagTool((position) => {
  if (!store.setStartPosition(position)) return;
  rider.setStartPosition(store.startPosition);
}, () => paperGrid.snapEnabled, () => paperGrid.size, () => camera.zoom);
const cloudGeneratorAssets = buildCloudGeneratorAssets();
const generatorAssets = buildGeneratorAssets();
const allGeneratorAssets = [...generatorAssets, ...cloudGeneratorAssets];
const generatorSettingsById = new Map<string, GeneratorSettings>(
  allGeneratorAssets.map((asset) => [asset.id, { ...asset.defaultSettings }]),
);
let generatorResumeToolName = currentToolName;
let activeGeneratorId: string | null = null;
let selectedGeneratorId: string | null = generatorAssets[0]?.id ?? null;
let generatorLineType: string = 'solid';
let generatorFlipped = false;
generatorTool.onCancel = () => cancelGeneratorPlacement();
currentTool = pencilTool;
const loadInput = document.createElement('input');
loadInput.type = 'file';
loadInput.accept = '.track.json,.json,application/json';
loadInput.style.display = 'none';
document.body.appendChild(loadInput);

const layerRenameInput = document.getElementById('layer-rename-input') as HTMLInputElement | null;
const layerRenameSave = document.getElementById('layer-rename-save') as HTMLButtonElement | null;
const layerRenameCancel = document.getElementById('layer-rename-cancel') as HTMLButtonElement | null;

// Input
const input = new InputManager(canvas, camera);
input.setTool(currentTool);
input.getGameState = () => gameLoop.state;

input.onPlayPauseToggle = () => {
  if (gameLoop.state === GameState.EDITING) {
    startPlayback();
  } else if (gameLoop.state === GameState.PAUSED) {
    ensureGridFresh();
    gameLoop.play();
    audioPlay();
  } else {
    gameLoop.pause();
    audioPause();
  }
};
input.onStop = () => stopPlayback();
input.onFitView = () => fitView();
input.onUndo = () => {
  if (canEdit()) store.undo();
};
input.onRedo = () => {
  if (canEdit()) store.redo();
};
input.onToolSwitch = (name: string) => switchTool(name);
input.onLineTypeSwitch = (type: string) => {
  const lt = type as LineType;
  currentLineType = lt;
  toolbar.setActiveLineType(lt);
  renderGeneratorDetail();
};
input.onClearTrack = () => confirmNewTrack();
input.onQuickEraseStart = (worldPos) => beginQuickErase(worldPos);
input.onQuickEraseMove = (worldPos) => continueQuickErase(worldPos);
input.onQuickEraseEnd = () => endQuickErase();
input.onSaveTrack = () => saveTrack();
input.onLoadTrack = () => openLoadDialog();
input.onGridToggle = () => setPaperGridEnabled(!paperGrid.enabled);
input.onGridSnapToggle = () => setPaperGridSnapEnabled(!paperGrid.snapEnabled);

// Camera follow state
let cameraFollowing = false;
let onionSkinning = false;
let savedCameraPos: Vec2 | null = null;
let savedCameraZoom: number = 1;
let cameraFollowStrength = clampCameraFollowStrength(editorPreferences.cameraFollowStrength);
let gridDirty = false; // Track changes made while paused

function canEdit(): boolean {
  return gameLoop.state === GameState.EDITING || gameLoop.state === GameState.PAUSED;
}

function getGeneratorAssetById(id: string | null): GeneratorAsset | null {
  if (!id) return null;
  return allGeneratorAssets.find((asset) => asset.id === id) ?? null;
}

function getGeneratorSettingsState(id: string | null): GeneratorSettings | null {
  const asset = getGeneratorAssetById(id);
  if (!asset) return null;
  const existing = generatorSettingsById.get(asset.id);
  if (existing) return existing;
  const defaults = { ...asset.defaultSettings };
  generatorSettingsById.set(asset.id, defaults);
  return defaults;
}

function getActiveGeneratorSettings(): GeneratorSettings | null {
  return getGeneratorSettingsState(activeGeneratorId);
}

function persistEditorPreferences() {
  saveEditorPreferences({
    endpointSnapEnabled,
    paperGrid: { ...paperGrid },
    cameraFollowStrength,
  });
}

function setEndpointSnapEnabled(enabled: boolean) {
  endpointSnapEnabled = enabled;
  toolbar.setEndpointSnapEnabled(endpointSnapEnabled);
  persistEditorPreferences();
}

function setPaperGridEnabled(enabled: boolean) {
  paperGrid.enabled = enabled;
  toolbar.setGridState(paperGrid.enabled, paperGrid.snapEnabled, paperGrid.size);
  persistEditorPreferences();
}

function setPaperGridSnapEnabled(enabled: boolean) {
  paperGrid.snapEnabled = enabled;
  toolbar.setGridState(paperGrid.enabled, paperGrid.snapEnabled, paperGrid.size);
  persistEditorPreferences();
}

function setPaperGridSize(size: number) {
  paperGrid.size = clampEditorGridSize(size);
  toolbar.setGridState(paperGrid.enabled, paperGrid.snapEnabled, paperGrid.size);
  persistEditorPreferences();
}

function markGridDirty() {
  gridDirty = true;
}

/** Rebuild grid + re-simulate to current frame (e.g. after edits while paused) */
function ensureGridFresh() {
  gridDirty = false;
  const currentFrame = gameLoop.frame;
  grid.rebuild(store.lines);
  rider.reset();
  gameLoop.resetSimulation();
  gameLoop.seekToFrame(currentFrame);
}

// Toolbar
const toolbar = new Toolbar();
toolbar.setActiveTool('pencil');
toolbar.setActiveLineType(LineType.SOLID);
toolbar.setPlaybackState(GameState.EDITING);
toolbar.setEndpointSnapEnabled(endpointSnapEnabled);
toolbar.setGridState(paperGrid.enabled, paperGrid.snapEnabled, paperGrid.size);
toolbar.setLayerState(store.layers, store.getActiveLayerIndex());
renderer.addBackgroundRenderCallback((ctx) => {
  if (gameLoop.state === GameState.PLAYING) return;
  paperGridRenderer.render(ctx);
});

// Game loop
const gameLoop = new GameLoop(physics, () => {
  renderer.render();
  toolbar.setPlaybackState(gameLoop.state);
  toolbar.setLayerState(store.layers, store.getActiveLayerIndex());

  // Update stats in canvas HUD
  const speed = rider.getCenterSpeed() * (1000 / TIMESTEP);
  toolbar.updateStats(store.lines.length, speed);
  toolbar.setSelectedLineState(
    selectTool.getSelectedCount(),
    selectTool.isSmoothing(),
    selectTool.hasSelectedAccelerationLines(),
  );
  const portalInspectorActive = currentToolName === 'portal' || portalTool.isPlacing() || portalTool.getSelectedPortalId() !== null;
  const portalDiagnostics = portalInspectorActive ? portalTool.getDiagnostics() : null;
  toolbar.setPortalState(
    portalInspectorActive,
    portalInspectorActive ? portalTool.getSelectedPortal() : null,
    currentToolName === 'portal' && portalTool.isPlacing(),
    portalInspectorActive ? portalTool.getActiveEndpoint() : null,
    portalDiagnostics,
  );

  // Update beat HUD counter
  if (waveformRenderer.bpm > 0 && gameLoop.state !== GameState.EDITING) {
    const fps = 1000 / TIMESTEP;
    const beatInterval = 60 / waveformRenderer.bpm;
    const currentSeconds = gameLoop.frame / fps;
    const offsetSeconds = waveformRenderer.beatOffset;
    const relTime = currentSeconds - offsetSeconds;
    const currentBeatFloat = relTime / beatInterval;
    const nextBeatIndex = Math.ceil(currentBeatFloat);
    const nextBeatSeconds = nextBeatIndex * beatInterval + offsetSeconds;
    const framesToNext = Math.max(0, Math.round((nextBeatSeconds - currentSeconds) * fps));
    const beatNum = Math.floor(currentBeatFloat);
    const measure = Math.floor(beatNum / 4) + 1;
    const beat = (((beatNum % 4) + 4) % 4) + 1;
    statBeat.textContent = `${measure}:${beat}  +${framesToNext}f`;
    hudBeat.style.display = '';

    // Metronome flash on beat crossing
    if (gameLoop.state === GameState.PLAYING && beatNum !== lastBeatIndex && beatNum >= 0) {
      lastBeatIndex = beatNum;
      const isDownbeat = beatNum % 4 === 0;
      metronomeFlash.style.background = isDownbeat
        ? 'radial-gradient(ellipse at center, rgba(255,80,80,0.12) 0%, transparent 70%)'
        : 'radial-gradient(ellipse at center, rgba(100,100,255,0.08) 0%, transparent 70%)';
      metronomeFlash.classList.remove('flash');
      void metronomeFlash.offsetWidth; // force reflow to restart animation
      metronomeFlash.classList.add('flash');
    }
  } else {
    hudBeat.style.display = 'none';
    lastBeatIndex = -1;
  }

  // Update timeline always (shows 0:00 when stopped, current position during playback)
  toolbar.updateTimeline(gameLoop.frame, Math.max(gameLoop.maxFrame, gameLoop.frame));

  // Audio drift correction during playback
  if (gameLoop.state === GameState.PLAYING) {
    audioSyncFrame(gameLoop.frame);
  }

  // Update waveform visualization (also draws beat grid even without audio)
  if (waveformRenderer.hasAudio || waveformRenderer.bpm > 0) {
    waveformRenderer.draw(gameLoop.frame, Math.max(gameLoop.maxFrame, gameLoop.frame));
  }

  uiRenderer.update({
    frame: gameLoop.frame,
    state: gameLoop.state,
    lineCount: store.lines.length,
    speed,
  });
});

// Wire snapshot system for fast timeline seeking
gameLoop.setSnapshotCallbacks(
  () => rider.saveSnapshot(),
  (snap) => rider.restoreSnapshot(snap),
  () => rider.reset(),
);

// ── Beat position recording ──
// Record rider center position at every frame for beat marker rendering
const riderPositions: Array<{ x: number; y: number }> = [];

gameLoop.onFrame = (frame: number) => {
  const center = rider.getCenter(1);
  // Ensure array is large enough (seekToFrame may jump around)
  while (riderPositions.length < frame) {
    riderPositions.push({ x: 0, y: 0 });
  }
  riderPositions[frame - 1] = { x: center.x, y: center.y };
};

toolbar.onToolSelect = (name) => switchTool(name);
toolbar.onOnionSkinToggle = (enabled) => {
  onionSkinning = enabled;
};
toolbar.onSnapToggle = (enabled) => {
  setEndpointSnapEnabled(enabled);
};
toolbar.onGridToggle = (enabled) => {
  setPaperGridEnabled(enabled);
};
toolbar.onGridSnapToggle = (enabled) => {
  setPaperGridSnapEnabled(enabled);
};
toolbar.onGridSizeChange = (size) => {
  setPaperGridSize(size);
};

// Wire Settings modal grid controls to the same state functions
{
  const settingsGridCheckbox = document.getElementById('settings-grid-checkbox') as HTMLInputElement | null;
  const settingsGridSnapCheckbox = document.getElementById('settings-grid-snap-checkbox') as HTMLInputElement | null;
  const settingsGridSizeInput = document.getElementById('settings-grid-size-input') as HTMLInputElement | null;
  const settingsGridSizeValue = document.getElementById('settings-grid-size-value') as HTMLElement | null;

  // Keep settings panel controls in sync with grid state
  const syncSettingsGridControls = () => {
    if (settingsGridCheckbox) settingsGridCheckbox.checked = paperGrid.enabled;
    if (settingsGridSnapCheckbox) settingsGridSnapCheckbox.checked = paperGrid.snapEnabled;
    if (settingsGridSizeInput) settingsGridSizeInput.value = String(paperGrid.size);
    if (settingsGridSizeValue) settingsGridSizeValue.textContent = String(paperGrid.size);
  };
  syncSettingsGridControls();

  settingsGridCheckbox?.addEventListener('change', () => setPaperGridEnabled(settingsGridCheckbox.checked));
  settingsGridSnapCheckbox?.addEventListener('change', () => setPaperGridSnapEnabled(settingsGridSnapCheckbox.checked));
  settingsGridSizeInput?.addEventListener('input', () => {
    const size = parseInt(settingsGridSizeInput.value || '24', 10);
    if (settingsGridSizeValue) settingsGridSizeValue.textContent = String(size);
    setPaperGridSize(size);
  });

  // Sync when settings modal opens (grid state may have changed via keyboard shortcuts)
  document.getElementById('btn-settings')?.addEventListener('click', syncSettingsGridControls);
}
toolbar.onSmoothStart = () => selectTool.startSmooth();
toolbar.onSmoothChange = (amount) => selectTool.setSmoothAmount(amount);
toolbar.onSmoothApply = () => selectTool.applySmooth();
toolbar.onSmoothCancel = () => selectTool.cancelSmooth();
toolbar.onFlipSelection = () => {
  if (currentToolName === 'select') {
    selectTool.flipSelected();
  }
};
toolbar.onReverseAccelSelection = () => {
  if (currentToolName === 'select') {
    selectTool.reverseAccelSelected();
  }
};
toolbar.onConvertSelectedType = (type) => {
  if (currentToolName === 'select') {
    selectTool.changeSelectedType(type);
  }
};
toolbar.onPortalModeChange = (mode) => portalTool.setSelectedPortalMode(mode);
toolbar.onPortalThemeChange = (theme) => portalTool.setSelectedColorTheme(theme);
toolbar.onPortalVelocityModeChange = (mode) => portalTool.setSelectedVelocityMode(mode);
toolbar.onPortalSpeedMultiplierChange = (multiplier) => portalTool.setSelectedSpeedMultiplier(multiplier);
toolbar.onPortalPreserveOffsetChange = (enabled) => portalTool.setSelectedPreserveOffset(enabled);
toolbar.onPortalDirectionRuleChange = (rule) => portalTool.setSelectedDirectionRule(rule);
toolbar.onPortalExitDirectionChange = (direction) => portalTool.setSelectedExitDirection(direction);
toolbar.onPortalTriggerBodyChange = (body) => portalTool.setSelectedTriggerBody(body);
toolbar.onPortalCooldownChange = (frames) => portalTool.setSelectedCooldownFrames(frames);
toolbar.onPortalExitOffsetChange = (offset) => portalTool.setSelectedExitOffset(offset);
toolbar.onPortalVisibilityChange = (visibility) => portalTool.setSelectedVisibility(visibility);
toolbar.onPortalSizeChange = (length) => portalTool.setSelectedPortalSize(length);
toolbar.onPortalRadiusChange = (radius) => portalTool.setSelectedPortalRadius(radius);
toolbar.onPortalShowEditorLinkChange = (enabled) => portalTool.setSelectedShowEditorLink(enabled);
toolbar.onPortalShowDebugChange = (enabled) => portalTool.setSelectedShowDebug(enabled);
toolbar.onPortalEnabledChange = (enabled) => portalTool.setSelectedEnabled(enabled);
selectTool.onSmoothRequest = () => {
  const started = selectTool.startSmooth();
  if (started) toolbar.showSmoothSlider();
};
selectTool.onSmoothEnd = () => {
  toolbar.hideSmoothSlider();
};
selectTool.onSelectionChange = () => {
  const selType = selectTool.getSelectedLineType();
  toolbar.setActiveLineType(selType ?? currentLineType);
};
toolbar.onLineTypeSelect = (type) => {
  currentLineType = type;
  toolbar.setActiveLineType(type);
  if (currentToolName === 'select' && selectTool.getSelectedCount() > 0) {
    selectTool.changeSelectedType(type);
  }
  renderGeneratorDetail();
};
toolbar.onClear = () => confirmNewTrack();
toolbar.onUndo = () => {
  if (canEdit()) store.undo();
};
toolbar.onRedo = () => {
  if (canEdit()) store.redo();
};
toolbar.onSave = () => saveTrack();
toolbar.onLoad = () => openLoadDialog();
toolbar.onPlay = () => {
  if (gameLoop.state === GameState.EDITING) {
    startPlayback();
    return;
  }
  if (gameLoop.state === GameState.PAUSED) {
    ensureGridFresh();
    gameLoop.play();
    audioPlay();
  }
};
toolbar.onPause = () => { gameLoop.pause(); audioPause(); };
toolbar.onStop = () => stopPlayback();
toolbar.onFit = () => fitView();
toolbar.onLayerPrev = () => cycleLayer(-1);
toolbar.onLayerNext = () => cycleLayer(1);
toolbar.onLayerNew = () => addLayer();
toolbar.onLayerToggleVisibility = () => toggleLayerVisibility();
toolbar.onLayerToggleEditability = () => toggleLayerEditability();
toolbar.onLayerMovePrev = () => moveLayer(-1);
toolbar.onLayerMoveNext = () => moveLayer(1);
toolbar.onLayerRename = () => renameLayer();
toolbar.onLayerDelete = () => deleteLayer();
toolbar.onLayerReorder = (from, to) => {
  if (!canEdit()) return;
  store.reorderLayer(from, to);
};

// Speed presets
toolbar.onSpeedChange = (speed) => {
  gameLoop.playbackSpeed = speed;
  audioSetSpeed(speed);
};

// Audio scrub preview — plays a short audio snippet at the scrubbed position
toolbar.onTimelineScrub = (frame) => {
  const snappedFrame = waveformRenderer.snapFrameToBeat(frame);
  if (audioPlayer.loaded) {
    audioPlayer.scrubPreview(snappedFrame);
  }
  if (ytPlayer.loaded) {
    ytPlayer.seekToFrame(snappedFrame);
  }
};

// Timeline seek — auto-starts playback if in editing mode
toolbar.onTimelineSeek = (frame) => {
  if (gameLoop.state === GameState.EDITING) {
    // Auto-start so the user can scrub from edit mode
    grid.rebuild(store.lines);
    rider.reset();
    savedCameraPos = camera.position.clone();
    savedCameraZoom = camera.zoom;
    cameraFollowing = false; // Don't auto-follow during scrub, let user keep their view
    gameLoop.play();
    gameLoop.pause();
    gridDirty = false;
  }
  if (gridDirty) {
    ensureGridFresh();
  }
  const snappedFrame = waveformRenderer.snapFrameToBeat(frame);
  gameLoop.seekToFrame(snappedFrame);
  audioSeekFrame(snappedFrame);
};

// Step forward — enter playback if needed, then advance one frame
toolbar.onStepForward = () => {
  if (gameLoop.state === GameState.EDITING) {
    grid.rebuild(store.lines);
    rider.reset();
    savedCameraPos = camera.position.clone();
    savedCameraZoom = camera.zoom;
    cameraFollowing = true;
    gameLoop.play();
    gameLoop.pause();
    gridDirty = false;
  } else if (gridDirty) {
    ensureGridFresh();
  }
  gameLoop.stepForward();
  audioSeekFrame(gameLoop.frame);
};

// Step back — seek to previous frame using snapshot system
toolbar.onStepBack = () => {
  if (gameLoop.state === GameState.EDITING) return;
  if (gameLoop.state === GameState.PLAYING) {
    gameLoop.pause();
    audioPause();
  }
  if (gridDirty) {
    ensureGridFresh();
  }
  if (gameLoop.frame > 0) {
    gameLoop.seekToFrame(gameLoop.frame - 1);
    audioSeekFrame(gameLoop.frame);
  }
};


type PickerCardOptions = {
  className: string;
  datasetKey: string;
  datasetValue: string;
  previewMarkup: string;
  title: string;
  subtitle: string;
  stateText?: string;
  onClick: () => void;
};

function createPickerCard(options: PickerCardOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `picker-card ${options.className}`;
  button.dataset[options.datasetKey] = options.datasetValue;
  button.innerHTML = `
    <span class="picker-card-art">${options.previewMarkup}</span>
    <span class="picker-card-copy">
      <strong>${options.title}</strong>
      <span>${options.subtitle}</span>
    </span>
    ${options.stateText ? `<span class="picker-card-state">${options.stateText}</span>` : ''}
  `;
  button.addEventListener('click', options.onClick);
  return button;
}


const generatorsButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-generators-trigger]'),
);
const generatorsOverlay = document.getElementById('generators-overlay') as HTMLElement | null;
const generatorsClose = document.getElementById('generators-close') as HTMLButtonElement | null;
const generatorsList = document.getElementById('generators-list') as HTMLElement | null;
const generatorDetailTitle = document.getElementById('generator-detail-title') as HTMLElement | null;
const generatorDetailText = document.getElementById('generator-detail-text') as HTMLElement | null;
const generatorDetailPreview = document.getElementById('generator-detail-preview') as HTMLElement | null;
const generatorControls = document.getElementById('generator-controls') as HTMLElement | null;
const generatorStats = document.getElementById('generator-stats') as HTMLElement | null;
const generatorActivate = document.getElementById('generator-activate') as HTMLButtonElement | null;

function openGeneratorsModal() {
  if (!generatorsOverlay) return;
  document.body.classList.add('generators-open');
  syncGeneratorsButton();
}

function closeGeneratorsModal() {
  document.body.classList.remove('generators-open');
  syncGeneratorsButton();
}

function syncGeneratorsButton() {
  const active = activeGeneratorId !== null || document.body.classList.contains('generators-open');
  for (const button of generatorsButtons) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function syncGeneratorSelection() {
  if (!generatorsList) return;
  generatorsList.querySelectorAll<HTMLButtonElement>('.generator-card').forEach((card) => {
    const id = card.dataset.generatorId;
    const active = id === selectedGeneratorId;
    const placing = id === activeGeneratorId;
    card.classList.toggle('active', active);
    card.classList.toggle('placing', placing);
    const state = card.querySelector<HTMLElement>('.picker-card-state');
    if (state) {
      state.textContent = placing ? 'Placing' : active ? 'Selected' : 'Ready';
    }
  });
}

function updateGeneratorDetailSummary(asset: GeneratorAsset, settings: GeneratorSettings) {
  if (generatorDetailTitle) generatorDetailTitle.textContent = asset.name;
  if (generatorDetailText) generatorDetailText.textContent = asset.description;
  if (generatorDetailPreview) {
    // Show ride-side stripe for solid/acc; scenery has no physics side
    const rideSideColor = generatorLineType === 'acc'
      ? '#e06020'
      : generatorLineType === 'scenery'
        ? undefined
        : '#3b82f6';
    generatorDetailPreview.innerHTML = buildGeneratorPreviewMarkup(asset, settings, rideSideColor);
  }

  const segments = asset.createSegments(settings);
  const bounds = computeGeneratedSegmentBounds(segments);
  if (generatorStats) {
    generatorStats.innerHTML = '';
    const genLineTypeLabel = generatorLineType === 'acc'
      ? GENERATOR_LINE_TYPE_LABELS[LineType.ACC]
      : generatorLineType === 'scenery'
        ? GENERATOR_LINE_TYPE_LABELS[LineType.SCENERY]
        : GENERATOR_LINE_TYPE_LABELS[LineType.SOLID];
    for (const value of [
      `${segments.length} lines`,
      `${Math.round(bounds.width)} × ${Math.round(bounds.height)}u`,
      `${genLineTypeLabel} output`,
    ]) {
      const chip = document.createElement('span');
      chip.textContent = value;
      generatorStats.appendChild(chip);
    }
    const dimensionChip = generatorStats.children[1];
    if (dimensionChip instanceof HTMLElement) {
      dimensionChip.textContent = `${Math.round(bounds.width)} x ${Math.round(bounds.height)}u`;
    }
  }

  if (generatorActivate) {
    generatorActivate.textContent = activeGeneratorId === asset.id ? 'Resume Placing' : 'Place Shape';
  }
}

function renderGeneratorDetail() {
  const asset = getGeneratorAssetById(selectedGeneratorId);
  const settings = getGeneratorSettingsState(selectedGeneratorId);
  if (!asset || !settings) return;

  updateGeneratorDetailSummary(asset, settings);

  if (!generatorControls) return;
  generatorControls.innerHTML = '';

  for (const control of asset.controls) {
    const row = document.createElement('label');
    row.className = 'generator-control';

    const header = document.createElement('span');
    header.className = 'generator-control-head';

    const title = document.createElement('strong');
    title.textContent = control.label;
    const value = document.createElement('span');
    value.textContent = formatGeneratorControlValue(control, settings[control.key] ?? control.defaultValue);
    header.append(title, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = `${control.min}`;
    input.max = `${control.max}`;
    input.step = `${control.step}`;
    input.value = `${settings[control.key] ?? control.defaultValue}`;
    input.addEventListener('input', () => {
      const current = getGeneratorSettingsState(asset.id) ?? asset.defaultSettings;
      const next = sanitizeGeneratorSettings(asset, {
        ...current,
        [control.key]: Number(input.value),
      });
      generatorSettingsById.set(asset.id, next);
      input.value = `${next[control.key]}`;
      value.textContent = formatGeneratorControlValue(control, next[control.key]);
      updateGeneratorDetailSummary(asset, next);
      syncGeneratorSelection();
    });

    row.append(header, input);
    generatorControls.appendChild(row);
  }

  if (generatorActivate) {
    generatorActivate.onclick = () => {
      if (!canEdit()) return;
      activateGeneratorPlacement(asset);
      closeGeneratorsModal();
    };
  }
}

function addPickerSectionHeader(label: string): HTMLDivElement {
  const header = document.createElement('div');
  header.className = 'picker-section-header';
  header.textContent = label;
  return header;
}

function addPlaceholderCards(count: number) {
  for (let i = 0; i < count; i++) {
    const card = document.createElement('button');
    card.className = 'picker-card generator-card shape-placeholder';
    card.disabled = true;
    card.setAttribute('aria-label', 'Coming soon');
    card.innerHTML = `
      <div class="picker-card-art">
        <svg class="icon" viewBox="0 0 24 24" width="20" height="20" style="opacity:0.3">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <div class="picker-card-copy">
        <strong>Coming Soon</strong>
      </div>`;
    generatorsList!.appendChild(card);
  }
}

function buildGeneratorsModal() {
  if (!generatorsList) return;
  generatorsList.innerHTML = '';

  // Geometric shapes
  generatorsList.appendChild(addPickerSectionHeader('Shapes'));
  for (const asset of generatorAssets) {
    const button = createPickerCard({
      className: 'generator-card',
      datasetKey: 'generatorId',
      datasetValue: asset.id,
      previewMarkup: asset.previewMarkup,
      title: asset.name,
      subtitle: `${asset.controls.length} controls`,
      stateText: 'Ready',
      onClick: () => {
        selectedGeneratorId = asset.id;
        syncGeneratorSelection();
        renderGeneratorDetail();
      },
    });
    generatorsList.appendChild(button);
  }
  // Fill to next row multiple (target: multiples of 3)
  const shapeRemainder = (3 - (generatorAssets.length % 3)) % 3;
  addPlaceholderCards(shapeRemainder + 3); // always show a few "coming soon" slots

  // Cloud stamps (now as full generators)
  generatorsList.appendChild(addPickerSectionHeader('Clouds'));
  for (const asset of cloudGeneratorAssets) {
    const button = createPickerCard({
      className: 'generator-card',
      datasetKey: 'generatorId',
      datasetValue: asset.id,
      previewMarkup: asset.previewMarkup,
      title: asset.name,
      subtitle: '1 control',
      stateText: 'Ready',
      onClick: () => {
        selectedGeneratorId = asset.id;
        syncGeneratorSelection();
        renderGeneratorDetail();
      },
    });
    generatorsList.appendChild(button);
  }
  // Fill clouds to next row multiple too
  const cloudRemainder = (3 - (cloudGeneratorAssets.length % 3)) % 3;
  addPlaceholderCards(cloudRemainder + 3);

  syncGeneratorSelection();
  renderGeneratorDetail();
}

for (const button of generatorsButtons) {
  button.addEventListener('click', () => {
    if (!canEdit()) return;
    if (document.body.classList.contains('generators-open')) {
      closeGeneratorsModal();
      return;
    }
    openGeneratorsModal();
  });
}
generatorsClose?.addEventListener('click', () => closeGeneratorsModal());
generatorsOverlay?.addEventListener('click', (event) => {
  if (event.target === generatorsOverlay) {
    closeGeneratorsModal();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && document.body.classList.contains('generators-open')) {
    closeGeneratorsModal();
  }
});

buildGeneratorsModal();
syncGeneratorsButton();

// Generator line type selector
const generatorLineTypeStrip = document.getElementById('generator-line-type-strip');

function syncGeneratorLineTypeStrip() {
  generatorLineTypeStrip?.querySelectorAll<HTMLButtonElement>('[data-gen-line-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.genLineType === generatorLineType);
  });
}

generatorLineTypeStrip?.querySelectorAll<HTMLButtonElement>('[data-gen-line-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    generatorLineType = btn.dataset.genLineType ?? 'solid';
    syncGeneratorLineTypeStrip();
    if (selectedGeneratorId) {
      const asset = getGeneratorAssetById(selectedGeneratorId);
      const settings = getGeneratorSettingsState(selectedGeneratorId);
      if (asset && settings) updateGeneratorDetailSummary(asset, settings);
    }
  });
});

// Generator flip toggle
const generatorFlipBtn = document.getElementById('generator-flip-btn') as HTMLButtonElement | null;

generatorFlipBtn?.addEventListener('click', () => {
  generatorFlipped = !generatorFlipped;
  generatorFlipBtn.classList.toggle('active', generatorFlipped);
});

syncGeneratorLineTypeStrip();

const settingsButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-settings-trigger]'),
);
const hotkeysClose = document.getElementById('hotkeys-close') as HTMLButtonElement | null;
const cameraFollowSlider = document.getElementById('camera-follow-slider') as HTMLInputElement | null;
const cameraFollowValue = document.getElementById('camera-follow-value') as HTMLElement | null;
const cameraFollowLabel = document.getElementById('camera-follow-label') as HTMLElement | null;

function describeCameraFollowStrength(value: number) {
  if (value <= 25) return 'Very calm';
  if (value <= 45) return 'Calm';
  if (value <= 65) return 'Balanced';
  if (value <= 85) return 'Active';
  return 'Dynamic';
}

function syncCameraFollowControls() {
  const value = clampCameraFollowStrength(cameraFollowStrength);
  if (cameraFollowSlider) cameraFollowSlider.value = String(value);
  if (cameraFollowValue) cameraFollowValue.textContent = `${value}%`;
  if (cameraFollowLabel) cameraFollowLabel.textContent = describeCameraFollowStrength(value);
}

function setCameraFollowStrength(value: number) {
  cameraFollowStrength = clampCameraFollowStrength(value);
  syncCameraFollowControls();
  persistEditorPreferences();
}

function openSettingsPanel() {
  closeGeneratorsModal();
  document.body.classList.add('hotkeys-open');
  syncSettingsButtons();
}

function closeSettingsPanel() {
  document.body.classList.remove('hotkeys-open');
  syncSettingsButtons();
}

function syncSettingsButtons() {
  const active = document.body.classList.contains('hotkeys-open');
  for (const button of settingsButtons) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

for (const button of settingsButtons) {
  button.addEventListener('click', () => {
    if (document.body.classList.contains('hotkeys-open')) {
      closeSettingsPanel();
      return;
    }
    openSettingsPanel();
  });
}
hotkeysClose?.addEventListener('click', () => closeSettingsPanel());
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && document.body.classList.contains('hotkeys-open')) {
    closeSettingsPanel();
  }
});
cameraFollowSlider?.addEventListener('input', () => {
  setCameraFollowStrength(parseInt(cameraFollowSlider.value || '50', 10));
});
syncCameraFollowControls();
syncSettingsButtons();

const vehiclePickerOverlay = document.getElementById('vehicle-picker-overlay') as HTMLElement | null;
const vehiclePickerClose = document.getElementById('vehicle-picker-close') as HTMLButtonElement | null;
const vehiclePickerButton = document.getElementById('vehicle-picker-btn') as HTMLButtonElement | null;
const vehiclePickerCurrent = document.getElementById('vehicle-picker-current') as HTMLElement | null;
const vehiclePickerCurrentIcon = document.getElementById('vehicle-picker-current-icon') as HTMLElement | null;
const vehiclePickerCurrentName = document.getElementById('vehicle-picker-current-name') as HTMLElement | null;
const vehiclePickerCurrentHint = document.getElementById('vehicle-picker-current-hint') as HTMLElement | null;
const vehiclePickerList = document.getElementById('vehicle-picker-list') as HTMLElement | null;

function openVehiclePicker() {
  if (!vehiclePickerOverlay) return;
  document.body.classList.add('vehicle-picker-open');
}

function closeVehiclePicker() {
  document.body.classList.remove('vehicle-picker-open');
}

function updateVehiclePickerSummary() {
  if (!vehiclePickerCurrent || !vehiclePickerCurrentIcon || !vehiclePickerCurrentName || !vehiclePickerCurrentHint) return;
  vehiclePickerCurrentIcon.innerHTML = activeVehicle.iconSvg;
  vehiclePickerCurrentName.textContent = activeVehicle.name;
  vehiclePickerCurrentHint.textContent = activeVehicle.available === false
    ? (activeVehicle.unlockHint ?? 'Locked')
    : 'Choose vehicle';
}

function updateVehiclePickerSelection() {
  if (!vehiclePickerList) return;
  vehiclePickerList.querySelectorAll<HTMLElement>('.vehicle-card').forEach(card => {
    card.classList.toggle('active', card.dataset.vehicle === activeVehicle.id);
  });
}

function buildVehiclePicker() {
  if (!vehiclePickerList) return;

  vehiclePickerList.innerHTML = '';
  for (const vehicle of VEHICLE_MANIFESTS) {
    const available = vehicle.available !== false;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `picker-card vehicle-card${available ? '' : ' locked'}`;
    card.dataset.vehicle = vehicle.id;
    card.disabled = !available;
    card.innerHTML = `
      <div class="picker-card-art">${vehicle.iconSvg}</div>
      <div class="picker-card-copy">
        <strong>${vehicle.name}</strong>
      </div>
    `;
    card.addEventListener('click', () => {
      if (!canEdit() || !available) return;
      setVehicle(vehicle.id);
      closeVehiclePicker();
    });
    vehiclePickerList.appendChild(card);
  }

  // Placeholder slots so grid always looks complete
  const remainder = (3 - (VEHICLE_MANIFESTS.length % 3)) % 3;
  for (let i = 0; i < remainder + 3; i++) {
    const ph = document.createElement('button');
    ph.className = 'picker-card vehicle-card locked';
    ph.disabled = true;
    ph.setAttribute('aria-label', 'Coming soon');
    ph.innerHTML = `
      <div class="picker-card-art">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="opacity:0.25">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <div class="picker-card-copy"><strong style="font: 600 9px/1.2 var(--font); letter-spacing:0.08em; opacity:0.45;">COMING SOON</strong></div>
    `;
    vehiclePickerList.appendChild(ph);
  }

  updateVehiclePickerSelection();
}

vehiclePickerButton?.addEventListener('click', () => {
  if (!canEdit()) return;
  openVehiclePicker();
});

// Left-dock vehicle button also opens the picker
document.getElementById('btn-vehicle-dock')?.addEventListener('click', () => {
  if (!canEdit()) return;
  openVehiclePicker();
});
vehiclePickerClose?.addEventListener('click', closeVehiclePicker);
vehiclePickerOverlay?.addEventListener('click', (event) => {
  if (event.target === vehiclePickerOverlay) {
    closeVehiclePicker();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && document.body.classList.contains('vehicle-picker-open')) {
    closeVehiclePicker();
  }
});

buildVehiclePicker();
setVehicle(activeVehicle.id);

// ── Floating Layers Panel ──
const layersFloat = document.getElementById('layers-float') as HTMLElement | null;
const layersFloatHandle = document.getElementById('layers-float-handle') as HTMLElement | null;
const layersFloatClose = document.getElementById('layers-float-close') as HTMLButtonElement | null;
const btnLayersDock = document.getElementById('btn-layers-dock') as HTMLButtonElement | null;

function setLayersFloatOpen(open: boolean) {
  if (!layersFloat) return;
  layersFloat.style.display = open ? '' : 'none';
  if (btnLayersDock) {
    btnLayersDock.classList.toggle('active', open);
    btnLayersDock.setAttribute('aria-pressed', open ? 'true' : 'false');
  }
}

btnLayersDock?.addEventListener('click', () => {
  const isOpen = layersFloat?.style.display !== 'none';
  setLayersFloatOpen(!isOpen);
});
layersFloatClose?.addEventListener('click', () => setLayersFloatOpen(false));

// Drag logic for layers panel
if (layersFloat && layersFloatHandle) {
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  layersFloatHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    const rect = layersFloat.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - layersFloat.offsetWidth, e.clientX - dragOffsetX));
    const y = Math.max(0, Math.min(window.innerHeight - layersFloat.offsetHeight, e.clientY - dragOffsetY));
    layersFloat.style.left = `${x}px`;
    layersFloat.style.top = `${y}px`;
    layersFloat.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}

// Layer rename modal
if (layerRenameSave && layerRenameCancel && layerRenameInput) {
  layerRenameSave.addEventListener('click', () => commitLayerRename());
  layerRenameCancel.addEventListener('click', () => closeLayerRename());
  layerRenameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitLayerRename();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLayerRename();
    }
  });
}

loadInput.addEventListener('change', async () => {
  const file = loadInput.files?.[0];
  if (!file || gameLoop.state !== GameState.EDITING) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!store.load(parsed)) {
      window.alert('Invalid track file.');
      return;
    }

    // Load triggers if present
    if (parsed.triggers && Array.isArray(parsed.triggers)) {
      triggerStore.load(parsed.triggers);
    } else {
      triggerStore.clear();
    }

    stopPlayback();
    fitView();
    autosaveNow();
  } catch {
    window.alert('Could not load track JSON.');
  } finally {
    loadInput.value = '';
  }
});

function switchTool(name: string) {
  clearGeneratorPlacementState();
  closeGeneratorsModal();
  if (name !== 'portal') {
    portalTool.cancelPlacement();
  }
  currentToolName = name;
  currentTool = resolveToolByName(name);
  if (name !== 'pencil' && name !== 'line') {
    editTool.clearSelection();
  }
  if (name !== 'select') {
    // Restore the draw-mode line type indicator when leaving select tool
    toolbar.setActiveLineType(currentLineType);
  }
  input.setTool(currentTool);
  toolbar.setActiveTool(name);
}

function resolveToolByName(name: string): Tool {
  if (name === 'pencil') return pencilTool;
  if (name === 'line') return lineTool;
  if (name === 'eraser') return eraserTool;
  if (name === 'select') return selectAmbientTool;
  if (name === 'flag') return flagTool;
  if (name === 'portal') return portalTool;
  return pencilTool;
}

function clearGeneratorPlacementState() {
  activeGeneratorId = null;
  generatorTool.clearAsset();
  syncGeneratorsButton();
  syncGeneratorSelection();
  renderGeneratorDetail();
}

function activateGeneratorPlacement(asset: GeneratorAsset) {
  closeGeneratorsModal();
  // Apply the modal's line type selection
  const mappedLineType = generatorLineType === 'acc'
    ? LineType.ACC
    : generatorLineType === 'scenery'
      ? LineType.SCENERY
      : LineType.SOLID;
  currentLineType = mappedLineType;
  toolbar.setActiveLineType(currentLineType);
  if (activeGeneratorId === null) {
    generatorResumeToolName = currentToolName;
  }
  activeGeneratorId = asset.id;
  selectedGeneratorId = asset.id;
  generatorTool.setAsset(asset);
  currentTool = generatorTool;
  input.setTool(currentTool);
  toolbar.setActiveTool(generatorResumeToolName);
  syncGeneratorsButton();
  syncGeneratorSelection();
  renderGeneratorDetail();
}

function cancelGeneratorPlacement() {
  if (activeGeneratorId === null) return;
  clearGeneratorPlacementState();
  currentToolName = generatorResumeToolName;
  currentTool = resolveToolByName(currentToolName);
  input.setTool(currentTool);
  toolbar.setActiveTool(currentToolName);
}

function clearTrack() {
  if (!canEdit()) return;
  if (gameLoop.state !== GameState.EDITING) {
    stopPlayback();
  }
  store.clear();
  triggerStore.clear();
  portalFxEvents.length = 0;
  portalCameraBias = null;
  rider.setStartPosition(store.startPosition);
  fitView();
  autosaveNow();
}

// --- Confirm new track modal ---
const confirmOverlay = document.getElementById('confirm-new-overlay')!;
const confirmCancel = document.getElementById('confirm-new-cancel')!;
const confirmDiscard = document.getElementById('confirm-new-discard')!;
const confirmSaveNew = document.getElementById('confirm-new-save')!;

function confirmNewTrack() {
  if (!canEdit()) return;
  // If the track is empty, just clear without prompting
  if (store.lines.length === 0 && store.portals.length === 0) {
    clearTrack();
    return;
  }
  confirmOverlay.classList.add('open');
}

function closeConfirmModal() {
  confirmOverlay.classList.remove('open');
}

confirmCancel.addEventListener('click', closeConfirmModal);

confirmDiscard.addEventListener('click', () => {
  closeConfirmModal();
  clearTrack();
});

confirmSaveNew.addEventListener('click', () => {
  closeConfirmModal();
  saveTrack();
  clearTrack();
});

// Close on overlay background click
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirmModal();
});

// Close on Escape
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && confirmOverlay.classList.contains('open')) {
    closeConfirmModal();
  }
});

// --- Audio helpers ---
function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10);
  return ms > 0 ? `${m}:${String(s).padStart(2, '0')}.${ms}` : `${m}:${String(s).padStart(2, '0')}`;
}

function parseTimecode(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  // Try m:ss or m:ss.f format
  const match = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const frac = match[3] ? parseInt(match[3], 10) / Math.pow(10, match[3].length) : 0;
    return mins * 60 + secs + frac;
  }
  // Fallback: parse as plain number of seconds
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? num : NaN;
}

function getActiveAudioDuration(): number {
  if (audioPlayer.loaded) return audioPlayer.duration;
  if (ytPlayer.loaded) return ytPlayer.duration;
  return 0;
}

// --- Audio state persistence ---
const AUDIO_STATE_KEY = 'line-rider-audio';
const YT_HISTORY_KEY = 'line-rider-yt-history';
const YT_HISTORY_MAX = 10;

interface AudioState {
  type: 'youtube' | 'none';
  youtubeId?: string;
  volume: number;
  portalFxVolume: number;
  offset: number;
  bpm: number;
  beatSnap: number;
  clipStart?: number;
  clipEnd?: number;
}

interface YtHistoryEntry {
  id: string;
  title: string;
  addedAt: number;
}

function loadYtHistory(): YtHistoryEntry[] {
  try {
    const raw = localStorage.getItem(YT_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveYtHistory(entries: YtHistoryEntry[]) {
  try { localStorage.setItem(YT_HISTORY_KEY, JSON.stringify(entries.slice(0, YT_HISTORY_MAX))); } catch {}
}

function addYtHistoryEntry(id: string, title: string) {
  const history = loadYtHistory().filter(e => e.id !== id);
  history.unshift({ id, title, addedAt: Date.now() });
  saveYtHistory(history.slice(0, YT_HISTORY_MAX));
}

function saveAudioState() {
  try {
    const activePlayer = audioPlayer.loaded ? audioPlayer : ytPlayer;
    const state: AudioState = {
      type: ytPlayer.loaded ? 'youtube' : 'none',
      youtubeId: ytPlayer.videoId || undefined,
      volume: parseInt((document.getElementById('audio-volume') as HTMLInputElement)?.value || '80', 10),
      portalFxVolume: parseInt((document.getElementById('portal-fx-volume') as HTMLInputElement)?.value || '55', 10),
      offset: parseFloat((document.getElementById('audio-offset') as HTMLInputElement)?.value || '0'),
      bpm: waveformRenderer.bpm,
      beatSnap: waveformRenderer.beatSnap,
      clipStart: activePlayer.clipStart > 0 ? activePlayer.clipStart : undefined,
      clipEnd: Number.isFinite(activePlayer.clipEnd) ? activePlayer.clipEnd : undefined,
    };
    localStorage.setItem(AUDIO_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

async function restoreAudioState() {
  try {
    const raw = localStorage.getItem(AUDIO_STATE_KEY);
    if (!raw) return;
    const state: AudioState = JSON.parse(raw);

    // Restore volume/offset/bpm controls
    const volSlider = document.getElementById('audio-volume') as HTMLInputElement;
    const volLabel = document.getElementById('audio-volume-label')!;
    const portalFxSlider = document.getElementById('portal-fx-volume') as HTMLInputElement;
    const portalFxLabel = document.getElementById('portal-fx-label')!;
    const offsetInput = document.getElementById('audio-offset') as HTMLInputElement;
    const bpmInput = document.getElementById('audio-bpm') as HTMLInputElement;
    const snapSelect = document.getElementById('audio-beat-snap') as HTMLSelectElement;
    const bpmInfo = document.getElementById('audio-bpm-info')!;

    if (volSlider) { volSlider.value = String(state.volume); volLabel.textContent = `${state.volume}%`; }
    if (portalFxSlider) {
      const fxVolume = state.portalFxVolume ?? 55;
      portalFxSlider.value = String(fxVolume);
      portalFxLabel.textContent = `${fxVolume}%`;
      portalAudio.volume = fxVolume / 100;
    }
    if (offsetInput) { offsetInput.value = String(state.offset); }
    audioPlayer.volume = state.volume / 100;
    audioPlayer.offset = state.offset;
    ytPlayer.volume = state.volume;
    ytPlayer.offset = state.offset;
    waveformRenderer.beatOffset = state.offset;

    if (state.bpm > 0) {
      waveformRenderer.bpm = state.bpm;
      if (bpmInput) bpmInput.value = String(state.bpm);
      const fpb = waveformRenderer.framesPerBeat;
      if (bpmInfo) bpmInfo.textContent = fpb > 0 ? `${fpb.toFixed(1)} f/beat` : '';
      document.body.classList.add('has-waveform');
    }
    if (state.beatSnap !== undefined) {
      waveformRenderer.beatSnap = state.beatSnap;
      if (snapSelect) snapSelect.value = String(state.beatSnap);
    }

    // Restore clip bounds
    if (state.clipStart != null || state.clipEnd != null) {
      const cs = state.clipStart ?? 0;
      const ce = state.clipEnd ?? Infinity;
      audioPlayer.setClip(cs, ce);
      ytPlayer.setClip(cs, ce);
      const clipStartInput = document.getElementById('audio-clip-start') as HTMLInputElement;
      const clipEndInput = document.getElementById('audio-clip-end') as HTMLInputElement;
      if (clipStartInput && cs > 0) clipStartInput.value = formatTimecode(cs);
      if (clipEndInput && Number.isFinite(ce)) clipEndInput.value = formatTimecode(ce);
    }

    // Restore YouTube player
    if (state.type === 'youtube' && state.youtubeId) {
      try {
        await ytPlayer.load(state.youtubeId);
        waveformRenderer.setDuration(ytPlayer.duration);
        document.body.classList.add('has-waveform');
        document.body.classList.add('audio-loaded');
        if (state.clipStart != null || state.clipEnd != null) {
          ytPlayer.setClip(state.clipStart ?? 0, state.clipEnd ?? Infinity);
        }
      } catch { /* video may no longer be available */ }
    }
  } catch { /* ignore corrupt state */ }
}

// --- Autosave to localStorage ---
const AUTOSAVE_KEY = 'line-rider-autosave';
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function autosaveNow() {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  try {
    const trackData = store.serialize();
    (trackData as unknown as Record<string, unknown>).triggers = triggerStore.serialize();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(trackData));
  } catch { /* storage full or unavailable — silently skip */ }
}

function scheduleAutosave() {
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, 1000);
}

function loadAutosave(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!store.load(parsed)) return false;
    if (parsed.triggers && Array.isArray(parsed.triggers)) {
      triggerStore.load(parsed.triggers);
    }
    return true;
  } catch {
    return false;
  }
}

function beginQuickErase(worldPos: Vec2) {
  if (!canEdit()) return;
  store.beginTransaction();
  store.removeLinesNear(worldPos, ERASER_RADIUS);
  store.removePortalsNear(worldPos, ERASER_RADIUS);
}

function continueQuickErase(worldPos: Vec2) {
  if (!canEdit()) return;
  store.removeLinesNear(worldPos, ERASER_RADIUS);
  store.removePortalsNear(worldPos, ERASER_RADIUS);
}

function endQuickErase() {
  if (!canEdit()) return;
  store.endTransaction();
}

function saveTrack() {
  if (!canEdit()) return;

  const trackData = store.serialize();
  (trackData as unknown as Record<string, unknown>).triggers = triggerStore.serialize();
  const data = JSON.stringify(trackData, null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), 'line-rider.track.json');
}

function exportTrack() {
  if (!canEdit()) return;

  const svg = exportTrackAsSvg(store.lines, store.layers, store.startPosition, store.portals);
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'line-rider-track.svg');
}

function openLoadDialog() {
  if (gameLoop.state !== GameState.EDITING) return;
  loadInput.value = '';
  loadInput.click();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const btnNewAction = document.getElementById('btn-new-action') as HTMLButtonElement | null;
const btnOpenAction = document.getElementById('btn-open-action') as HTMLButtonElement | null;
const btnSaveAction = document.getElementById('btn-save-action') as HTMLButtonElement | null;
const btnExportAction = document.getElementById('btn-export-action') as HTMLButtonElement | null;

btnNewAction?.addEventListener('click', () => confirmNewTrack());
btnOpenAction?.addEventListener('click', () => openLoadDialog());
btnSaveAction?.addEventListener('click', () => saveTrack());
btnExportAction?.addEventListener('click', () => exportTrack());

function cycleLayer(direction: 1 | -1) {
  if (!canEdit()) return;
  store.cycleActiveLayer(direction);
}

function addLayer() {
  if (!canEdit()) return;
  store.createLayer();
}

function toggleLayerVisibility() {
  if (!canEdit()) return;
  store.toggleActiveLayerVisibility();
}

function toggleLayerEditability() {
  if (!canEdit()) return;
  store.toggleActiveLayerEditability();
}

function moveLayer(direction: 1 | -1) {
  if (!canEdit()) return;
  store.moveActiveLayer(direction);
}

function deleteLayer() {
  if (!canEdit()) return;
  if (store.layers.length <= 1) return;
  store.deleteActiveLayer();
}

function renameLayer() {
  if (!canEdit() || !layerRenameInput) return;

  document.body.classList.add('layer-renaming');
  layerRenameInput.value = store.getActiveLayer().name;
  requestAnimationFrame(() => {
    layerRenameInput.focus();
    layerRenameInput.select();
  });
}

function commitLayerRename() {
  if (!layerRenameInput) return;
  store.renameActiveLayer(layerRenameInput.value);
  closeLayerRename();
}

function closeLayerRename() {
  document.body.classList.remove('layer-renaming');
  layerRenameInput?.blur();
}

function fitView() {
  if (gameLoop.state === GameState.PLAYING) return;

  const padding = 120;
  let minX = store.startPosition.x;
  let maxX = store.startPosition.x;
  let minY = store.startPosition.y;
  let maxY = store.startPosition.y;

  for (const line of store.lines) {
    minX = Math.min(minX, line.p1.x, line.p2.x);
    maxX = Math.max(maxX, line.p1.x, line.p2.x);
    minY = Math.min(minY, line.p1.y, line.p2.y);
    maxY = Math.max(maxY, line.p1.y, line.p2.y);
  }
  for (const portal of store.portals) {
    for (const endpoint of [portal.entry, portal.exit]) {
      const half = endpoint.length / 2;
      const xExtent = Math.abs(Math.cos(endpoint.rotation)) * half + Math.abs(Math.sin(endpoint.rotation)) * endpoint.radius;
      const yExtent = Math.abs(Math.sin(endpoint.rotation)) * half + Math.abs(Math.cos(endpoint.rotation)) * endpoint.radius;
      minX = Math.min(minX, endpoint.position.x - xExtent);
      maxX = Math.max(maxX, endpoint.position.x + xExtent);
      minY = Math.min(minY, endpoint.position.y - yExtent);
      maxY = Math.max(maxY, endpoint.position.y + yExtent);
    }
  }

  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const viewWidth = Math.max(1, camera.width - padding * 2);
  const viewHeight = Math.max(1, camera.height - padding * 2);
  const zoom = Math.min(viewWidth / boundsWidth, viewHeight / boundsHeight);

  // Cap zoom: don't zoom in beyond 1x (prevents huge rider on empty tracks)
  camera.zoom = Math.max(0.1, Math.min(1, zoom));
  camera.position.x = (minX + maxX) / 2;
  camera.position.y = (minY + maxY) / 2;
}

function startPlayback() {
  if (gameLoop.state === GameState.EDITING) {
    grid.rebuild(store.lines);
    rider.reset();
    resetVehicleRenderers();
    savedCameraPos = camera.position.clone();
    savedCameraZoom = camera.zoom;
    cameraFollowing = true;
    gridDirty = false;
    riderPositions.length = 0; // clear beat position history
    lastBeatIndex = -1;
    portalCameraBias = null;
    // Start audio from beginning
    audioSeekFrame(0);
  } else if (gameLoop.state === GameState.PAUSED) {
    // Always rebuild grid when resuming — edits may have moved lines
    ensureGridFresh();
  }
  gameLoop.play();
  audioPlay();
}

function stopPlayback() {
  gameLoop.stop();
  portalFxEvents.length = 0;
  portalCameraBias = null;
  rider.setStartPosition(store.startPosition);
  resetVehicleRenderers();
  cameraFollowing = false;
  if (savedCameraPos) {
    camera.position.copyFrom(savedCameraPos);
    camera.zoom = savedCameraZoom;
    savedCameraPos = null;
  }
  audioStop();
}

// Register render callbacks
renderer.addRenderCallback((ctx) => {
  const renderAlpha = gameLoop.state === GameState.PLAYING ? gameLoop.renderAlpha : 1;

  // Draw flag
  flagRenderer.render(ctx, store.startPosition);

  // Draw lines (show direction indicators when not playing, highlight hit lines when paused)
  const hitIds = gameLoop.state === GameState.PAUSED ? physics.hitLines : undefined;
  lineRenderer.render(ctx, store.lines, store.layers, gameLoop.state !== GameState.PLAYING, hitIds);

  while (portalFxEvents.length > 0 && performance.now() - portalFxEvents[0].startedAt > 280) {
    portalFxEvents.shift();
  }
  const portalInspectorActive = currentToolName === 'portal' || portalTool.isPlacing() || portalTool.getSelectedPortalId() !== null;
  const selectedPortalDiagnostics = portalInspectorActive ? portalTool.getDiagnostics() : null;
  const portalRenderOptions = {
    selectedPortalId: portalInspectorActive ? portalTool.getSelectedPortalId() : null,
    activeEndpoint: portalInspectorActive ? portalTool.getActiveEndpoint() : null,
    editing: gameLoop.state !== GameState.PLAYING,
    events: portalFxEvents,
    warningEndpoints: selectedPortalDiagnostics?.warningEndpoints ?? null,
  };
  portalRenderer.renderBackdrop(ctx, store.portals, store.layers, portalRenderOptions);

  // Draw triggers (edit mode or paused)
  triggerRenderer.render(ctx, triggerStore.triggers, gameLoop.state !== GameState.PLAYING);

  // Onion skinning: draw ghost riders from previous snapshots
  if (onionSkinning && gameLoop.state !== GameState.EDITING) {
    const ghosts = gameLoop.getOnionSnapshots(8);
    for (let i = ghosts.length - 1; i >= 0; i--) {
      // Fade from most recent (brightest) to oldest (faintest)
      const t = (ghosts.length - 1 - i) / Math.max(ghosts.length - 1, 1);
      const opacity = 0.25 * (1 - t * 0.8); // 0.25 → 0.05
      ctx.globalAlpha = opacity;
      const ghostData = Rider.renderDataFromSnapshot(ghosts[i].snapshot);
      renderVehicle(ctx, ghostData);
    }
    ctx.globalAlpha = 1;
  }

  // Draw rider
  const renderData = rider.getRenderData(renderAlpha);
  renderVehicle(ctx, renderData);

  portalRenderer.renderForeground(ctx, store.portals, store.layers, portalRenderOptions);

  // Draw active tool preview last so editor handles stay readable above the portal front rim.
  if (gameLoop.state !== GameState.PLAYING && currentTool.render) {
    currentTool.render(ctx);
  }

  // Debug overlays: momentum vectors and contact points (visible when paused)
  if (gameLoop.state === GameState.PAUSED) {
    const invZoomDbg = 1 / camera.zoom;
    // Momentum vectors on collision points
    ctx.strokeStyle = 'rgba(0, 200, 100, 0.7)';
    ctx.lineWidth = 1.5 * invZoomDbg;
    for (const cp of rider.collisionPoints) {
      const scale = 8;
      const ex = cp.pos.x + cp.momentum.x * scale;
      const ey = cp.pos.y + cp.momentum.y * scale;
      ctx.beginPath();
      ctx.moveTo(cp.pos.x, cp.pos.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = 'rgba(0, 200, 100, 0.7)';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.5 * invZoomDbg, 0, Math.PI * 2);
      ctx.fill();
    }
    // Contact point dots (on lines being touched)
    if (physics.hitLines.size > 0) {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.8)';
      for (const cp of rider.collisionPoints) {
        ctx.beginPath();
        ctx.arc(cp.pos.x, cp.pos.y, 2.5 * invZoomDbg, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── Beat markers on canvas ──
  // Draw markers at world positions where the rider will be on each beat
  const showBeatGuides =
    waveformRenderer.bpm > 0 &&
    riderPositions.length > 0 &&
    (gameLoop.state !== GameState.EDITING || !gridDirty);

  if (showBeatGuides) {
    const fps = 1000 / TIMESTEP;
    const beatInterval = 60 / waveformRenderer.bpm; // seconds per beat
    const offsetSeconds = waveformRenderer.beatOffset;
    const snap = waveformRenderer.beatSnap;
    const currentFrame = gameLoop.frame;
    const maxRecorded = riderPositions.length;
    const invZoom = 1 / camera.zoom;
    const editingGuides = gameLoop.state === GameState.EDITING;
    const beatMarkers: Array<{ x: number; y: number; isDownbeat: boolean; isFuture: boolean; measure: number }> = [];
    const subBeatMarkers: Array<{ x: number; y: number; isFuture: boolean }> = [];

    // Determine range of beat frames to draw
    let beatIndex = offsetSeconds >= 0 ? 0 : Math.ceil(-offsetSeconds / beatInterval);
    let t = offsetSeconds >= 0 ? offsetSeconds : offsetSeconds + beatIndex * beatInterval;
    while (t < maxRecorded / fps) {
      const beatFrame = Math.round(t * fps);
      if (beatFrame > 0 && beatFrame <= maxRecorded) {
        const pos = riderPositions[beatFrame - 1];
        if (pos.x !== 0 || pos.y !== 0) {
          beatMarkers.push({
            x: pos.x,
            y: pos.y,
            isDownbeat: beatIndex % 4 === 0,
            isFuture: beatFrame > currentFrame,
            measure: Math.floor(beatIndex / 4) + 1,
          });
        }
      }

      // Sub-beat markers
      if (snap > 1) {
        const subInterval = beatInterval / snap;
        for (let s = 1; s < snap; s++) {
          const subTime = t + s * subInterval;
          const subFrame = Math.round(subTime * fps);
          if (subFrame > 0 && subFrame <= maxRecorded) {
            const sp = riderPositions[subFrame - 1];
            if (sp.x !== 0 || sp.y !== 0) {
              subBeatMarkers.push({
                x: sp.x,
                y: sp.y,
                isFuture: subFrame > currentFrame,
              });
            }
          }
        }
      }

      t += beatInterval;
      beatIndex++;
    }

    if (beatMarkers.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(beatMarkers[0].x, beatMarkers[0].y);
      for (let i = 1; i < beatMarkers.length; i++) {
        ctx.lineTo(beatMarkers[i].x, beatMarkers[i].y);
      }
      ctx.strokeStyle = editingGuides ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 7 * invZoom;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([12 * invZoom, 8 * invZoom]);
      ctx.strokeStyle = editingGuides ? 'rgba(214,150,34,0.62)' : 'rgba(214,150,34,0.34)';
      ctx.lineWidth = 2.4 * invZoom;
      ctx.stroke();
      ctx.restore();
    }

    for (const marker of subBeatMarkers) {
      const subDotR = (editingGuides ? 2.2 : 1.6) * invZoom;
      ctx.fillStyle = editingGuides
        ? 'rgba(214,150,34,0.42)'
        : (marker.isFuture ? 'rgba(255,80,80,0.2)' : 'rgba(80,80,255,0.2)');
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, subDotR, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const marker of beatMarkers) {
      const lineH = (marker.isDownbeat ? (editingGuides ? 82 : 60) : (editingGuides ? 48 : 35)) * invZoom;
      ctx.strokeStyle = editingGuides
        ? (marker.isDownbeat ? 'rgba(214,150,34,0.82)' : 'rgba(214,150,34,0.5)')
        : (marker.isFuture
          ? (marker.isDownbeat ? 'rgba(255,80,80,0.5)' : 'rgba(255,80,80,0.25)')
          : (marker.isDownbeat ? 'rgba(80,80,255,0.5)' : 'rgba(80,80,255,0.25)'));
      ctx.lineWidth = (marker.isDownbeat ? 2.3 : 1.3) * invZoom;
      ctx.beginPath();
      ctx.moveTo(marker.x, marker.y - lineH);
      ctx.lineTo(marker.x, marker.y + lineH);
      ctx.stroke();

      const dotR = (marker.isDownbeat ? 4.4 : 2.8) * invZoom;
      ctx.fillStyle = editingGuides
        ? (marker.isDownbeat ? 'rgba(214,150,34,0.92)' : 'rgba(214,150,34,0.62)')
        : (marker.isFuture
          ? (marker.isDownbeat ? 'rgba(255,80,80,0.7)' : 'rgba(255,80,80,0.4)')
          : (marker.isDownbeat ? 'rgba(80,80,255,0.7)' : 'rgba(80,80,255,0.4)'));
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, dotR, 0, Math.PI * 2);
      ctx.fill();

      if (marker.isDownbeat) {
        const fontSize = Math.max(10, 12 * invZoom);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = editingGuides
          ? 'rgba(214,150,34,0.95)'
          : (marker.isFuture ? 'rgba(255,80,80,0.6)' : 'rgba(80,80,255,0.6)');
        ctx.textAlign = 'center';
        ctx.fillText(String(marker.measure), marker.x, marker.y - lineH - 4 * invZoom);
      }
    }
  }

  // Camera follow during playback + trigger evaluation
  if (cameraFollowing && gameLoop.state === GameState.PLAYING) {
    const center = rider.getCenter(renderAlpha);
    const cameraFollowT = cameraFollowStrength / 100;

    // Predictive camera: keep some anticipation, but bias toward comfort over
    // aggressive leading so the camera feels steadier on longer rides.
    const vel = rider.getCenterVelocity();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    const lookAheadFrames = lerp(0, 24, cameraFollowT);
    const lookAheadStrength = Math.min(
      lerp(0, 1.4, cameraFollowT),
      speed * lerp(0, 3.2, cameraFollowT),
    );
    const predictedX = center.x + vel.x * lookAheadFrames * lookAheadStrength;
    const predictedY = center.y + vel.y * lookAheadFrames * lookAheadStrength * lerp(0, 0.9, cameraFollowT);

    // Evaluate triggers
    const active = triggerStore.getActiveTriggers(center);
    let targetZoom = savedCameraZoom;
    let focusTarget: { x: number; y: number } | null = null;
    for (const t of active) {
      if (t.type === 'zoom' && t.zoomTarget != null) {
        targetZoom = t.zoomTarget;
      }
      if (t.type === 'camera-focus' && t.focusX != null && t.focusY != null) {
        focusTarget = { x: t.focusX, y: t.focusY };
      }
    }

    if (active.length > 0) {
      // Smooth zoom toward trigger target
      camera.zoom += (targetZoom - camera.zoom) * 0.05;
    }

    let fx = focusTarget ? focusTarget.x : predictedX;
    let fy = focusTarget ? focusTarget.y : predictedY;
    if (portalCameraBias && portalCameraBias.framesLeft > 0) {
      fx += (portalCameraBias.target.x - fx) * portalCameraBias.strength;
      fy += (portalCameraBias.target.y - fy) * portalCameraBias.strength;
      portalCameraBias.framesLeft -= 1;
      portalCameraBias.strength *= 0.78;
      if (portalCameraBias.framesLeft <= 0 || portalCameraBias.strength < 0.02) {
        portalCameraBias = null;
      }
    }
    // Speed-adaptive smoothing: still responsive at speed, but calmer overall.
    const smoothing = lerp(0.025, 0.065, cameraFollowT)
      + Math.min(lerp(0.025, 0.105, cameraFollowT), speed * lerp(0.005, 0.035, cameraFollowT));
    camera.position.x += (fx - camera.position.x) * smoothing;
    camera.position.y += (fy - camera.position.y) * smoothing;

    // Elliptical bounding box clamp (LRA-style) — prevent camera from drifting
    // too far from rider center. Bounding box scales with speed.
    const baseRadiusX = (camera.width * lerp(0.22, 0.48, cameraFollowT)) / camera.zoom;
    const baseRadiusY = (camera.height * lerp(0.22, 0.48, cameraFollowT)) / camera.zoom;
    const speedScale = 1 + Math.min(
      lerp(1, 3, cameraFollowT),
      speed * lerp(0.2, 0.8, cameraFollowT),
    );
    const rx = baseRadiusX * speedScale;
    const ry = baseRadiusY * speedScale;
    const dx = camera.position.x - center.x;
    const dy = camera.position.y - center.y;
    const ellipseDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (ellipseDist > 1) {
      const scale = 1 / Math.sqrt(ellipseDist);
      camera.position.x = center.x + dx * scale;
      camera.position.y = center.y + dy * scale;
    }
  }
});

// ── Audio Panel UI ──
{
  const audioPanel = document.getElementById('audio-panel')!;
  const audioClose = document.getElementById('audio-close')!;
  const audioDropZone = document.getElementById('audio-drop-zone')!;
  const audioFileInput = document.getElementById('audio-file-input') as HTMLInputElement;
  const audioYtInput = document.getElementById('audio-yt-input') as HTMLInputElement;
  const audioYtBtn = document.getElementById('audio-yt-btn') as HTMLButtonElement;
  const audioFileInfo = document.getElementById('audio-file-info')!;
  const audioNameEl = document.getElementById('audio-name')!;
  const audioDurationEl = document.getElementById('audio-duration')!;
  const audioControls = document.getElementById('audio-controls')!;
  const audioVolumeSlider = document.getElementById('audio-volume') as HTMLInputElement;
  const audioVolumeLabel = document.getElementById('audio-volume-label')!;
  const portalFxSlider = document.getElementById('portal-fx-volume') as HTMLInputElement;
  const portalFxLabel = document.getElementById('portal-fx-label')!;
  const audioOffsetInput = document.getElementById('audio-offset') as HTMLInputElement;
  const audioRemoveBtn = document.getElementById('audio-remove-btn')!;
  const audioLoadedRow = document.getElementById('audio-loaded-row')!;
  const audioLoadedName = document.getElementById('audio-loaded-name')!;
  const audioLoadedDuration = document.getElementById('audio-loaded-duration')!;
  const audioLoadedRemove = document.getElementById('audio-loaded-remove')!;
  const audioStatus = document.getElementById('audio-status')!;
  const audioButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-audio-trigger]'));

  function showAudioPanel() {
    document.body.classList.add('audio-open');
    syncAudioButtons();
  }
  function hideAudioPanel() {
    document.body.classList.remove('audio-open');
    syncAudioButtons();
  }
  function syncAudioButtons() {
    const active = document.body.classList.contains('audio-open');
    for (const button of audioButtons) {
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }
  let statusFadeTimer: ReturnType<typeof setTimeout> | null = null;
  function setAudioStatus(msg: string, type: 'info' | 'error' | 'success' = 'info') {
    if (statusFadeTimer) { clearTimeout(statusFadeTimer); statusFadeTimer = null; }
    audioStatus.textContent = msg;
    audioStatus.className = type !== 'info' ? type : '';
    // Auto-fade success messages
    if (type === 'success') {
      statusFadeTimer = setTimeout(() => { audioStatus.textContent = ''; audioStatus.className = ''; }, 3000);
    }
  }
  function updateAudioLoadedIndicator() {
    document.body.classList.toggle('audio-loaded', audioAnyLoaded());
  }
  function updateAudioUI() {
    const hasLocal = audioPlayer.loaded;
    const hasYT = ytPlayer.loaded;
    const hasAny = hasLocal || hasYT;

    audioFileInfo.style.display = hasAny ? '' : 'none';
    audioControls.style.display = '';
    (audioRemoveBtn as HTMLButtonElement).disabled = !hasAny;

    // Loaded-track banner at top of modal
    audioLoadedRow.style.display = hasAny ? '' : 'none';

    if (hasLocal) {
      audioNameEl.textContent = audioPlayer.name;
      audioLoadedName.textContent = audioPlayer.name;
      const mins = Math.floor(audioPlayer.duration / 60);
      const secs = Math.floor(audioPlayer.duration % 60);
      const durStr = `${mins}:${String(secs).padStart(2, '0')}`;
      audioDurationEl.textContent = durStr;
      audioLoadedDuration.textContent = durStr;
    } else if (hasYT) {
      audioNameEl.textContent = ytPlayer.name;
      audioLoadedName.textContent = ytPlayer.name;
      const mins = Math.floor(ytPlayer.duration / 60);
      const secs = Math.floor(ytPlayer.duration % 60);
      const durStr = `${mins}:${String(secs).padStart(2, '0')}`;
      audioDurationEl.textContent = durStr;
      audioLoadedDuration.textContent = durStr;
    } else {
      audioNameEl.textContent = 'No audio loaded';
      audioDurationEl.textContent = '';
      audioLoadedName.textContent = '';
      audioLoadedDuration.textContent = '';
    }
  }

  // Open/close panel
  for (const button of audioButtons) {
    button.addEventListener('click', showAudioPanel);
  }
  audioClose.addEventListener('click', hideAudioPanel);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && document.body.classList.contains('audio-open')) {
      hideAudioPanel();
    }
  });
  syncAudioButtons();

  // File drop zone
  audioDropZone.addEventListener('click', () => audioFileInput.click());
  audioDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    audioDropZone.classList.add('dragover');
  });
  audioDropZone.addEventListener('dragleave', () => {
    audioDropZone.classList.remove('dragover');
  });
  audioDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    audioDropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('audio/')) {
      await loadAudioFile(file);
    }
  });
  audioFileInput.addEventListener('change', async () => {
    const file = audioFileInput.files?.[0];
    if (file) await loadAudioFile(file);
    audioFileInput.value = '';
  });

  async function loadAudioFile(file: File) {
    setAudioStatus('Loading...');
    try {
      // Unload any existing YouTube player
      ytPlayer.unload();

      await audioPlayer.loadFile(file);
      setAudioStatus('Loaded!', 'success');
      updateAudioUI();
      updateAudioLoadedIndicator();
      updateTrimUI();
      saveAudioState();
      if (audioPlayer.audioBuffer) {
        waveformRenderer.loadBuffer(audioPlayer.audioBuffer);
        document.body.classList.add('has-waveform');
      }
    } catch (err) {
      setAudioStatus(`Failed to load: ${(err as Error).message}`, 'error');
    }
  }

  // YouTube URL
  audioYtBtn.addEventListener('click', () => loadFromYouTube());
  audioYtInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadFromYouTube();
  });

  async function loadFromYouTube() {
    const input = audioYtInput.value.trim();
    if (!input) return;

    const videoId = parseYouTubeId(input);
    if (!videoId) {
      setAudioStatus('Invalid YouTube URL', 'error');
      return;
    }

    setAudioStatus('Loading YouTube video...');
    audioYtBtn.disabled = true;

    try {
      // Unload any existing local audio (YT player replaces it)
      audioPlayer.unload();
      waveformRenderer.clear();

      await ytPlayer.load(videoId);
      waveformRenderer.setDuration(ytPlayer.duration);
      document.body.classList.add('has-waveform');
      setAudioStatus('Loaded!', 'success');
      updateAudioUI();
      updateAudioLoadedIndicator();
      updateTrimUI();
      addYtHistoryEntry(videoId, ytPlayer.name);
      saveAudioState();
      audioYtInput.value = '';
    } catch (err) {
      setAudioStatus(`YouTube error: ${(err as Error).message}`, 'error');
    } finally {
      audioYtBtn.disabled = false;
    }
  }

  // Volume
  audioVolumeSlider.addEventListener('input', () => {
    const v = parseInt(audioVolumeSlider.value, 10);
    audioPlayer.volume = v / 100;
    ytPlayer.volume = v;
    audioVolumeLabel.textContent = `${v}%`;
    saveAudioState();
  });

  portalAudio.volume = parseInt(portalFxSlider?.value || '55', 10) / 100;
  portalFxSlider?.addEventListener('input', () => {
    const v = parseInt(portalFxSlider.value, 10);
    portalAudio.volume = v / 100;
    portalFxLabel.textContent = `${v}%`;
    saveAudioState();
  });

  // Offset — sync to both audio player, YT player, and waveform beat grid
  audioOffsetInput.addEventListener('change', () => {
    const offset = parseFloat(audioOffsetInput.value) || 0;
    audioPlayer.offset = offset;
    ytPlayer.offset = offset;
    waveformRenderer.beatOffset = offset;
    saveAudioState();
  });

  // BPM
  const audioBpmInput = document.getElementById('audio-bpm') as HTMLInputElement;
  const audioTapBtn = document.getElementById('audio-tap-btn') as HTMLButtonElement;
  const audioBpmInfo = document.getElementById('audio-bpm-info')!;
  const audioBeatSnap = document.getElementById('audio-beat-snap') as HTMLSelectElement;

  audioBpmInput.addEventListener('change', () => {
    const bpm = parseFloat(audioBpmInput.value) || 0;
    waveformRenderer.bpm = bpm;
    updateBpmInfo();
    // Expand timeline if BPM is set (even without audio)
    if (bpm > 0 || audioAnyLoaded()) {
      document.body.classList.add('has-waveform');
    } else if (!audioAnyLoaded()) {
      document.body.classList.remove('has-waveform');
    }
    saveAudioState();
  });

  audioBeatSnap.addEventListener('change', () => {
    waveformRenderer.beatSnap = parseInt(audioBeatSnap.value, 10);
    waveformRenderer.bpm = waveformRenderer.bpm; // force redraw
    saveAudioState();
  });

  function updateBpmInfo() {
    const fpb = waveformRenderer.framesPerBeat;
    audioBpmInfo.textContent = fpb > 0 ? `${fpb.toFixed(1)} f/beat` : '';
  }

  // Tap tempo
  let tapTimes: number[] = [];
  let tapResetTimer: ReturnType<typeof setTimeout> | null = null;

  audioTapBtn.addEventListener('click', () => {
    const now = performance.now();

    // Reset if >2s since last tap
    if (tapResetTimer) clearTimeout(tapResetTimer);
    tapResetTimer = setTimeout(() => { tapTimes = []; }, 2000);

    tapTimes.push(now);
    // Keep last 8 taps
    if (tapTimes.length > 8) tapTimes.shift();

    if (tapTimes.length >= 2) {
      // Average interval between consecutive taps
      let totalInterval = 0;
      for (let i = 1; i < tapTimes.length; i++) {
        totalInterval += tapTimes[i] - tapTimes[i - 1];
      }
      const avgInterval = totalInterval / (tapTimes.length - 1);
      const bpm = Math.round(60000 / avgInterval * 10) / 10;
      audioBpmInput.value = String(bpm);
      waveformRenderer.bpm = bpm;
      updateBpmInfo();
    }
  });

  // Remove — shared handler used by both the panel button and the loaded-row X
  function removeAudio() {
    audioPlayer.unload();
    ytPlayer.unload();
    waveformRenderer.clear();
    document.body.classList.remove('has-waveform');
    setAudioStatus('Audio removed', 'info');
    updateAudioUI();
    updateAudioLoadedIndicator();
    updateTrimUI();
    try { localStorage.removeItem(AUDIO_STATE_KEY); } catch {}
  }
  audioRemoveBtn.addEventListener('click', removeAudio);
  audioLoadedRemove.addEventListener('click', removeAudio);

  // ── YouTube History ──
  const ytHistoryContainer = document.getElementById('audio-yt-history')!;
  const ytHistoryList = document.getElementById('audio-yt-history-list')!;
  const ytClearHistoryBtn = document.getElementById('audio-yt-clear-history')!;

  function renderYtHistory() {
    const history = loadYtHistory();
    if (history.length === 0) {
      ytHistoryContainer.style.display = 'none';
      return;
    }
    ytHistoryContainer.style.display = '';
    ytHistoryList.innerHTML = '';
    for (const entry of history) {
      const item = document.createElement('div');
      item.className = 'audio-yt-history-item';
      const safeTitle = entry.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      item.innerHTML = `<span class="yt-title">${safeTitle}</span><span class="yt-id">${entry.id}</span>`;
      item.addEventListener('click', () => {
        audioYtInput.value = entry.id;
        loadFromYouTube();
      });
      ytHistoryList.appendChild(item);
    }
  }

  ytClearHistoryBtn.addEventListener('click', () => {
    try { localStorage.removeItem(YT_HISTORY_KEY); } catch {}
    renderYtHistory();
  });

  // Render history when panel opens
  const origShowAudioPanel = showAudioPanel;
  function showAudioPanelWithHistory() {
    origShowAudioPanel();
    updateAudioUI();
    renderYtHistory();
    updateTrimUI();
  }
  for (const button of audioButtons) {
    button.removeEventListener('click', showAudioPanel);
    button.addEventListener('click', showAudioPanelWithHistory);
  }

  // ── Trim / Clip Editor ──
  const trimSection = document.getElementById('audio-trim-section')!;
  const clipStartInput = document.getElementById('audio-clip-start') as HTMLInputElement;
  const clipEndInput = document.getElementById('audio-clip-end') as HTMLInputElement;
  const trimResetBtn = document.getElementById('audio-trim-reset')!;

  function updateTrimUI() {
    const dur = getActiveAudioDuration();
    if (dur <= 0) {
      trimSection.style.display = 'none';
      return;
    }
    trimSection.style.display = '';
    const player = audioPlayer.loaded ? audioPlayer : ytPlayer;
    clipStartInput.value = player.clipStart > 0 ? formatTimecode(player.clipStart) : '';
    clipEndInput.value = Number.isFinite(player.clipEnd) ? formatTimecode(player.clipEnd) : '';
    clipStartInput.placeholder = '0:00';
    clipEndInput.placeholder = formatTimecode(dur);
  }

  function applyClipFromInputs() {
    const dur = getActiveAudioDuration();
    if (dur <= 0) return;

    const startVal = parseTimecode(clipStartInput.value);
    const endVal = parseTimecode(clipEndInput.value);
    const cs = Number.isFinite(startVal) ? Math.max(0, Math.min(startVal, dur)) : 0;
    const ce = Number.isFinite(endVal) ? Math.max(0, Math.min(endVal, dur)) : Infinity;

    audioPlayer.setClip(cs, ce);
    ytPlayer.setClip(cs, ce);
    saveAudioState();
  }

  clipStartInput.addEventListener('change', applyClipFromInputs);
  clipEndInput.addEventListener('change', applyClipFromInputs);

  trimResetBtn.addEventListener('click', () => {
    audioPlayer.resetClip();
    ytPlayer.resetClip();
    clipStartInput.value = '';
    clipEndInput.value = '';
    saveAudioState();
  });
}

// Flush autosave on page unload so no pending changes are lost
window.addEventListener('beforeunload', autosaveNow);

// Start — restore autosaved track if available
loadAutosave();
restoreAudioState();
gameLoop.start();
fitView();
