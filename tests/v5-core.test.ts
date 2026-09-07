import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSET_VERSION,
  CUP_COLLIDER_SLICES,
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
import { advanceDynamicDanger, isStackDanger, normalizeSettings, powerFromGesture, predictPath, selectControlledLevel, shouldSimpleReleaseLaunch, validateLevelSizes } from '../app/game/core';

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULTS,
  levelSizes: [...DEFAULT_LEVEL_SIZES],
  ...patch,
});

test('V5 ships with the approved default presentation and throw values', () => {
  assert.equal(ASSET_VERSION, '5.5.0');
  assert.equal(DEFAULTS.theme, 'premiumJuice');
  assert.equal(DEFAULTS.visualMode, 'art');
  assert.equal(DEFAULTS.dynamicDanger, false);
  assert.equal(DEFAULTS.straightStabilizer, true);
  assert.equal(DEFAULTS.straightLockDistance, 3);
  assert.equal(DEFAULTS.simpleReleaseLaunch, true);
  assert.equal(DEFAULTS.aimLength, 2000);
  assert.equal(DEFAULTS.fixedSpeed, 9);
  assert.equal(DEFAULTS.minPower, 10);
  assert.equal(DEFAULTS.maxPower, 16);
  assert.equal(DEFAULTS.size, 1);
});

test('simple release launches only after an intentional, uncancelled press', () => {
  const active = settings({ angle: false, power: false, simpleReleaseLaunch: true });
  assert.equal(shouldSimpleReleaseLaunch(active, true, false, 0, 50), true);
  assert.equal(shouldSimpleReleaseLaunch(active, true, false, 36, 120), false);
  assert.equal(shouldSimpleReleaseLaunch(active, false, false, 0, 120), false);
  assert.equal(shouldSimpleReleaseLaunch(active, true, false, 0, 49), false);
  assert.equal(shouldSimpleReleaseLaunch({ ...active, angle: true }, true, false, 0, 120), false);
  assert.equal(shouldSimpleReleaseLaunch({ ...active, power: true }, true, false, 0, 120), false);
});

test('V5.1 uses one five-slice rim-led envelope for every visual theme', () => {
  assert.equal(CUP_COLLIDER_SLICES.length, 5);
  assert.equal(CUP_COLLIDER_SLICES.at(-1)?.name, 'rim');
  assert.equal(CUP_COLLIDER_SLICES.at(-1)?.radius, 0.985);
  assert.equal((CUP_COLLIDER_SLICES.at(-1)?.centerY ?? 0) + (CUP_COLLIDER_SLICES.at(-1)?.halfHeight ?? 0), 1);
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

test('switching renderers cannot change a cup collider or physical size', () => {
  for (const visualMode of ['art', 'realtime3d', 'simple'] as const) {
    const active = settings({ visualMode });
    for (let level = 0; level < 7; level += 1) {
      assert.equal(cupRadius(level, active), cupRadius(level, settings({ visualMode: 'art' })));
      assert.equal(cupHeight(level, active), cupHeight(level, settings({ visualMode: 'art' })));
    }
    assert.deepEqual(CUP_COLLIDER_SLICES, settings({ visualMode }).visualMode && CUP_COLLIDER_SLICES);
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

test('saved settings are migrated without allowing invalid physics values', () => {
  const migrated = normalizeSettings({
    theme: 'retired-theme',
    quality: 'ultra-phone',
    angle: 'yes',
    size: Number.NaN,
    drag: 7,
    slope: -2,
    minPower: 20,
    maxPower: 6,
    solverIterations: 8.8,
    ccdSubsteps: 99,
    levelSizes: [0, 1, 2, 3, 4, 5, 99],
  } as unknown as Partial<Settings>);
  assert.equal(migrated.theme, DEFAULTS.theme);
  assert.equal(migrated.quality, DEFAULTS.quality);
  assert.equal(migrated.angle, DEFAULTS.angle);
  assert.equal(migrated.size, DEFAULTS.size);
  assert.equal(migrated.drag, 0.998);
  assert.equal(migrated.slope, 0);
  assert.ok(migrated.maxPower > migrated.minPower);
  assert.equal(migrated.solverIterations, 9);
  assert.equal(migrated.ccdSubsteps, 4);
  assert.deepEqual(migrated.levelSizes, [1, 1, 2, 3, 3.8, 3.8, 3.8]);
});

test('legacy simple themes migrate to the simple renderer without changing gameplay defaults', () => {
  const migrated = normalizeSettings({ theme: 'simpleWine' });
  assert.equal(migrated.visualMode, 'simple');
  assert.equal(migrated.theme, 'simpleWine');
  assert.equal(migrated.wallRest, DEFAULTS.wallRest);
  assert.equal(migrated.size, DEFAULTS.size);
});

test('game over requires a stable cup pile rather than a lone rebound', () => {
  const returnedCup = { safeExited: true, ageMs: 4000 };
  assert.equal(isStackDanger(returnedCup, true, true, false), false);
  assert.equal(isStackDanger(returnedCup, false, true, true), false);
  assert.equal(isStackDanger(returnedCup, true, false, true), false);
  assert.equal(isStackDanger(returnedCup, true, true, true), true);
});

test('rare higher-level cups require progress and enforce a cooldown', () => {
  assert.deepEqual(selectControlledLevel(0, 6, 4, 0, 0, 0), { level: 0, luckyCooldown: 0 });
  assert.deepEqual(selectControlledLevel(0, 2, 12, 0, 0, 0.02), { level: 2, luckyCooldown: 10 });
  assert.deepEqual(selectControlledLevel(1, 3, 28, 1, 0, 0.006), { level: 3, luckyCooldown: 10 });
  assert.deepEqual(selectControlledLevel(0, 4, 55, 2, 0, 0.001), { level: 4, luckyCooldown: 10 });
  assert.deepEqual(selectControlledLevel(1, 6, 100, 5, 10, 0), { level: 1, luckyCooldown: 9 });
});
