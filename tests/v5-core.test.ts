import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULTS,
  DEFAULT_LEVEL_SIZES,
  DYNAMIC_DANGER_MIN_Z,
  FIXED_DANGER_Z,
  LANE_HALF,
  Settings,
  cupHeight,
  cupRadius,
  maxLaunchX,
} from '../app/game/config';
import { advanceDynamicDanger, powerFromGesture, predictPath, validateLevelSizes } from '../app/game/core';

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULTS,
  levelSizes: [...DEFAULT_LEVEL_SIZES],
  ...patch,
});

test('V5 keeps visual and physical sizes independent from the selected theme', () => {
  const juice = settings({ theme: 'premiumJuice' });
  const sundae = settings({ theme: 'premiumSundae' });
  const wine = settings({ theme: 'premiumWine' });
  for (let level = 0; level < 7; level += 1) {
    assert.equal(cupRadius(level, juice), cupRadius(level, sundae));
    assert.equal(cupRadius(level, juice), cupRadius(level, wine));
    assert.equal(cupHeight(level, juice), cupHeight(level, wine));
  }
});

test('larger levels widen faster than they grow tall to protect rear-row visibility', () => {
  const active = settings();
  const smallRatio = cupHeight(0, active) / cupRadius(0, active);
  const largeRatio = cupHeight(6, active) / cupRadius(6, active);
  assert.ok(cupRadius(6, active) > cupRadius(0, active) * 2.2);
  assert.ok(largeRatio < smallRatio);
});

test('launch clamping always leaves the complete collider inside both rails', () => {
  const active = settings();
  for (let level = 0; level < 7; level += 1) {
    const maximum = maxLaunchX(level, active);
    assert.ok(maximum + cupRadius(level, active) <= LANE_HALF - 0.079);
    assert.ok(maximum >= 0);
  }
});

test('medium angled power can cross a rail and continue on a reflected path', () => {
  const active = settings({ power: true, bounces: true, aimLength: 3000 });
  const path = predictPath({ x: 0, angle: 0.58, locked: true }, 0, 13, active, []);
  const xs = path.map((point) => point[0]);
  const peakIndex = xs.indexOf(Math.max(...xs));
  assert.ok(peakIndex > 0 && peakIndex < xs.length - 1);
  assert.ok(xs[peakIndex] > LANE_HALF - cupRadius(0, active) - 0.08);
  assert.ok(xs.slice(peakIndex + 1).some((x) => x < xs[peakIndex] - 0.35));
});

test('disabling bounce prediction ends the guide at its first rail contact', () => {
  const active = settings({ bounces: false, aimLength: 3000 });
  const path = predictPath({ x: 0, angle: 0.7, locked: true }, 0, 13, active, []);
  const last = path[path.length - 1];
  assert.ok(last[0] <= LANE_HALF - cupRadius(0, active) + 0.06);
  assert.ok(path.length < 100);
});

test('power gesture blends distance and recent velocity and remains in range', () => {
  const active = settings({ minPower: 10, maxPower: 16, throwThreshold: 65 });
  const slow = powerFromGesture(300, 220, [{ y: 300, t: 0 }, { y: 220, t: 400 }], 400, active);
  const fast = powerFromGesture(300, 90, [{ y: 300, t: 300 }, { y: 90, t: 400 }], 400, active);
  assert.ok(slow >= 10 && slow <= 16);
  assert.ok(fast > slow);
  assert.ok(fast <= 16);
});

test('dynamic danger movement and imported size settings are safely clamped', () => {
  assert.equal(advanceDynamicDanger(FIXED_DANGER_Z, 100), FIXED_DANGER_Z);
  assert.equal(advanceDynamicDanger(DYNAMIC_DANGER_MIN_Z, -100), DYNAMIC_DANGER_MIN_Z);
  assert.deepEqual(validateLevelSizes([0, 1.1, 1.16, 1.4, 1.68, 2, 99], DEFAULT_LEVEL_SIZES),
    [1, 1.1, 1.16, 1.4, 1.68, 2, 3.8]);
});

