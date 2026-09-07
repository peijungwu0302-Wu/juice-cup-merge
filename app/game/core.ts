import {
  AimState,
  CupState,
  DYNAMIC_DANGER_MIN_Z,
  FIXED_DANGER_Z,
  LANE_FAR,
  LANE_HALF,
  LANE_LENGTH,
  LEGACY_TO_WORLD,
  Settings,
  SPAWN_Z,
  clamp,
  cupRadius,
  laneAngle,
  speedToWorld,
} from './config';

export type GestureSample = { y: number; t: number };

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
      return Math.hypot(cup.position[0] - x, cup.position[2] - z) <= otherRadius + radius;
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

