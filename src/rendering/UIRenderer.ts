import { LineType } from '../physics/lines/LineTypes';
import { GameState } from '../game/GameState';

interface UIState {
  frame: number;
  state: GameState;
  lineCount: number;
  toolName: string;
  lineType: LineType;
  speed: number;
}

export class UIRenderer {
  private statusTitle: HTMLElement;
  private hud: HTMLElement;
  private runSpeed: HTMLElement;

  constructor() {
    this.statusTitle = document.getElementById('status-title')!;
    this.hud = document.getElementById('hud')!;
    this.runSpeed = document.getElementById('run-speed')!;
  }

  update({ frame, state, lineCount, toolName, lineType, speed }: UIState) {
    const stateLabel = this.titleCase(state);
    this.hud.textContent = `${stateLabel} | ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`;

    if (state === GameState.EDITING) {
      this.statusTitle.textContent = 'Editor';
      this.runSpeed.textContent = `${this.titleCase(toolName)} tool | ${this.getTrackLabel(lineType)} track`;
      return;
    }

    this.statusTitle.textContent = state === GameState.PAUSED ? 'Run Paused' : 'Run Status';
    this.runSpeed.textContent = `Speed ${speed.toFixed(1)} u/s | Frame ${frame}`;
  }

  private titleCase(value: string): string {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private getTrackLabel(type: LineType): string {
    switch (type) {
      case LineType.SOLID:
        return 'Solid';
      case LineType.ACC:
        return 'Accel';
      case LineType.SCENERY:
        return 'Scenery';
    }
  }
}
