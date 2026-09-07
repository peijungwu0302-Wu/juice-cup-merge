import V51_ASSET_SPEC from './v51-asset-spec.json';
import V52_ART_SPEC from './v52-art-spec.json';

export const LEVELS = [
  { name: '檸檬露', color: '#f4cf35', dark: '#a96608', accent: '#fff0a3' },
  { name: '蜜柑汁', color: '#ff8d27', dark: '#c9480a', accent: '#ffd18b' },
  { name: '草莓乳', color: '#ff5f7d', dark: '#b91f43', accent: '#ffc3cf' },
  { name: '葡萄冰', color: '#8b55d6', dark: '#43167f', accent: '#d9c0ff' },
  { name: '哈密瓜', color: '#50c875', dark: '#176f3b', accent: '#baf2c9' },
  { name: '西瓜蘇打', color: '#f6485d', dark: '#aa0f2e', accent: '#ffc2c7' },
  { name: '彩虹果昔', color: '#39cad7', dark: '#087589', accent: '#baf8f8' },
] as const;

export const THEME_LEVEL_NAMES = {
  juice: ['蜂蜜檸檬', '陽光柳橙', '草莓冰飲', '巨峰葡萄', '青蘋果薄荷', '西瓜冰飲', '彩虹果汁皇冠'],
  sundae: ['香草牛奶', '焦糖布丁', '抹茶紅豆', '餅乾可可', '藍莓起司', '黑森林巧克力', '皇家夢幻聖代'],
  wine: ['水晶蘇打', '薰衣草氣泡', '玫瑰荔枝', '蝶豆星空', '翡翠香草', '紅寶石石榴', '極光銀河杯'],
} as const;

export const DEFAULT_LEVEL_SIZES = [1, 1.1, 1.16, 1.4, 1.68, 2, 2.3];

export type CupKind = 'juice' | 'sundae' | 'wine';
export type Theme =
  | 'premiumJuice'
  | 'simpleJuice'
  | 'premiumSundae'
  | 'simpleSundae'
  | 'premiumWine'
  | 'simpleWine';
export type GraphicsQuality = 'eco' | 'balanced' | 'cinematic';
export type VisualMode = 'art' | 'realtime3d' | 'simple';

export type Settings = {
  angle: boolean;
  power: boolean;
  levels: boolean;
  occlusionCues: boolean;
  dynamicDanger: boolean;
  theme: Theme;
  visualMode: VisualMode;
  quality: GraphicsQuality;
  aimLength: number;
  bounces: boolean;
  sound: boolean;
  vibration: boolean;
  straightStabilizer: boolean;
  straightLockDistance: number;
  debugHitboxes: boolean;
  maxAngle: number;
  fixedSpeed: number;
  minPower: number;
  maxPower: number;
  wallRest: number;
  frontRest: number;
  cupRest: number;
  drag: number;
  slope: number;
  size: number;
  levelSizes: number[];
  throwThreshold: number;
  gameOverMs: number;
  blastRadius: number;
  blastForce: number;
  sleepSpeed: number;
  sleepDelayMs: number;
  contactSlop: number;
  bounceCutoff: number;
  wakeImpulse: number;
  mergeSettleMs: number;
  dangerPenetration: number;
  returnSpeed: number;
  laneFriction: number;
  cupFriction: number;
  angularDamping: number;
  solverIterations: number;
  ccdSubsteps: number;
  cameraHeight: number;
};

export const DEFAULTS: Settings = {
  angle: false,
  power: false,
  levels: false,
  occlusionCues: true,
  dynamicDanger: false,
  theme: 'premiumJuice',
  visualMode: 'art',
  quality: 'balanced',
  aimLength: 2000,
  bounces: true,
  sound: false,
  vibration: false,
  straightStabilizer: true,
  straightLockDistance: 3,
  debugHitboxes: false,
  maxAngle: 85,
  fixedSpeed: 9,
  minPower: 10,
  maxPower: 16,
  wallRest: 0.91,
  frontRest: 0.12,
  cupRest: 0.22,
  drag: 0.994,
  slope: 0.01,
  size: 1,
  levelSizes: [...DEFAULT_LEVEL_SIZES],
  throwThreshold: 65,
  gameOverMs: 1400,
  blastRadius: 138,
  blastForce: 4.2,
  sleepSpeed: 0.08,
  sleepDelayMs: 420,
  contactSlop: 0.45,
  bounceCutoff: 0.55,
  wakeImpulse: 0.45,
  mergeSettleMs: 160,
  dangerPenetration: 0.32,
  returnSpeed: 0.8,
  laneFriction: 0.18,
  cupFriction: 0.12,
  angularDamping: 2.4,
  solverIterations: 8,
  ccdSubsteps: 2,
  cameraHeight: 12,
};

export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export type CupState = {
  id: number;
  level: number;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  rotation: QuatTuple;
  angularVelocity: Vec3Tuple;
  ageMs: number;
  dangerMs: number;
  safeExited: boolean;
  mergeLockMs: number;
  sleepMs: number;
};

export type AimState = { x: number; angle: number; locked: boolean };
export type BurstState = {
  id: number;
  x: number;
  z: number;
  color: string;
  radius: number;
  kind: 'merge' | 'blast';
  createdAt: number;
};

export type GameSnapshot = {
  cups: CupState[];
  score: number;
  shots: number;
  orders: number;
  queue: number[];
  bag: number[];
  unlocked: number;
  dangerLine: number;
  launchX: number;
  revives: number;
  luckyCooldown: number;
};

export const ASSET_VERSION = V52_ART_SPEC.version;
export const LANE_WIDTH = V51_ASSET_SPEC.lane.width;
export const LANE_HALF = LANE_WIDTH / 2;
export const LANE_LENGTH = V51_ASSET_SPEC.lane.length;
export const LANE_NEAR = LANE_LENGTH / 2;
export const LANE_FAR = -LANE_LENGTH / 2;
export const SPAWN_Z = LANE_NEAR - 1.38;
export const FIXED_DANGER_Z = LANE_NEAR - 2.7;
export const DYNAMIC_DANGER_START_Z = LANE_NEAR - 4.35;
export const DYNAMIC_DANGER_MIN_Z = LANE_FAR + 2.1;
export const BASE_CUP_RADIUS = 0.46;
export const CUP_MODEL_RADIUS = V51_ASSET_SPEC.cup.modelRadius;
export const CUP_MODEL_HEIGHT = V51_ASSET_SPEC.cup.modelHeight;
export const CUP_COLLIDER_SLICES = V51_ASSET_SPEC.cup.colliderSlices;
export const LANE_ASSET = V51_ASSET_SPEC.lane;
export const ART_ASSET = V52_ART_SPEC;
export const SPEED_TO_WORLD = 1.55;
export const LEGACY_TO_WORLD = LANE_LENGTH / 640;
export const STORAGE_KEY = 'juice-v5-settings';

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export const kindForTheme = (theme: Theme): CupKind =>
  theme.includes('Sundae') ? 'sundae' : theme.includes('Wine') ? 'wine' : 'juice';

export const isPremiumTheme = (theme: Theme) => theme.startsWith('premium');

export const themeFor = (kind: CupKind, visualMode: VisualMode): Theme => {
  const suffix = kind === 'juice' ? 'Juice' : kind === 'sundae' ? 'Sundae' : 'Wine';
  return `${visualMode === 'simple' ? 'simple' : 'premium'}${suffix}` as Theme;
};

export const artSpritePath = (theme: Theme, level: number) =>
  `/art-v52/${kindForTheme(theme)}-${clamp(Math.round(level), 0, LEVELS.length - 1) + 1}.png`;

export const levelName = (theme: Theme, level: number) =>
  THEME_LEVEL_NAMES[kindForTheme(theme)][level] ?? LEVELS[level]?.name ?? '';

export const cupRadius = (level: number, settings: Pick<Settings, 'size' | 'levelSizes'>) =>
  BASE_CUP_RADIUS * settings.size * (settings.levelSizes[level] ?? DEFAULT_LEVEL_SIZES[level] ?? 1);

export const cupHeight = (level: number, settings: Pick<Settings, 'size' | 'levelSizes'>) => {
  const radius = cupRadius(level, settings);
  const levelScale = settings.levelSizes[level] ?? DEFAULT_LEVEL_SIZES[level] ?? 1;
  // Bigger cups grow mainly sideways. This keeps the back row readable while
  // retaining a real 3D body and a level-dependent collision volume.
  const slenderness = clamp(2.95 - (levelScale - 1) * 0.58, 2.18, 2.95);
  return radius * slenderness;
};

export const laneAngle = (slope: number) => Math.atan(clamp(slope, 0, 0.06));
export const laneSurfaceY = (z: number, slope: number) => z * Math.sin(laneAngle(slope));
export const launchY = (level: number, settings: Settings) =>
  laneSurfaceY(SPAWN_Z, settings.slope) + 0.035;

export const maxLaunchX = (level: number, settings: Settings) =>
  Math.max(0, LANE_HALF - cupRadius(level, settings) - 0.08);

export const speedToWorld = (speed: number) => speed * SPEED_TO_WORLD;

export const cloneCup = (cup: CupState): CupState => ({
  ...cup,
  position: [...cup.position],
  velocity: [...cup.velocity],
  rotation: [...cup.rotation],
  angularVelocity: [...cup.angularVelocity],
});
