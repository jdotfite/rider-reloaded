import { GameState } from './GameState';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import { TIMESTEP } from '../constants';

export class GameLoop {
  state: GameState = GameState.EDITING;
  frame: number = 0;
  renderAlpha: number = 1;
  private physics: PhysicsEngine;
  private accumulator: number = 0;
  private lastTime: number = 0;
  private onRender: () => void;

  constructor(physics: PhysicsEngine, onRender: () => void) {
    this.physics = physics;
    this.onRender = onRender;
  }

  start() {
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.tick(this.lastTime);
  }

  private tick = (now: number) => {
    const dt = now - this.lastTime;
    this.lastTime = now;

    if (this.state === GameState.PLAYING) {
      this.accumulator += dt;
      // Cap to avoid spiral of death
      if (this.accumulator > TIMESTEP * 5) {
        this.accumulator = TIMESTEP * 5;
      }
      while (this.accumulator >= TIMESTEP) {
        this.physics.step();
        this.frame++;
        this.accumulator -= TIMESTEP;
      }

      this.renderAlpha = this.accumulator / TIMESTEP;
    } else {
      this.renderAlpha = 1;
    }

    this.onRender();
    requestAnimationFrame(this.tick);
  };

  play() {
    if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
      this.lastTime = performance.now();
      this.accumulator = 0;
    } else if (this.state === GameState.EDITING) {
      this.state = GameState.PLAYING;
      this.frame = 0;
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  }

  pause() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
    }
  }

  togglePlayPause() {
    if (this.state === GameState.PLAYING) {
      this.pause();
    } else {
      this.play();
    }
  }

  stop() {
    this.state = GameState.EDITING;
    this.frame = 0;
  }
}
