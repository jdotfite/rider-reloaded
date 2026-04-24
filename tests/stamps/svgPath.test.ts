import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSvgPathSubpaths } from '../../src/stamps/svgPath';

test('splitSvgPathSubpaths separates absolute move commands into distinct subpaths', () => {
  const d = 'M0 0 L10 0 ZM20 20 C25 10 35 10 40 20 Z';
  assert.deepEqual(splitSvgPathSubpaths(d), [
    'M0 0 L10 0 Z',
    'M20 20 C25 10 35 10 40 20 Z',
  ]);
});

test('splitSvgPathSubpaths separates relative move commands into distinct subpaths', () => {
  const d = 'm0 0 l10 0 zm20 20 l5 5 z';
  assert.deepEqual(splitSvgPathSubpaths(d), [
    'm0 0 l10 0 z',
    'm20 20 l5 5 z',
  ]);
});
