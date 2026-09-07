import {
  AimState,
  CupState,
  DEFAULT_LEVEL_SIZES,
  DEFAULTS,
  DYNAMIC_DANGER_MIN_Z,
  FIXED_DANGER_Z,
  GraphicsQuality,
  LANE_FAR,
  LANE_HALF,
  LANE_LENGTH,
  LEGACY_TO_WORLD,
  Settings,
  SPAWN_Z,
  Theme,
  clamp,
  cupRadius,
  laneAngle,
  speedToWorld,
} from './config';

const THEMES: Theme[] = ['premiumJuice', 'simpleJuice', 'premiumSundae', 'simpleSundae', 'premiumWine', 'simpleWine'];
const QUALITIES: GraphicsQuality[] = ['eco', 'balanced', 'cinematic'];

const bounded = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  if (value === null || value === '') return clamp(fallback, minimum, maximum);
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, minimum, maximum);
};

const booleanOr = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;

export function normalizeSettings(stored: Partial<Settings> | null): Settings {
  const merged = { ...DEFAULTS, ...(stored ?? {}) };
  const minPower = bounded(merged.minPower, DEFAULTS.minPower, 4.5, 20);
  const requestedMaximum = bounded(merged.maxPower, DEFAULTS.maxPower, 6, 25);
  const maxPower = Math.max(minPower + 0.1, requestedMaximum);
  return {
    ...merged,
    angle: booleanOr(merged.angle, DEFAULTS.angle),
    power: booleanOr(merged.power, DEFAULTS.power),
    levels: booleanOr(merged.levels, DEFAULTS.levels),
    occlusionCues: booleanOr(merged.occlusionCues, DEFAULTS.occlusionCues),
    dynamicDanger: booleanOr(merged.dynamicDanger, DEFAULTS.dynamicDanger),
    bounces: booleanOr(merged.bounces, DEFAULTS.bounces),
    sound: booleanOr(merged.sound, DEFAULTS.sound),
    vibration: booleanOr(merged.vibration, DEFAULTS.vibration),
    straightStabilizer: booleanOr(merged.straightStabilizer, DEFAULTS.straightStabilizer),
    debugHitboxes: booleanOr(merged.debugHitboxes, DEFAULTS.debugHitboxes),
    theme: THEMES.includes(merged.theme) ? merged.theme : DEFAULTS.theme,
    quality: QUALITIES.includes(merged.quality) ? merged.quality : DEFAULTS.quality,
    aimLength: bounded(merged.aimLength, DEFAULTS.aimLength, 0, 3000),
    straightLockDistance: bounded(merged.straightLockDistance, DEFAULTS.straightLockDistance, 0, 40),
    maxAngle: bounded(merged.maxAngle, DEFAULTS.maxAngle, 30, 85),
    fixedSpeed: bounded(merged.fixedSpeed, DEFAULTS.fixedSpeed, 5.5, 14),
    minPower,
    maxPower,
    wallRest: bounded(merged.wallRest, DEFAULTS.wallRest, 0.1, 0.99),
    frontRest: bounded(merged.frontRest, DEFAULTS.frontRest, 0, 0.6),
    cupRest: bounded(merged.cupRest, DEFAULTS.cupRest, 0, 0.55),
    drag: bounded(merged.drag, DEFAULTS.drag, 0.96, 0.998),
    slope: bounded(merged.slope, DEFAULTS.slope, 0, 0.04),
    size: bounded(merged.size, DEFAULTS.size, 0.55, 2.2),
    levelSizes: validateLevelSizes(merged.levelSizes, DEFAULT_LEVEL_SIZES),
    throwThreshold: bounded(merged.throwThreshold, DEFAULTS.throwThreshold, 30, 100),
    gameOverMs: bounded(merged.gameOverMs, DEFAULTS.gameOverMs, 500, 3000),
    blastRadius: bounded(merged.blastRadius, DEFAULTS.blastRadius, 80, 240),
    blastForce: bounded(merged.blastForce, DEFAULTS.blastForce, 1, 9),
    sleepSpeed: bounded(merged.sleepSpeed, DEFAULTS.sleepSpeed, 0.02, 0.3),
    sleepDelayMs: bounded(merged.sleepDelayMs, DEFAULTS.sleepDelayMs, 100, 1200),
    contactSlop: bounded(merged.contactSlop, DEFAULTS.contactSlop, 0, 1.5),
    bounceCutoff: bounded(merged.bounceCutoff, DEFAULTS.bounceCutoff, 0, 2),
    wakeImpulse: bounded(merged.wakeImpulse, DEFAULTS.wakeImpulse, 0.1, 2),
    mergeSettleMs: bounded(merged.mergeSettleMs, DEFAULTS.mergeSettleMs, 0, 400),
    dangerPenetration: bounded(merged.dangerPenetration, DEFAULTS.dangerPenetration, 0.1, 0.8),
    returnSpeed: bounded(merged.returnSpeed, DEFAULTS.returnSpeed, 0.2, 4),
    laneFriction: bounded(merged.laneFriction, DEFAULTS.laneFriction, 0, 0.8),
    cupFriction: bounded(merged.cupFriction, DEFAULTS.cupFriction, 0, 0.8),
    angularDamping: bounded(merged.angularDamping, DEFAULTS.angularDamping, 0.2, 6),
    solverIterations: Math.round(bounded(merged.solverIterations, DEFAULTS.solverIterations, 4, 16)),
    ccdSubsteps: Math.round(bounded(merged.ccdSubsteps, DEFAULTS.ccdSubsteps, 1, 4)),
    cameraHeight: bounded(merged.cameraHeight, DEFAULTS.cameraHeight, 9.5, 16),
  };
}

export type GestureSample = { y: number; t: number };

export function selectControlledLevel(
  baseLevel: number,
  unlocked: number,
  shots: number,
  orders: number,
  luckyCooldown: number,
  roll: number,
) {
  if (luckyCooldown > 0) return { level: baseLevel, luckyCooldown: luckyCooldown - 1 };
  const candidates = [
    { level: 4, chance: 0.0015, eligible: unlocked >= 4 && shots >= 55 && orders >= 2 },
    { level: 3, chance: 0.007, eligible: unlocked >= 3 && shots >= 28 && orders >= 1 },
    { level: 2, chance: 0.03, eligible: unlocked >= 2 && shots >= 12 },
  ];
  let threshold = 0;
  for (const candidate of candidates) {
    if (!candidate.eligible) continue;
    threshold += candidate.chance;
    if (roll < threshold) return { level: candidate.level, luckyCooldown: 10 };
  }
  return { level: baseLevel, luckyCooldown: 0 };
}

export function powerFromGesture(
  originY: number,
  releaseY: number,
  samples: GestureSample[],
  now: number,
  settings: Settings,
) {
  const distance = Math.max(0, originY - releaseY);
  const recent = samples.filter((sample) => now - sample.t < 130);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const velocity = first && last && last.t > first.t
    ? (first.y - last.y) / ((last.t - first.t) / 1000)
    : 0;
  const distanceFactor = clamp((distance - settings.throwThreshold) / Math.max(1, 220 - settings.throwThreshold), 0, 1);
  const velocityFactor = clamp((velocity - 350) / 1250, 0, 1);
  const strength = distanceFactor * 0.7 + velocityFactor * 0.3;
  const low = Math.min(settings.minPower, settings.maxPower);
  const high = Math.max(settings.minPower, settings.maxPower);
  return low + strength * (high - low);
}

export type PredictionPoint = [number, number, number];

export function predictPath(
  aim: AimState,
  level: number,
  requestedSpeed: number,
  settings: Settings,
  cups: CupState[],
) {
  if (settings.aimLength <= 0) return [] as PredictionPoint[];
  const radius = cupRadius(level, settings);
  const slopeAngle = laneAngle(settings.slope);
  const gravityAlongLane = 9.81 * Math.sin(slopeAngle);
  const damping = Math.max(0, (1 - settings.drag) * 60);
  const maxTravel = settings.aimLength * LEGACY_TO_WORLD;
  const dt = 1 / 90;
  let x = aim.x;
  let z = SPAWN_Z;
  let vx = Math.sin(aim.angle) * speedToWorld(requestedSpeed);
  let vz = -Math.cos(aim.angle) * speedToWorld(requestedSpeed);
  let travel = 0;
  let bounces = 0;
  const points: PredictionPoint[] = [[x, 0.055, z]];

  for (let step = 0; step < 900 && travel < maxTravel && bounces <= 14; step += 1) {
    const previousX = x;
    const previousZ = z;
    vz -= gravityAlongLane * dt;
    const attenuation = 1 / (1 + damping * dt);
    vx *= attenuation;
    vz *= attenuation;
    x += vx * dt;
    z += vz * dt;
    travel += Math.hypot(x - previousX, z - previousZ);

    if (x - radius < -LANE_HALF) {
      x = -LANE_HALF + radius;
      vx = Math.abs(vx) * settings.wallRest;
      bounces += 1;
      if (!settings.bounces) break;
    } else if (x + radius > LANE_HALF) {
      x = LANE_HALF - radius;
      vx = -Math.abs(vx) * settings.wallRest;
      bounces += 1;
      if (!settings.bounces) break;
    }

    if (z - radius < LANE_FAR) {
      z = LANE_FAR + radius;
      vz = Math.abs(vz) * settings.frontRest;
      bounces += 1;
      if (!settings.bounces) break;
    }

    if (step % 4 === 0) points.push([x, 0.055, z]);
    if (cups.some((cup) => {
      const otherRadius = cupRadius(cup.level, settings);
      const contactDistance = otherRadius + radius;
      const dx = cup.position[0] - x;
      const dz = cup.position[2] - z;
      return Math.abs(dx) <= contactDistance && Math.abs(dz) <= contactDistance &&
        dx * dx + dz * dz <= contactDistance * contactDistance;
    })) break;
  }
  return points;
}

export function advanceDynamicDanger(current: number, amount: number) {
  return clamp(current + amount, DYNAMIC_DANGER_MIN_Z, FIXED_DANGER_Z);
}

export function safeLineForMode(dynamic: boolean, current: number) {
  return dynamic ? clamp(current, DYNAMIC_DANGER_MIN_Z, FIXED_DANGER_Z) : FIXED_DANGER_Z;
}

export function validateLevelSizes(values: unknown, defaults: number[]) {
  if (!Array.isArray(values) || values.length !== defaults.length) return [...defaults];
  return values.map((value, index) => clamp(Number(value) || defaults[index], 0.55, 3.8));
}

export function laneFillRatio(cups: CupState[], settings: Settings) {
  const occupiedArea = cups.reduce((sum, cup) => {
    const radius = cupRadius(cup.level, settings);
    return sum + Math.PI * radius * radius;
  }, 0);
  return occupiedArea / (LANE_LENGTH * LANE_HALF * 2);
}

export function isStackDanger(
  cup: Pick<CupState, 'safeExited' | 'ageMs'>,
  stable: boolean,
  inDanger: boolean,
  hasCupContact: boolean,
) {
  return (cup.safeExited || cup.ageMs > 1200) && stable && inDanger && hasCupContact;
}
