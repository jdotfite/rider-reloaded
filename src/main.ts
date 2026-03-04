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

// Core
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const store = new TrackStore();
const grid = new SpatialGrid();

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

// Input
const input = new InputManager(canvas, camera);
input.setTool(currentTool);
input.getGameState = () => gameLoop.state;

input.onPlayPauseToggle = () => gameLoop.togglePlayPause();
input.onStop = () => stopPlayback();
input.onUndo = () => {
  if (gameLoop.state === GameState.EDITING) {
    store.undo();
  }
};
input.onRedo = () => {
  if (gameLoop.state === GameState.EDITING) {
    store.redo();
  }
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
let savedCameraPos: Vec2 | null = null;
let savedCameraZoom: number = 1;

// Toolbar
const toolbar = new Toolbar();
toolbar.setActiveTool('pencil');
toolbar.setActiveLineType(LineType.SOLID);
toolbar.setPlaybackState(GameState.EDITING);

// Game loop
const gameLoop = new GameLoop(physics, () => {
  renderer.render();
  toolbar.setPlaybackState(gameLoop.state);
  uiRenderer.update({
    frame: gameLoop.frame,
    state: gameLoop.state,
    lineCount: store.lines.length,
    toolName: currentTool.name,
    lineType: currentLineType,
    speed: rider.getCenterSpeed() * (1000 / TIMESTEP),
  });
});

toolbar.onToolSelect = (name) => switchTool(name);
toolbar.onLineTypeSelect = (type) => {
  currentLineType = type;
  toolbar.setActiveLineType(type);
};
toolbar.onClear = () => clearTrack();
toolbar.onSave = () => saveTrack();
toolbar.onLoad = () => openLoadDialog();
toolbar.onPlay = () => startPlayback();
toolbar.onPause = () => gameLoop.pause();
toolbar.onStop = () => stopPlayback();

loadInput.addEventListener('change', async () => {
  const file = loadInput.files?.[0];
  if (!file || gameLoop.state !== GameState.EDITING) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!store.load(parsed)) {
      window.alert('Invalid track file.');
      return;
    }

    stopPlayback();
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
  else if (name === 'flag') currentTool = flagTool;
  input.setTool(currentTool);
  toolbar.setActiveTool(name);
}

function clearTrack() {
  if (gameLoop.state !== GameState.EDITING) return;
  store.clear();
}

function beginQuickErase(worldPos: Vec2) {
  if (gameLoop.state !== GameState.EDITING) return;
  store.beginTransaction();
  store.removeLinesNear(worldPos, ERASER_RADIUS);
}

function continueQuickErase(worldPos: Vec2) {
  if (gameLoop.state !== GameState.EDITING) return;
  store.removeLinesNear(worldPos, ERASER_RADIUS);
}

function endQuickErase() {
  if (gameLoop.state !== GameState.EDITING) return;
  store.endTransaction();
}

function saveTrack() {
  if (gameLoop.state !== GameState.EDITING) return;

  const data = JSON.stringify(store.serialize(), null, 2);
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

function startPlayback() {
  if (gameLoop.state === GameState.EDITING) {
    // Build grid from current lines
    grid.rebuild(store.lines);
    // Reset rider
    rider.reset();
    // Save camera for restore
    savedCameraPos = camera.position.clone();
    savedCameraZoom = camera.zoom;
    cameraFollowing = true;
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

  // Draw lines
  lineRenderer.render(ctx, store.lines, camera);

  // Draw active tool preview
  if (gameLoop.state === GameState.EDITING && currentTool.render) {
    currentTool.render(ctx);
  }

  // Draw rider (always visible - shows start position when editing)
  const renderData = rider.getRenderData(renderAlpha);
  riderRenderer.render(ctx, renderData);

  // Camera follow during playback
  if (cameraFollowing && gameLoop.state === GameState.PLAYING) {
    const center = rider.getCenter(renderAlpha);
    // Exponential smoothing
    camera.position.x += (center.x - camera.position.x) * 0.1;
    camera.position.y += (center.y - camera.position.y) * 0.1;
  }
});

// Start
gameLoop.start();
