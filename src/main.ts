import { Vec2 } from './math/Vec2';
import { Camera } from './camera/Camera';
import { Renderer } from './rendering/Renderer';
import { LineRenderer } from './rendering/LineRenderer';
import { RiderRenderer } from './rendering/RiderRenderer';
import { FlagRenderer } from './rendering/FlagRenderer';
import { UIRenderer } from './rendering/UIRenderer';
import { InputManager } from './input/InputManager';
import { PencilTool } from './input/tools/PencilTool';
import { LineTool } from './input/tools/LineTool';
import { EraserTool } from './input/tools/EraserTool';
import { CurveTool } from './input/tools/CurveTool';
import { FlagTool } from './input/tools/FlagTool';
import { SelectTool } from './input/tools/SelectTool';
import { EditTool } from './input/tools/EditTool';
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
import { exportTrackAsSvg } from './export/svgExport';
import { TriggerStore } from './store/TriggerStore';
import { TriggerRenderer } from './rendering/TriggerRenderer';

// Core
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const store = new TrackStore();
store.onMutation = () => markGridDirty();
const grid = new SpatialGrid();
const triggerStore = new TriggerStore();
const triggerRenderer = new TriggerRenderer();

// Start position
store.startPosition = new Vec2(0, 0);

// Rider + Physics
let rider = new Rider(store.startPosition);
let physics = new PhysicsEngine(rider, grid);

// Sub-renderers
const lineRenderer = new LineRenderer();
const riderRenderer = new RiderRenderer();
const flagRenderer = new FlagRenderer();
const uiRenderer = new UIRenderer();

// Current state
let currentLineType: LineType = LineType.SOLID;
let currentTool: Tool;

// Tools
const pencilTool = new PencilTool(store, () => currentLineType);
const lineTool = new LineTool(store, () => currentLineType);
const eraserTool = new EraserTool(store);
const curveTool = new CurveTool(store, () => currentLineType);
const selectTool = new SelectTool(store);
let snapEnabled = true;
const editTool = new EditTool(store, () => camera.zoom, () => snapEnabled);
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
  } else {
    gameLoop.togglePlayPause();
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
input.onClearTrack = () => clearTrack();
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
  if (gameLoop.state === GameState.PAUSED) {
    gridDirty = true;
  }
}

/** Rebuild grid + re-simulate to current frame if track was edited while paused */
function ensureGridFresh() {
  if (!gridDirty) return;
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

  // Update timeline during playback
  if (gameLoop.state !== GameState.EDITING) {
    toolbar.updateTimeline(gameLoop.frame, Math.max(gameLoop.maxFrame, gameLoop.frame));
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

toolbar.onToolSelect = (name) => switchTool(name);
toolbar.onOnionSkinToggle = (enabled) => {
  onionSkinning = enabled;
};
toolbar.onSnapToggle = (enabled) => {
  snapEnabled = enabled;
};
toolbar.onLineTypeSelect = (type) => {
  currentLineType = type;
  toolbar.setActiveLineType(type);
};
toolbar.onClear = () => clearTrack();
toolbar.onUndo = () => {
  if (canEdit()) store.undo();
};
toolbar.onRedo = () => {
  if (canEdit()) store.redo();
};
toolbar.onSave = () => saveTrack();
toolbar.onLoad = () => openLoadDialog();
toolbar.onPlay = () => startPlayback();
toolbar.onPause = () => gameLoop.pause();
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

// Speed presets
toolbar.onSpeedChange = (speed) => {
  gameLoop.playbackSpeed = speed;
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
  gameLoop.seekToFrame(frame);
};

// Draw/Ride toggle — split behavior
toolbar.onDrawClick = () => {
  if (gameLoop.state === GameState.PLAYING) {
    gameLoop.pause(); // Pause but keep rider visible, allow drawing
  }
  // If EDITING or PAUSED, no-op (already in draw mode)
};
toolbar.onRideClick = () => {
  if (gameLoop.state === GameState.EDITING) {
    startPlayback();
  } else if (gameLoop.state === GameState.PAUSED) {
    ensureGridFresh();
    gameLoop.play(); // Resume from current frame
  }
  // If PLAYING, no-op
};

// Screenshot
toolbar.onScreenshot = () => {
  const dataUrl = canvas.toDataURL('image/png');
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = 'line-rider-screenshot.png';
  anchor.click();
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
};

// Step back — seek to previous frame using snapshot system
toolbar.onStepBack = () => {
  if (gameLoop.state === GameState.EDITING) return;
  if (gameLoop.state === GameState.PLAYING) {
    gameLoop.pause();
  }
  if (gridDirty) {
    ensureGridFresh();
  }
  if (gameLoop.frame > 0) {
    gameLoop.seekToFrame(gameLoop.frame - 1);
  }
};

// SVG export
toolbar.onSvgExport = () => {
  const svg = exportTrackAsSvg(store.lines, store.layers, store.startPosition);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'line-rider-track.svg';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

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
  else if (name === 'curve') currentTool = curveTool;
  else if (name === 'select') currentTool = selectTool;
  else if (name === 'edit') currentTool = editTool;
  else if (name === 'flag') currentTool = flagTool;
  input.setTool(currentTool);
  toolbar.setActiveTool(name);
}

function clearTrack() {
  if (gameLoop.state !== GameState.EDITING) return;
  store.clear();
  triggerStore.clear();
  rider.setStartPosition(store.startPosition);
  fitView();
}

function beginQuickErase(worldPos: Vec2) {
  if (!canEdit()) return;
  store.beginTransaction();
  store.removeLinesNear(worldPos, ERASER_RADIUS);
}

function continueQuickErase(worldPos: Vec2) {
  if (!canEdit()) return;
  store.removeLinesNear(worldPos, ERASER_RADIUS);
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
    savedCameraPos = camera.position.clone();
    savedCameraZoom = camera.zoom;
    cameraFollowing = true;
    gridDirty = false;
  } else if (gameLoop.state === GameState.PAUSED && gridDirty) {
    ensureGridFresh();
  }
  gameLoop.play();
}

function stopPlayback() {
  gameLoop.stop();
  rider.setStartPosition(store.startPosition);
  cameraFollowing = false;
  if (savedCameraPos) {
    camera.position.copyFrom(savedCameraPos);
    camera.zoom = savedCameraZoom;
    savedCameraPos = null;
  }
}

// Register render callbacks
renderer.addRenderCallback((ctx) => {
  const renderAlpha = gameLoop.state === GameState.PLAYING ? gameLoop.renderAlpha : 1;

  // Draw flag
  flagRenderer.render(ctx, store.startPosition);

  // Draw lines (show direction indicators when not playing)
  lineRenderer.render(ctx, store.lines, store.layers, gameLoop.state !== GameState.PLAYING);

  // Draw active tool preview (editing or paused)
  if (gameLoop.state !== GameState.PLAYING && currentTool.render) {
    currentTool.render(ctx);
  }

  // Draw triggers (edit mode or paused)
  triggerRenderer.render(ctx, triggerStore.triggers, gameLoop.state !== GameState.PLAYING);

  // Onion skinning: draw ghost riders from previous snapshots
  if (onionSkinning && gameLoop.state !== GameState.EDITING) {
    const ghosts = gameLoop.getOnionSnapshots(4);
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const opacity = 0.1 + (ghosts.length - 1 - i) * 0.05;
      ctx.globalAlpha = opacity;
      const ghostData = Rider.renderDataFromSnapshot(ghosts[i].snapshot);
      riderRenderer.render(ctx, ghostData);
    }
    ctx.globalAlpha = 1;
  }

  // Draw rider
  const renderData = rider.getRenderData(renderAlpha);
  riderRenderer.render(ctx, renderData);

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

    const fx = focusTarget ? focusTarget.x : center.x;
    const fy = focusTarget ? focusTarget.y : center.y;
    camera.position.x += (fx - camera.position.x) * 0.1;
    camera.position.y += (fy - camera.position.y) * 0.1;
  }
});

// Start
gameLoop.start();
fitView();
