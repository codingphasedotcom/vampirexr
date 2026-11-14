import test from 'node:test';
import assert from 'node:assert/strict';
import { seatedLift, EYE_HEIGHT, DEFAULTS } from '../src/settings.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('seated players are lifted to the desktop eye height', () => {
  assert.equal(EYE_HEIGHT, 1.6);
  assert.ok(near(seatedLift(1.2), 0.4));
  assert.ok(near(1.05 + seatedLift(1.05), EYE_HEIGHT));
});

test('standing players are never lowered', () => {
  assert.equal(seatedLift(1.6), 0);
  assert.equal(seatedLift(1.85), 0);
});

test('bad readings are rejected and the lift is capped', () => {
  assert.equal(seatedLift(0.1), null);   // headset on the floor / no pose
  assert.equal(seatedLift(NaN), null);
  assert.equal(seatedLift(undefined), null);
  assert.equal(seatedLift(0.35), 1.2);   // capped
});

test('height defaults to the real headset height', () => {
  assert.equal(DEFAULTS.height, 'real');
});
