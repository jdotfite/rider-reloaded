import { GameState } from './GameState';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import { TIMESTEP } from '../constants';
import type { RiderSnapshot } from '../physics/Rider';

const SNAPSHOT_INTERVAL = 40; // save snapshot every 40 frames (~1 second)

interface FrameSnapshot {
  frame: number;
  snapshot: RiderSnapshot;
}

export class GameLoop {
  state: GameState = GameState.EDITING;
  frame: number = 0;
  maxFrame: number = 0;
  renderAlpha: number = 1;
  playbackSpeed: number = 1.0;
  private physics: PhysicsEngine;
  private accumulator: number = 0;
  private lastTime: number = 0;
  private onRender: () => void;

  // Snapshot system for fast seeking
  private snapshots: FrameSnapshot[] = [];
  private saveSnapshotFn: (() => RiderSnapshot) | null = null;
  private restoreSnapshotFn: ((snap: RiderSnapshot) => void) | null = null;
  private resetRiderFn: (() => void) | null = null;

  constructor(physics: PhysicsEngine, onRender: () => void) {
    this.physics = physics;
    this.onRender = onRender;
  }

  /** Wire snapshot save/restore functions from the rider */
  setSnapshotCallbacks(
    save: () => RiderSnapshot,
    restore: (snap: RiderSnapshot) => void,
    resetRider: () => void,
  ) {
    this.saveSnapshotFn = save;
    this.restoreSnapshotFn = restore;
    this.resetRiderFn = resetRider;
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
      this.accumulator += dt * this.playbackSpeed;
      if (this.accumulator > TIMESTEP * 5) {
        this.accumulator = TIMESTEP * 5;
      }
      while (this.accumulator >= TIMESTEP) {
        this.physics.step();
        this.frame++;
        this.accumulator -= TIMESTEP;

        // Save periodic snapshots
        if (this.saveSnapshotFn && this.frame % SNAPSHOT_INTERVAL === 0) {
          this.snapshots.push({
            frame: this.frame,
            snapshot: this.saveSnapshotFn(),
          });
        }
      }

      if (this.frame > this.maxFrame) {
        this.maxFrame = this.frame;
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
      this.maxFrame = 0;
      this.snapshots = [];
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
    this.maxFrame = 0;
    this.snapshots = [];
  }

  /** Reset frame counter and clear stale snapshots (e.g. after grid rebuild) */
  resetSimulation() {
    this.frame = 0;
    this.snapshots = [];
  }

  stepForward() {
    if (this.state === GameState.PLAYING) {
      this.pause();
    }
    if (this.state !== GameState.PAUSED) return;
    this.physics.step();
    this.frame++;
    if (this.frame > this.maxFrame) {
      this.maxFrame = this.frame;
    }
    // Save snapshot at intervals
    if (this.saveSnapshotFn && this.frame % SNAPSHOT_INTERVAL === 0) {
      this.snapshots.push({
        frame: this.frame,
        snapshot: this.saveSnapshotFn(),
      });
    }
    this.accumulator = 0;
  }

  /** Get snapshots near current frame for onion skinning */
  getOnionSnapshots(count: number): FrameSnapshot[] {
    const result: FrameSnapshot[] = [];
    for (let i = this.snapshots.length - 1; i >= 0 && result.length < count; i--) {
      if (this.snapshots[i].frame < this.frame) {
        result.push(this.snapshots[i]);
      }
    }
    return result;
  }

  seekToFrame(targetFrame: number) {
    // Find the nearest snapshot before or at targetFrame
    let bestSnap: FrameSnapshot | null = null;
    for (const snap of this.snapshots) {
      if (snap.frame <= targetFrame) {
        bestSnap = snap;
      } else {
        break;
      }
    }

    if (bestSnap && bestSnap.frame <= targetFrame && this.restoreSnapshotFn) {
      // Restore from snapshot if it's closer than current frame or we need to go backward
      if (targetFrame < this.frame || bestSnap.frame > this.frame) {
        this.restoreSnapshotFn(bestSnap.snapshot);
        this.frame = bestSnap.frame;
      } else if (targetFrame < this.frame) {
        // targetFrame is before current but no good snapshot — replay from 0
        this.resetRiderFn?.();
        this.frame = 0;
      }
      // else: targetFrame >= this.frame, just step forward from current
    } else if (targetFrame < this.frame) {
      // No snapshots — replay from start
      this.resetRiderFn?.();
      this.frame = 0;
    }

    // Step forward to target
    while (this.frame < targetFrame) {
      this.physics.step();
      this.frame++;

      // Save snapshots as we pass interval points
      if (this.saveSnapshotFn && this.frame % SNAPSHOT_INTERVAL === 0) {
        // Only add if we don't already have this frame
        const existing = this.snapshots.find(s => s.frame === this.frame);
        if (!existing) {
          this.snapshots.push({
            frame: this.frame,
            snapshot: this.saveSnapshotFn(),
          });
        }
      }
    }

    if (this.frame > this.maxFrame) {
      this.maxFrame = this.frame;
    }
    this.accumulator = 0;

    // Auto-pause after seeking so user can inspect
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
    }
  }
}
