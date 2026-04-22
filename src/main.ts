import { Vec2 } from './math/Vec2';
import { Camera } from './camera/Camera';
import { Renderer } from './rendering/Renderer';
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

// Core
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
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
const hudBeat = document.getElementById('hud-beat') as HTMLElement;
const statBeat = document.getElementById('stat-beat') as HTMLElement;
const metronomeFlash = document.getElementById('metronome-flash') as HTMLElement;
let lastBeatIndex = -1; // track which beat we were on to detect crossings
let portalCameraBias: { target: Vec2; strength: number; framesLeft: number } | null = null;

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
let activeVehicle = getVehicleManifest('sled');

function resetVehicleRenderers() {
  for (const renderer of vehicleRenderers.values()) {
    renderer.reset?.();
  }
}

function setVehicle(id: string) {
  const vehicle = getVehicleManifest(id);
  if (vehicle.available === false) return;
  activeVehicle = vehicle;
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

// Tools
const pencilTool = new PencilTool(store, () => currentLineType);
const lineTool = new LineTool(store, () => currentLineType);
const eraserTool = new EraserTool(store);
const selectTool = new SelectTool(store);
let snapEnabled = true;
const editTool = new EditTool(store, () => camera.zoom, () => snapEnabled);
const portalTool = new PortalTool(store, () => camera.zoom, () => snapEnabled);
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
});
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
};
input.onClearTrack = () => confirmNewTrack();
input.onQuickEraseStart = (worldPos) => beginQuickErase(worldPos);
input.onQuickEraseMove = (worldPos) => continueQuickErase(worldPos);
input.onQuickEraseEnd = () => endQuickErase();
input.onSaveTrack = () => saveTrack();
input.onLoadTrack = () => openLoadDialog();

// Camera follow state
let cameraFollowing = false;
let onionSkinning = false;
let savedCameraPos: Vec2 | null = null;
let savedCameraZoom: number = 1;
let gridDirty = false; // Track changes made while paused

function canEdit(): boolean {
  return gameLoop.state === GameState.EDITING || gameLoop.state === GameState.PAUSED;
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
toolbar.setLayerState(store.layers, store.getActiveLayerIndex());

// Game loop
const gameLoop = new GameLoop(physics, () => {
  renderer.render();
  toolbar.setPlaybackState(gameLoop.state);
  toolbar.setLayerState(store.layers, store.getActiveLayerIndex());

  // Update stats in canvas HUD
  const speed = rider.getCenterSpeed() * (1000 / TIMESTEP);
  toolbar.updateStats(store.lines.length, speed);
  toolbar.setSelectedLineState(currentTool === selectTool ? selectTool.getSelectedCount() : 0, selectTool.isSmoothing());
  const portalDiagnostics = currentTool === portalTool ? portalTool.getDiagnostics() : null;
  toolbar.setPortalState(
    currentTool === portalTool,
    currentTool === portalTool ? portalTool.getSelectedPortal() : null,
    currentTool === portalTool && portalTool.isPlacing(),
    currentTool === portalTool ? portalTool.getActiveEndpoint() : null,
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
  snapEnabled = enabled;
};
toolbar.onSmoothStart = () => selectTool.startSmooth();
toolbar.onSmoothChange = (amount) => selectTool.setSmoothAmount(amount);
toolbar.onSmoothApply = () => selectTool.applySmooth();
toolbar.onSmoothCancel = () => selectTool.cancelSmooth();
toolbar.onConvertSelectedType = (type) => {
  if (currentTool === selectTool) {
    selectTool.changeSelectedType(type);
  }
};
toolbar.onPortalModeChange = (mode) => {
  if (currentTool === portalTool) portalTool.setSelectedPortalMode(mode);
};
toolbar.onPortalThemeChange = (theme) => {
  if (currentTool === portalTool) portalTool.setSelectedColorTheme(theme);
};
toolbar.onPortalVelocityModeChange = (mode) => {
  if (currentTool === portalTool) portalTool.setSelectedVelocityMode(mode);
};
toolbar.onPortalSpeedMultiplierChange = (multiplier) => {
  if (currentTool === portalTool) portalTool.setSelectedSpeedMultiplier(multiplier);
};
toolbar.onPortalPreserveOffsetChange = (enabled) => {
  if (currentTool === portalTool) portalTool.setSelectedPreserveOffset(enabled);
};
toolbar.onPortalDirectionRuleChange = (rule) => {
  if (currentTool === portalTool) portalTool.setSelectedDirectionRule(rule);
};
toolbar.onPortalTriggerBodyChange = (body) => {
  if (currentTool === portalTool) portalTool.setSelectedTriggerBody(body);
};
toolbar.onPortalCooldownChange = (frames) => {
  if (currentTool === portalTool) portalTool.setSelectedCooldownFrames(frames);
};
toolbar.onPortalExitOffsetChange = (offset) => {
  if (currentTool === portalTool) portalTool.setSelectedExitOffset(offset);
};
toolbar.onPortalVisibilityChange = (visibility) => {
  if (currentTool === portalTool) portalTool.setSelectedVisibility(visibility);
};
toolbar.onPortalSizeChange = (length) => {
  if (currentTool === portalTool) portalTool.setSelectedPortalSize(length);
};
toolbar.onPortalRadiusChange = (radius) => {
  if (currentTool === portalTool) portalTool.setSelectedPortalRadius(radius);
};
toolbar.onPortalShowEditorLinkChange = (enabled) => {
  if (currentTool === portalTool) portalTool.setSelectedShowEditorLink(enabled);
};
toolbar.onPortalShowDebugChange = (enabled) => {
  if (currentTool === portalTool) portalTool.setSelectedShowDebug(enabled);
};
toolbar.onPortalEnabledChange = (enabled) => {
  if (currentTool === portalTool) portalTool.setSelectedEnabled(enabled);
};
selectTool.onSmoothRequest = () => {
  const started = selectTool.startSmooth();
  if (started) toolbar.showSmoothSlider();
};
selectTool.onSmoothEnd = () => {
  toolbar.hideSmoothSlider();
};
toolbar.onLineTypeSelect = (type) => {
  currentLineType = type;
  toolbar.setActiveLineType(type);
  if (currentTool === selectTool && selectTool.getSelectedCount() > 0) {
    selectTool.changeSelectedType(type);
  }
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
toolbar.onPlay = () => startPlayback();
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
  if (gameLoop.state !== GameState.EDITING) return;
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
    const card = document.createElement('button');
    const available = vehicle.available !== false;
    card.type = 'button';
    card.className = `vehicle-card${available ? '' : ' locked'}`;
    card.dataset.vehicle = vehicle.id;
    card.innerHTML = `
      <span class="vehicle-card-icon">${vehicle.iconSvg}</span>
      <span class="vehicle-card-copy">
        <strong>${vehicle.name}</strong>
        <span>${available ? 'Available now' : (vehicle.unlockHint ?? 'Locked')}</span>
      </span>
      ${available ? '' : '<span class="vehicle-card-lock">Locked</span>'}
    `;
    card.disabled = !available;
    card.addEventListener('click', () => {
      if (gameLoop.state !== GameState.EDITING) return;
      if (!available) return;
      setVehicle(vehicle.id);
      closeVehiclePicker();
    });
    vehiclePickerList.appendChild(card);
  }
  updateVehiclePickerSelection();
}

vehiclePickerButton?.addEventListener('click', () => {
  if (gameLoop.state !== GameState.EDITING) return;
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
  if (name === 'pencil') currentTool = pencilTool;
  else if (name === 'line') currentTool = lineTool;
  else if (name === 'eraser') currentTool = eraserTool;
  else if (name === 'select') currentTool = selectTool;
  else if (name === 'edit') currentTool = editTool;
  else if (name === 'flag') currentTool = flagTool;
  else if (name === 'portal') currentTool = portalTool;
  input.setTool(currentTool);
  toolbar.setActiveTool(name);
}

function clearTrack() {
  if (gameLoop.state !== GameState.EDITING) return;
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
  if (gameLoop.state !== GameState.EDITING) return;
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

// --- Audio state persistence ---
const AUDIO_STATE_KEY = 'line-rider-audio';

interface AudioState {
  type: 'youtube' | 'none';
  youtubeId?: string;
  volume: number;
  portalFxVolume: number;
  offset: number;
  bpm: number;
  beatSnap: number;
}

function saveAudioState() {
  try {
    const state: AudioState = {
      type: ytPlayer.loaded ? 'youtube' : 'none',
      youtubeId: ytPlayer.videoId || undefined,
      volume: parseInt((document.getElementById('audio-volume') as HTMLInputElement)?.value || '80', 10),
      portalFxVolume: parseInt((document.getElementById('portal-fx-volume') as HTMLInputElement)?.value || '55', 10),
      offset: parseFloat((document.getElementById('audio-offset') as HTMLInputElement)?.value || '0'),
      bpm: waveformRenderer.bpm,
      beatSnap: waveformRenderer.beatSnap,
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

    // Restore YouTube player
    if (state.type === 'youtube' && state.youtubeId) {
      try {
        await ytPlayer.load(state.youtubeId);
        waveformRenderer.setDuration(ytPlayer.duration);
        document.body.classList.add('has-waveform');
        document.body.classList.add('audio-loaded');
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
  if (gameLoop.state !== GameState.EDITING) return;

  const trackData = store.serialize();
  (trackData as unknown as Record<string, unknown>).triggers = triggerStore.serialize();
  const data = JSON.stringify(trackData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'line-rider.track.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openLoadDialog() {
  if (gameLoop.state !== GameState.EDITING) return;
  loadInput.value = '';
  loadInput.click();
}

function cycleLayer(direction: 1 | -1) {
  if (gameLoop.state !== GameState.EDITING) return;
  store.cycleActiveLayer(direction);
}

function addLayer() {
  if (gameLoop.state !== GameState.EDITING) return;
  store.createLayer();
}

function toggleLayerVisibility() {
  if (gameLoop.state !== GameState.EDITING) return;
  store.toggleActiveLayerVisibility();
}

function toggleLayerEditability() {
  if (gameLoop.state !== GameState.EDITING) return;
  store.toggleActiveLayerEditability();
}

function moveLayer(direction: 1 | -1) {
  if (gameLoop.state !== GameState.EDITING) return;
  store.moveActiveLayer(direction);
}

function deleteLayer() {
  if (gameLoop.state !== GameState.EDITING) return;
  if (store.layers.length <= 1) return;
  store.deleteActiveLayer();
}

function renameLayer() {
  if (gameLoop.state !== GameState.EDITING || !layerRenameInput) return;

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

  // Draw lines (show direction indicators when not playing)
  lineRenderer.render(ctx, store.lines, store.layers, gameLoop.state !== GameState.PLAYING);

  while (portalFxEvents.length > 0 && performance.now() - portalFxEvents[0].startedAt > 280) {
    portalFxEvents.shift();
  }
  const selectedPortalDiagnostics = currentTool === portalTool ? portalTool.getDiagnostics() : null;
  portalRenderer.render(ctx, store.portals, store.layers, {
    selectedPortalId: currentTool === portalTool ? portalTool.getSelectedPortalId() : null,
    activeEndpoint: currentTool === portalTool ? portalTool.getActiveEndpoint() : null,
    editing: gameLoop.state !== GameState.PLAYING,
    events: portalFxEvents,
    warningEndpoints: selectedPortalDiagnostics?.warningEndpoints ?? null,
  });

  // Draw active tool preview (editing or paused)
  if (gameLoop.state !== GameState.PLAYING && currentTool.render) {
    currentTool.render(ctx);
  }

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

    let fx = focusTarget ? focusTarget.x : center.x;
    let fy = focusTarget ? focusTarget.y : center.y;
    if (portalCameraBias && portalCameraBias.framesLeft > 0) {
      fx += (portalCameraBias.target.x - fx) * portalCameraBias.strength;
      fy += (portalCameraBias.target.y - fy) * portalCameraBias.strength;
      portalCameraBias.framesLeft -= 1;
      portalCameraBias.strength *= 0.78;
      if (portalCameraBias.framesLeft <= 0 || portalCameraBias.strength < 0.02) {
        portalCameraBias = null;
      }
    }
    camera.position.x += (fx - camera.position.x) * 0.1;
    camera.position.y += (fy - camera.position.y) * 0.1;
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
  const audioStatus = document.getElementById('audio-status')!;
  const btnSound = document.getElementById('btn-sound')!;

  function showAudioPanel() {
    document.body.classList.add('audio-open');
  }
  function hideAudioPanel() {
    document.body.classList.remove('audio-open');
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

    if (hasLocal) {
      audioNameEl.textContent = audioPlayer.name;
      const mins = Math.floor(audioPlayer.duration / 60);
      const secs = Math.floor(audioPlayer.duration % 60);
      audioDurationEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    } else if (hasYT) {
      audioNameEl.textContent = ytPlayer.name;
      const mins = Math.floor(ytPlayer.duration / 60);
      const secs = Math.floor(ytPlayer.duration % 60);
      audioDurationEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    } else {
      audioNameEl.textContent = 'No audio loaded';
      audioDurationEl.textContent = '';
    }
  }

  // Open/close panel
  btnSound.addEventListener('click', showAudioPanel);
  audioClose.addEventListener('click', hideAudioPanel);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && document.body.classList.contains('audio-open')) {
      hideAudioPanel();
    }
  });

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
      saveAudioState();
      if (audioPlayer.audioBuffer) {
        waveformRenderer.loadBuffer(audioPlayer.audioBuffer);
        document.body.classList.add('has-waveform');
      }
      // Auto-close panel after short delay
      setTimeout(hideAudioPanel, 800);
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
      saveAudioState();
      audioYtInput.value = '';
      // Auto-close panel after short delay
      setTimeout(hideAudioPanel, 800);
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

  // Remove
  audioRemoveBtn.addEventListener('click', () => {
    audioPlayer.unload();
    ytPlayer.unload();
    waveformRenderer.clear();
    document.body.classList.remove('has-waveform');
    setAudioStatus('Audio removed', 'info');
    updateAudioUI();
    updateAudioLoadedIndicator();
    try { localStorage.removeItem(AUDIO_STATE_KEY); } catch {}
  });
}

// Flush autosave on page unload so no pending changes are lost
window.addEventListener('beforeunload', autosaveNow);

// Start — restore autosaved track if available
loadAutosave();
restoreAudioState();
gameLoop.start();
fitView();
