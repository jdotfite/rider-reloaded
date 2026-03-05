import { GameState } from '../game/GameState';

interface UIState {
  frame: number;
  state: GameState;
  lineCount: number;
  speed: number;
}

export class UIRenderer {
  update({ frame, state, lineCount, speed }: UIState) {
    // Stats are now updated directly via Toolbar.updateStats() and Toolbar.updateTimeline()
    // This class is kept for any future canvas-overlay HUD rendering
  }
}
