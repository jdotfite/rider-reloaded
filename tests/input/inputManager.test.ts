import test from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../../src/camera/Camera';
import { InputManager } from '../../src/input/InputManager';

function installWindowStub() {
  const listeners = new Map<string, Array<(event: KeyboardEvent) => void>>();
  const stub = {
    addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    removeEventListener(type: string, listener: (event: KeyboardEvent) => void) {
      const existing = listeners.get(type) ?? [];
      listeners.set(type, existing.filter((candidate) => candidate !== listener));
    },
    dispatch(type: string, event: KeyboardEvent) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: stub,
    configurable: true,
    writable: true,
  });
  return stub;
}

function createCanvasStub() {
  return {
    style: {},
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    },
  } as unknown as HTMLCanvasElement;
}

test('space toggles play/pause while the timeline scrubber has focus', () => {
  const windowStub = installWindowStub();
  const camera = new Camera();
  const input = new InputManager(createCanvasStub(), camera);
  let toggles = 0;
  input.onPlayPauseToggle = () => {
    toggles += 1;
  };

  windowStub.dispatch('keydown', {
    code: 'Space',
    preventDefault() {},
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: {
      tagName: 'INPUT',
      id: 'timeline-scrubber',
      isContentEditable: false,
    },
  } as KeyboardEvent);

  assert.equal(toggles, 1);
});

test('space remains ignored for normal text inputs', () => {
  const windowStub = installWindowStub();
  const camera = new Camera();
  const input = new InputManager(createCanvasStub(), camera);
  let toggles = 0;
  input.onPlayPauseToggle = () => {
    toggles += 1;
  };

  windowStub.dispatch('keydown', {
    code: 'Space',
    preventDefault() {},
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: {
      tagName: 'INPUT',
      id: 'audio-yt-input',
      isContentEditable: false,
    },
  } as KeyboardEvent);

  assert.equal(toggles, 0);
});
