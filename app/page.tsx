'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const WORLD_W = 340;
const WORLD_H = 640;
const FIXED_DANGER = WORLD_H - 72;
const DYNAMIC_DANGER_START = WORLD_H - 140;
// Dynamic mode may keep advancing until only the front pocket of the lane is safe.
// Good merges buy room back, but a long run can no longer become effectively endless.
const DYNAMIC_DANGER_MIN = WORLD_H - 580;
const MERGE_SENSOR = 1.03;

const LEVELS = [
  { name: '檸檬露', color: '#f8d53c', dark: '#c28a12' },
  { name: '蜜柑汁', color: '#ff9d2f', dark: '#d95a10' },
  { name: '草莓乳', color: '#ff6986', dark: '#cf244a' },
  { name: '葡萄冰', color: '#9964df', dark: '#582397' },
  { name: '哈密瓜', color: '#62cf80', dark: '#21874d' },
  { name: '西瓜蘇打', color: '#fb5268', dark: '#bf1836' },
  { name: '彩虹果昔', color: '#55dbe0', dark: '#14889f' },
];

const SIZE_CURVE = [1, 1.1, 1.16, 1.31, 1.48, 1.68, 1.92];

type Theme =
  | 'premiumJuice'
  | 'simpleJuice'
  | 'premiumSundae'
  | 'simpleSundae'
  | 'premiumWine'
  | 'simpleWine';

const PREMIUM_ASSETS: Partial<Record<Theme, string>> = {
  premiumJuice: '/assets/cups-juice-premium-v1.png',
  premiumSundae: '/assets/cups-sundae-premium-v1.png',
  premiumWine: '/assets/cups-wine-premium-v1.png',
};

type Bounds = [number, number, number, number];
const SPRITE_BOUNDS: Partial<Record<Theme, Bounds[]>> = {
  premiumJuice: [
    [47, 193, 310, 658], [0, 120, 311, 660], [0, 104, 310, 656],
    [0, 55, 310, 684], [0, 23, 290, 670], [9, 30, 273, 666], [3, 67, 296, 657],
  ],
  premiumSundae: [
    [23, 21, 304, 705], [1, 19, 304, 673], [15, 45, 288, 675],
    [15, 213, 300, 675], [5, 15, 274, 675], [1, 23, 269, 701], [17, 23, 292, 693],
  ],
  premiumWine: [
    [15, 23, 293, 740], [0, 33, 292, 740], [0, 43, 293, 740],
    [0, 47, 292, 738], [0, 53, 293, 739], [0, 33, 292, 740], [0, 10, 283, 744],
  ],
};

type Settings = {
  angle: boolean;
  power: boolean;
  levels: boolean;
  dynamicDanger: boolean;
  theme: Theme;
  aimLength: number;
  bounces: boolean;
  sound: boolean;
  vibration: boolean;
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
  throwThreshold: number;
  gameOverMs: number;
  blastRadius: number;
  blastForce: number;
};

const DEFAULTS: Settings = {
  angle: false,
  power: false,
  levels: false,
  dynamicDanger: true,
  theme: 'premiumJuice',
  aimLength: 1700,
  bounces: true,
  sound: false,
  vibration: false,
  maxAngle: 85,
  fixedSpeed: 8.5,
  minPower: 6.5,
  maxPower: 12.5,
  wallRest: 0.84,
  frontRest: 0.08,
  cupRest: 0.2,
  drag: 0.989,
  slope: 0.009,
  size: 1,
  throwThreshold: 65,
  gameOverMs: 1000,
  blastRadius: 138,
  blastForce: 4.2,
};

type Cup = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  level: number;
  r: number;
  dangerMs: number;
  ageMs: number;
  safeExited: boolean;
  mergeLockMs: number;
};

type Burst = { x: number; y: number; life: number; color: string; maxR: number };
type Aim = { x: number; angle: number; locked: boolean };
type GestureMode = 'position' | 'aim' | 'throw' | 'direct';
type Gesture = {
  active: boolean;
  mode: GestureMode;
  pointerId: number;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  positionLocked: boolean;
  samples: Array<{ y: number; t: number }>;
};
type Pred = { paths: Array<Array<{ x: number; y: number }>>; lastCalc: number };
type GameSnapshot = {
  cups: Cup[];
  score: number;
  shots: number;
  orders: number;
  queue: number[];
  bag: number[];
  unlocked: number;
  dangerLine: number;
  launchX: number;
  revives: number;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isPremium = (theme: Theme) => theme.startsWith('premium');
const simpleKind = (theme: Theme) =>
  theme.includes('Sundae') ? 'sundae' : theme.includes('Wine') ? 'wine' : 'juice';
const themeEmoji = (theme: Theme) =>
  theme.includes('Sundae') ? '🍨' : theme.includes('Wine') ? '🍷' : '🥤';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cupsRef = useRef<Cup[]>([]);
  const burstsRef = useRef<Burst[]>([]);
  const idRef = useRef(1);
  const settingsRef = useRef<Settings>(DEFAULTS);
  const runningRef = useRef(true);
  const safeUntilRef = useRef(0);
  const lastShotRef = useRef(0);
  const dangerLineRef = useRef(DYNAMIC_DANGER_START);
  const lastLaunchXRef = useRef(0);
  const revivesRef = useRef(0);
  const aimRef = useRef<Aim>({ x: 0, angle: 0, locked: false });
  const gestureRef = useRef<Gesture>({
    active: false, mode: 'direct', pointerId: 0, originX: 0, originY: 0,
    lastX: 0, lastY: 0, positionLocked: false, samples: [],
  });
  const sizeRef = useRef({ w: 390, h: 700, dpr: 1 });
  const queueRef = useRef<number[]>([0, 0]);
  const bagRef = useRef<number[]>([]);
  const historyRef = useRef<GameSnapshot[]>([]);
  const predictionRef = useRef<Pred>({ paths: [], lastCalc: 0 });
  const scoreRef = useRef(0);
  const shotsRef = useRef(0);
  const ordersRef = useRef(0);
  const unlockedRef = useRef(0);
  const lifetimeOrdersRef = useRef(0);
  const maxOrdersThisRunRef = useRef(0);
  const hydratedRef = useRef(false);

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [aimLocked, setAimLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [bestClean, setBestClean] = useState(0);
  const [shots, setShots] = useState(0);
  const [revives, setRevives] = useState(0);
  const [orders, setOrders] = useState(0);
  const [lifetimeOrders, setLifetimeOrders] = useState(0);
  const [queue, setQueue] = useState<number[]>([0, 0]);
  const [unlocked, setUnlocked] = useState(0);
  const [powerPreview, setPowerPreview] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);

  const drawBag = useCallback(() => {
    if (!bagRef.current.length) {
      const bag = [0, 0, 0, 0, 0, 0, 1, 1];
      for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      bagRef.current = bag;
    }
    return bagRef.current.shift() ?? 0;
  }, []);

  const resetAim = useCallback((x = lastLaunchXRef.current) => {
    aimRef.current = { x, angle: 0, locked: false };
    setAimLocked(false);
    predictionRef.current.lastCalc = 0;
  }, []);

  const reset = useCallback((withSettings?: Settings) => {
    const active = withSettings ?? settingsRef.current;
    cupsRef.current = [];
    burstsRef.current = [];
    historyRef.current = [];
    runningRef.current = true;
    safeUntilRef.current = 0;
    revivesRef.current = 0;
    bagRef.current = [];
    lastLaunchXRef.current = 0;
    maxOrdersThisRunRef.current = 0;
    dangerLineRef.current = active.dynamicDanger ? DYNAMIC_DANGER_START : FIXED_DANGER;
    resetAim(0);
    const next = [drawBag(), drawBag()];
    queueRef.current = next;
    scoreRef.current = 0;
    shotsRef.current = 0;
    ordersRef.current = 0;
    unlockedRef.current = 0;
    setQueue(next);
    setScore(0);
    setShots(0);
    setRevives(0);
    setOrders(0);
    setUnlocked(0);
    setHistoryCount(0);
    setGameOver(false);
    setPowerPreview(0);
  }, [drawBag, resetAim]);

  useEffect(() => {
    let loaded = DEFAULTS;
    const raw = localStorage.getItem('juice-v4-settings');
    if (raw) {
      try { loaded = { ...DEFAULTS, ...JSON.parse(raw) }; } catch { /* ignore */ }
    }
    settingsRef.current = loaded;
    setSettings(loaded);
    setBest(Number(localStorage.getItem('juice-best') || 0));
    setBestClean(Number(localStorage.getItem('juice-best-clean') || 0));
    const storedOrders = Number(localStorage.getItem('juice-orders') || 0);
    lifetimeOrdersRef.current = storedOrders;
    setLifetimeOrders(storedOrders);
    hydratedRef.current = true;
    reset(loaded);
  }, [reset]);

  useEffect(() => {
    settingsRef.current = settings;
    predictionRef.current.lastCalc = 0;
    if (hydratedRef.current) localStorage.setItem('juice-v4-settings', JSON.stringify(settings));
  }, [settings]);

  const signal = useCallback((strong = false) => {
    const active = settingsRef.current;
    if (active.vibration && navigator.vibrate) navigator.vibrate(strong ? [28, 25, 45] : 18);
    if (!active.sound) return;
    try {
      const AudioCtor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audio = new AudioCtor();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.frequency.value = strong ? 210 : 480;
      gain.gain.setValueAtTime(0.05, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.18);
    } catch { /* optional */ }
  }, []);

  const radiusFor = useCallback((level: number) =>
    22.8 * SIZE_CURVE[level] * settingsRef.current.size, []);

  const award = useCallback((points: number) => {
    const next = scoreRef.current + points;
    scoreRef.current = next;
    setScore(next);
    setBest((old) => {
      const value = Math.max(old, next);
      localStorage.setItem('juice-best', String(value));
      return value;
    });
    if (revivesRef.current === 0) {
      setBestClean((old) => {
        const value = Math.max(old, next);
        localStorage.setItem('juice-best-clean', String(value));
        return value;
      });
    }
  }, []);

  const registerOrder = useCallback(() => {
    const next = ordersRef.current + 1;
    ordersRef.current = next;
    setOrders(next);
    if (next > maxOrdersThisRunRef.current) {
      maxOrdersThisRunRef.current = next;
      const lifetime = lifetimeOrdersRef.current + 1;
      lifetimeOrdersRef.current = lifetime;
      setLifetimeOrders(lifetime);
      localStorage.setItem('juice-orders', String(lifetime));
    }
  }, []);

  const pushHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      cups: cupsRef.current.map((cup) => ({ ...cup })),
      score: scoreRef.current,
      shots: shotsRef.current,
      orders: ordersRef.current,
      queue: [...queueRef.current],
      bag: [...bagRef.current],
      unlocked: unlockedRef.current,
      dangerLine: dangerLineRef.current,
      launchX: aimRef.current.x,
      revives: revivesRef.current,
    };
    historyRef.current = [...historyRef.current, snapshot].slice(-2);
    setHistoryCount(historyRef.current.length);
  }, []);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    cupsRef.current = snapshot.cups.map((cup) => ({ ...cup }));
    scoreRef.current = snapshot.score;
    shotsRef.current = snapshot.shots;
    ordersRef.current = snapshot.orders;
    queueRef.current = [...snapshot.queue];
    bagRef.current = [...snapshot.bag];
    unlockedRef.current = snapshot.unlocked;
    dangerLineRef.current = snapshot.dangerLine;
    lastLaunchXRef.current = snapshot.launchX;
    revivesRef.current = snapshot.revives;
    setScore(snapshot.score);
    setShots(snapshot.shots);
    setOrders(snapshot.orders);
    setQueue([...snapshot.queue]);
    setUnlocked(snapshot.unlocked);
    setRevives(snapshot.revives);
    setHistoryCount(historyRef.current.length);
    runningRef.current = true;
    setGameOver(false);
    safeUntilRef.current = performance.now() + 1000;
    lastShotRef.current = 0;
    resetAim(snapshot.launchX);
  }, [resetAim]);

  const fire = useCallback((requestedPower: number) => {
    const now = performance.now();
    if (!runningRef.current || now - lastShotRef.current < 50) return;
    lastShotRef.current = now;
    pushHistory();
    const active = settingsRef.current;
    const aim = aimRef.current;
    const level = queueRef.current[0];
    const low = Math.min(active.minPower, active.maxPower);
    const high = Math.max(active.minPower, active.maxPower);
    const speed = active.power ? clamp(requestedPower, low, high) : active.fixedSpeed;
    cupsRef.current.push({
      id: idRef.current++, x: aim.x, y: WORLD_H - 26,
      vx: Math.sin(aim.angle) * speed, vy: -Math.cos(aim.angle) * speed,
      level, r: radiusFor(level), dangerMs: 0, ageMs: 0,
      safeExited: false, mergeLockMs: 0,
    });
    if (active.dynamicDanger) {
      dangerLineRef.current = clamp(dangerLineRef.current - 9, DYNAMIC_DANGER_MIN, FIXED_DANGER);
    }
    shotsRef.current += 1;
    setShots(shotsRef.current);
    const next = [queueRef.current[1], drawBag()];
    queueRef.current = next;
    setQueue(next);
    lastLaunchXRef.current = aim.x;
    resetAim(aim.x);
    setPowerPreview(0);
    signal(false);
  }, [drawBag, pushHistory, radiusFor, resetAim, signal]);

  const revive = useCallback(() => {
    const sorted = [...cupsRef.current].sort((a, b) => b.y - a.y);
    const remove = new Set(sorted.slice(0, 3).map((cup) => cup.id));
    cupsRef.current = cupsRef.current.filter((cup) => !remove.has(cup.id));
    for (const cup of cupsRef.current) {
      cup.y = Math.max(cup.r + 6, cup.y - 45);
      cup.dangerMs = 0;
      cup.ageMs = 1000;
      cup.safeExited = true;
      cup.vy -= 0.4;
    }
    revivesRef.current += 1;
    setRevives(revivesRef.current);
    if (settingsRef.current.dynamicDanger) {
      dangerLineRef.current = clamp(dangerLineRef.current + 40, DYNAMIC_DANGER_MIN, FIXED_DANGER);
    }
    safeUntilRef.current = performance.now() + 3000;
    runningRef.current = true;
    setGameOver(false);
    resetAim(lastLaunchXRef.current);
  }, [resetAim]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ctx = context;
    let raf = 0;
    let last = performance.now();
    const art: Partial<Record<Theme | 'lane', HTMLImageElement>> = {};
    const lane = new Image();
    lane.src = '/assets/lane-premium-v1.png';
    art.lane = lane;
    (Object.entries(PREMIUM_ASSETS) as Array<[Theme, string]>).forEach(([theme, src]) => {
      const image = new Image();
      image.src = src;
      art[theme] = image;
    });

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(bounds.width * dpr);
      canvas.height = Math.round(bounds.height * dpr);
      sizeRef.current = { w: bounds.width, h: bounds.height, dpr };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const geometry = () => {
      const { w, h } = sizeRef.current;
      return { cx: w / 2, farY: h * 0.195, nearY: h * 0.992, farHalf: w * 0.19, nearHalf: w * 0.495 };
    };
    const project = (x: number, y: number) => {
      const g = geometry();
      const t = clamp(y / WORLD_H, 0, 1);
      const half = g.farHalf + (g.nearHalf - g.farHalf) * t;
      return { x: g.cx + (x / (WORLD_W / 2)) * half, y: g.farY + (g.nearY - g.farY) * t, scale: 0.58 + 0.42 * t };
    };
    const drawCover = (image: HTMLImageElement, w: number, h: number) => {
      if (!image.complete || !image.naturalWidth) return false;
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const sw = w / scale;
      const sh = h / scale;
      ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
      return true;
    };

    const simulate = (speed: number) => {
      const active = settingsRef.current;
      const aim = aimRef.current;
      const points: Array<{ x: number; y: number }> = [];
      const r = radiusFor(queueRef.current[0]);
      let x = aim.x;
      let y = WORLD_H - 26;
      let vx = Math.sin(aim.angle) * speed;
      let vy = -Math.cos(aim.angle) * speed;
      let travel = 0;
      let bounces = 0;
      for (let i = 0; i < 420 && points.length < 210 && travel < active.aimLength; i += 1) {
        const dt = 0.65;
        vy -= active.slope * dt;
        const friction = Math.pow(active.drag, dt);
        vx *= friction;
        vy *= friction;
        const oldX = x;
        const oldY = y;
        x += vx * dt;
        y += vy * dt;
        travel += Math.hypot(x - oldX, y - oldY);
        if (x - r < -WORLD_W / 2) {
          x = -WORLD_W / 2 + r;
          vx = Math.abs(vx) * active.wallRest;
          bounces += 1;
          if (!active.bounces) break;
        } else if (x + r > WORLD_W / 2) {
          x = WORLD_W / 2 - r;
          vx = -Math.abs(vx) * active.wallRest;
          bounces += 1;
          if (!active.bounces) break;
        }
        if (y - r < 0) {
          y = r;
          vy = Math.abs(vy) * active.frontRest;
          bounces += 1;
          if (!active.bounces) break;
        }
        if (i % 2 === 0) points.push({ x, y });
        if (cupsRef.current.some((cup) => Math.hypot(cup.x - x, cup.y - y) < cup.r + r)) break;
        if (bounces > 10) break;
      }
      return points;
    };
    const recalcPrediction = (now: number) => {
      const active = settingsRef.current;
      if (active.aimLength <= 0) { predictionRef.current.paths = []; return; }
      if (now - predictionRef.current.lastCalc < 100) return;
      predictionRef.current.lastCalc = now;
      const low = Math.min(active.minPower, active.maxPower);
      const high = Math.max(active.minPower, active.maxPower);
      predictionRef.current.paths = active.power
        ? [simulate(low), simulate((low + high) / 2), simulate(high)]
        : [simulate(active.fixedSpeed)];
    };

    const drawPremiumCup = (cup: Cup, theme: Theme) => {
      const image = art[theme];
      const bounds = SPRITE_BOUNDS[theme]?.[cup.level];
      if (!image || !image.complete || !image.naturalWidth || !bounds) return false;
      const p = project(cup.x, cup.y);
      const cellWidth = image.naturalWidth / 7;
      const [bx0, by0, bx1, by1] = bounds;
      const sourceW = bx1 - bx0;
      const sourceH = by1 - by0;
      const visualWidth = cup.r * 2 * p.scale;
      const visualHeight = visualWidth * (sourceH / sourceW);
      ctx.drawImage(image, cup.level * cellWidth + bx0, by0, sourceW, sourceH,
        p.x - visualWidth / 2, p.y - visualHeight, visualWidth, visualHeight);
      if (settingsRef.current.levels) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#5d2d1ccc';
        ctx.lineWidth = 3;
        ctx.font = `900 ${Math.max(11, visualWidth * 0.3)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(String(cup.level + 1), p.x, p.y - visualHeight * 0.45);
        ctx.fillText(String(cup.level + 1), p.x, p.y - visualHeight * 0.45);
        ctx.restore();
      }
      return true;
    };

    const garnish = (level: number, x: number, y: number, w: number) => {
      ctx.save();
      if (level === 0) {
        ctx.fillStyle = '#ffe344'; ctx.strokeStyle = '#d1a20c';
        ctx.beginPath(); ctx.arc(x + w * 0.32, y, w * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (level === 1) {
        ctx.strokeStyle = '#fff6df'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + w * 0.18, y); ctx.lineTo(x + w * 0.36, y - w * 0.55); ctx.stroke();
      } else if (level === 2) {
        ctx.fillStyle = '#ff4866'; ctx.beginPath(); ctx.arc(x + w * 0.18, y, w * 0.1, 0, Math.PI * 2); ctx.fill();
      } else if (level === 4) {
        ctx.fillStyle = '#37a950'; ctx.beginPath(); ctx.ellipse(x, y - w * 0.08, w * 0.18, w * 0.07, -0.4, 0, Math.PI * 2); ctx.fill();
      } else if (level === 5) {
        ctx.fillStyle = '#f94b61'; ctx.strokeStyle = '#247744';
        ctx.beginPath(); ctx.moveTo(x + w * 0.05, y - w * 0.2); ctx.lineTo(x + w * 0.42, y); ctx.lineTo(x + w * 0.32, y - w * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (level === 6) {
        ctx.fillStyle = '#d52b3f'; ctx.beginPath(); ctx.arc(x, y - w * 0.18, w * 0.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    const drawSimpleCup = (cup: Cup, theme: Theme) => {
      const p = project(cup.x, cup.y);
      const level = LEVELS[cup.level];
      const kind = simpleKind(theme);
      const w = cup.r * 2 * p.scale;
      const h = w * (kind === 'wine' ? 1.8 : kind === 'sundae' ? 1.65 : 1.45);
      const top = p.y - h;
      ctx.save();
      ctx.fillStyle = '#4a2d1b2d'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 2, w * 0.48, w * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      if (kind === 'juice') {
        const body = new Path2D();
        body.moveTo(p.x - w * 0.48, top); body.lineTo(p.x - w * 0.33, p.y);
        body.quadraticCurveTo(p.x, p.y + 2, p.x + w * 0.33, p.y); body.lineTo(p.x + w * 0.48, top); body.closePath();
        ctx.fillStyle = level.color + 'df'; ctx.fill(body); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(body);
        ctx.beginPath(); ctx.ellipse(p.x, top, w * 0.48, w * 0.13, 0, 0, Math.PI * 2); ctx.stroke(); garnish(cup.level, p.x, top, w);
      } else if (kind === 'sundae') {
        ctx.strokeStyle = '#efffff'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(p.x - w * 0.46, top + h * 0.28); ctx.quadraticCurveTo(p.x - w * 0.35, top + h * 0.62, p.x, top + h * 0.68);
        ctx.quadraticCurveTo(p.x + w * 0.35, top + h * 0.62, p.x + w * 0.46, top + h * 0.28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x, top + h * 0.68); ctx.lineTo(p.x, p.y - w * 0.08); ctx.ellipse(p.x, p.y, w * 0.32, w * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = level.color; ctx.beginPath(); ctx.arc(p.x, top + h * 0.27, w * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.arc(p.x, top + h * 0.09, w * 0.18, 0, Math.PI * 2); ctx.fill(); garnish(cup.level, p.x, top, w);
      } else {
        const bowl = new Path2D(); bowl.moveTo(p.x - w * 0.47, top);
        bowl.bezierCurveTo(p.x - w * 0.38, top + h * 0.36, p.x - w * 0.2, top + h * 0.56, p.x, top + h * 0.6);
        bowl.bezierCurveTo(p.x + w * 0.2, top + h * 0.56, p.x + w * 0.38, top + h * 0.36, p.x + w * 0.47, top); bowl.closePath();
        ctx.fillStyle = level.color + 'dd'; ctx.fill(bowl); ctx.strokeStyle = '#efffff'; ctx.lineWidth = 2; ctx.stroke(bowl);
        ctx.beginPath(); ctx.moveTo(p.x, top + h * 0.6); ctx.lineTo(p.x, p.y - w * 0.08); ctx.ellipse(p.x, p.y, w * 0.34, w * 0.075, 0, 0, Math.PI * 2); ctx.stroke(); garnish(cup.level, p.x, top, w);
      }
      if (settingsRef.current.levels) {
        ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.max(11, w * 0.28)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(cup.level + 1), p.x, top + h * 0.48);
      }
      ctx.restore();
    };
    const drawCup = (cup: Cup) => {
      const theme = settingsRef.current.theme;
      if (!isPremium(theme) || !drawPremiumCup(cup, theme)) drawSimpleCup(cup, theme);
    };
    const retreatDanger = (amount: number) => {
      if (!settingsRef.current.dynamicDanger) return;
      dangerLineRef.current = clamp(dangerLineRef.current + amount, DYNAMIC_DANGER_MIN, FIXED_DANGER);
    };

    const loop = (now: number) => {
      const dt = Math.min(1.25, (now - last) / 16.67);
      last = now;
      const { w, h, dpr } = sizeRef.current;
      const active = settingsRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const drewArt = art.lane ? drawCover(art.lane, w, h) : false;
      if (!drewArt) {
        const fallback = ctx.createLinearGradient(0, 0, 0, h);
        fallback.addColorStop(0, '#9b6037'); fallback.addColorStop(0.22, '#efcf98'); fallback.addColorStop(1, '#f7e2b7');
        ctx.fillStyle = fallback; ctx.fillRect(0, 0, w, h);
      }
      const shade = ctx.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, '#3b1e0917'); shade.addColorStop(0.22, '#fff0'); shade.addColorStop(1, '#6e3d1010');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);

      if (runningRef.current) {
        for (const cup of cupsRef.current) {
          cup.ageMs += dt * 16.67;
          cup.mergeLockMs = Math.max(0, cup.mergeLockMs - dt * 16.67);
          cup.vy -= active.slope * dt;
          const friction = Math.pow(active.drag, dt);
          cup.vx *= friction; cup.vy *= friction; cup.x += cup.vx * dt; cup.y += cup.vy * dt;
          if (cup.x - cup.r < -WORLD_W / 2) { cup.x = -WORLD_W / 2 + cup.r; cup.vx = Math.abs(cup.vx) * active.wallRest; }
          else if (cup.x + cup.r > WORLD_W / 2) { cup.x = WORLD_W / 2 - cup.r; cup.vx = -Math.abs(cup.vx) * active.wallRest; }
          if (cup.y - cup.r < 0) { cup.y = cup.r; cup.vy = Math.abs(cup.vy) * active.frontRest; cup.vx *= 0.88; }
          if (cup.y + cup.r > WORLD_H) { cup.y = WORLD_H - cup.r; cup.vy = -Math.abs(cup.vy) * 0.08; }
          if (cup.y + cup.r < dangerLineRef.current - 3) cup.safeExited = true;
          const inDanger = cup.y + cup.r > dangerLineRef.current;
          if ((cup.safeExited || cup.ageMs > 900) && inDanger) cup.dangerMs += dt * 16.67;
          else cup.dangerMs = Math.max(0, cup.dangerMs - dt * 34);
        }
      }

      const remove = new Set<number>();
      const add: Cup[] = [];
      const cups = cupsRef.current;
      if (runningRef.current) {
        for (let i = 0; i < cups.length; i += 1) for (let k = i + 1; k < cups.length; k += 1) {
          const a = cups[i], b = cups[k];
          if (remove.has(a.id) || remove.has(b.id)) continue;
          const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.01, min = a.r + b.r;
          if (a.level === b.level && a.mergeLockMs <= 0 && b.mergeLockMs <= 0 && dist < min * MERGE_SENSOR) {
            remove.add(a.id); remove.add(b.id);
            const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
            const ma = a.r * a.r, mb = b.r * b.r, total = ma + mb;
            if (a.level === 6) {
              let cleared = 0;
              for (const other of cups) {
                if (remove.has(other.id)) continue;
                const ex = other.x - x, ey = other.y - y, distance = Math.hypot(ex, ey) || 1;
                if (distance >= active.blastRadius) continue;
                if (other.level <= 2) { remove.add(other.id); cleared += 1; }
                else if (other.level < 6) {
                  const force = (1 - distance / active.blastRadius) * active.blastForce;
                  other.vx += (ex / distance) * force; other.vy += (ey / distance) * force;
                }
              }
              burstsRef.current.push({ x, y, life: 1, color: '#ffd75c', maxR: active.blastRadius });
              award(5000 + cleared * 250); registerOrder(); retreatDanger(26); signal(true);
            } else {
              const nextLevel = a.level + 1;
              add.push({ id: idRef.current++, x, y, vx: (a.vx * ma + b.vx * mb) / total,
                vy: (a.vy * ma + b.vy * mb) / total, level: nextLevel, r: radiusFor(nextLevel),
                dangerMs: 0, ageMs: Math.max(a.ageMs, b.ageMs), safeExited: a.safeExited || b.safeExited, mergeLockMs: 90 });
              burstsRef.current.push({ x, y, life: 1, color: LEVELS[nextLevel].color, maxR: 52 });
              award((nextLevel + 1) * 120);
              unlockedRef.current = Math.max(unlockedRef.current, nextLevel); setUnlocked(unlockedRef.current);
              // Every merge earns a little breathing room; only the level-7 blast
              // creates a large reset, so ordinary chains cannot stall the danger line forever.
              retreatDanger(2); signal(false);
            }
            continue;
          }
          if (dist >= min) continue;
          const nx = dx / dist, ny = dy / dist, overlap = min - dist;
          const ma = a.r * a.r, mb = b.r * b.r, total = ma + mb;
          a.x -= nx * overlap * (mb / total); a.y -= ny * overlap * (mb / total);
          b.x += nx * overlap * (ma / total); b.y += ny * overlap * (ma / total);
          const normalVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (normalVelocity < 0) {
            const impulse = -(1 + active.cupRest) * normalVelocity / (1 / ma + 1 / mb);
            a.vx -= impulse * nx / ma; a.vy -= impulse * ny / ma; b.vx += impulse * nx / mb; b.vy += impulse * ny / mb;
          }
        }
      }
      if (remove.size) {
        cupsRef.current = cupsRef.current.filter((cup) => !remove.has(cup.id)).concat(add);
        predictionRef.current.lastCalc = 0;
      }

      const lineLeft = project(-WORLD_W / 2, dangerLineRef.current), lineRight = project(WORLD_W / 2, dangerLineRef.current);
      const pulse = 0.55 + Math.sin(now / 130) * 0.22;
      ctx.strokeStyle = now < safeUntilRef.current ? '#43bf7cca' : `rgba(221,67,50,${pulse})`;
      ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(lineLeft.x, lineLeft.y); ctx.lineTo(lineRight.x, lineRight.y); ctx.stroke(); ctx.setLineDash([]);

      recalcPrediction(now);
      if (runningRef.current && active.aimLength > 0) {
        const paths = predictionRef.current.paths;
        paths.forEach((path, index) => {
          const central = paths.length === 1 || index === 1;
          ctx.strokeStyle = central ? '#fffdf4e8' : '#f7a25b73'; ctx.lineWidth = central ? 2.4 : 5; ctx.setLineDash(central ? [8, 7] : [3, 9]); ctx.beginPath();
          path.forEach((point, pointIndex) => { const p = project(point.x, point.y); if (pointIndex) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
        });
        ctx.setLineDash([]);
      }
      [...cupsRef.current].sort((a, b) => a.y - b.y).forEach(drawCup);
      for (const burst of burstsRef.current) {
        burst.life -= 0.035 * dt; const p = project(burst.x, burst.y); const radius = (1 - burst.life) * burst.maxR * p.scale;
        ctx.globalAlpha = Math.max(0, burst.life); ctx.strokeStyle = burst.color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y - radius * 0.2, radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      burstsRef.current = burstsRef.current.filter((burst) => burst.life > 0);

      if (runningRef.current) {
        drawCup({ id: -1, x: aimRef.current.x, y: WORLD_H - 18, vx: 0, vy: 0,
          level: queueRef.current[0], r: radiusFor(queueRef.current[0]), dangerMs: 0,
          ageMs: 0, safeExited: false, mergeLockMs: 0 });
        if (active.angle) {
          const base = project(aimRef.current.x, WORLD_H - 18), length = 68;
          const hx = base.x + Math.sin(aimRef.current.angle) * length, hy = base.y - Math.cos(aimRef.current.angle) * length;
          ctx.fillStyle = aimRef.current.locked ? '#46c887' : '#fff'; ctx.strokeStyle = '#6f442d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      if (runningRef.current && performance.now() > safeUntilRef.current && cupsRef.current.some((cup) => cup.dangerMs >= active.gameOverMs)) {
        runningRef.current = false; setGameOver(true); signal(true);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [award, radiusFor, registerOrder, signal]);

  const worldXFromScreen = (screenX: number, width: number) => clamp(
    ((screenX - width / 2) / (width * 0.495)) * (WORLD_W / 2), -WORLD_W / 2 + 31, WORLD_W / 2 - 31);

  const powerFromGesture = (gesture: Gesture, releaseY: number) => {
    const active = settingsRef.current;
    const distance = Math.max(0, gesture.originY - releaseY);
    const samples = gesture.samples.filter((sample) => performance.now() - sample.t < 130);
    const first = samples[0], last = samples[samples.length - 1];
    const velocity = first && last && last.t > first.t ? (first.y - last.y) / ((last.t - first.t) / 1000) : 0;
    const distanceFactor = clamp((distance - active.throwThreshold) / (220 - active.throwThreshold), 0, 1);
    const velocityFactor = clamp((velocity - 350) / 1250, 0, 1);
    const strength = distanceFactor * 0.7 + velocityFactor * 0.3;
    const low = Math.min(active.minPower, active.maxPower), high = Math.max(active.minPower, active.maxPower);
    return low + strength * (high - low);
  };

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>, phase: 'down' | 'move' | 'up') => {
    event.preventDefault();
    if (settingsOpen || !runningRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const gesture = gestureRef.current, active = settingsRef.current, aim = aimRef.current, now = performance.now();
    const baseX = rect.width / 2 + (aim.x / (WORLD_W / 2)) * (rect.width * 0.495), baseY = rect.height * 0.972;
    const handleX = baseX + Math.sin(aim.angle) * 68, handleY = baseY - Math.cos(aim.angle) * 68;
    if (phase === 'down') {
      let mode: GestureMode = 'direct';
      if (active.angle) {
        const nearCup = Math.hypot(x - baseX, y - baseY) < 62;
        const nearHandle = Math.hypot(x - handleX, y - handleY) < 52;
        const lengthSquared = Math.max(1, (handleX - baseX) ** 2 + (handleY - baseY) ** 2);
        const t = clamp(((x - baseX) * (handleX - baseX) + (y - baseY) * (handleY - baseY)) / lengthSquared, 0, 1);
        const nearLine = Math.hypot(x - (baseX + (handleX - baseX) * t), y - (baseY + (handleY - baseY) * t)) < 26;
        if (nearCup) mode = 'position'; else if (nearHandle || nearLine || !aim.locked) mode = 'aim'; else mode = 'throw';
      }
      Object.assign(gesture, { active: true, mode, pointerId: event.pointerId, originX: x, originY: y,
        lastX: x, lastY: y, positionLocked: false, samples: [{ y, t: now }] });
      if (mode === 'position' || mode === 'direct') aim.x = worldXFromScreen(x, rect.width);
      if (mode === 'aim') { aim.locked = false; setAimLocked(false); }
      event.currentTarget.setPointerCapture(event.pointerId); predictionRef.current.lastCalc = 0; return;
    }
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    if (phase === 'move') {
      gesture.lastX = x; gesture.lastY = y; gesture.samples.push({ y, t: now });
      gesture.samples = gesture.samples.filter((sample) => now - sample.t < 160);
      const upward = gesture.originY - y;
      if (gesture.mode === 'position') aim.x = worldXFromScreen(x, rect.width);
      else if (gesture.mode === 'aim') {
        const updatedBaseX = rect.width / 2 + (aim.x / (WORLD_W / 2)) * (rect.width * 0.495);
        const max = active.maxAngle * Math.PI / 180;
        aim.angle = clamp(Math.atan2(x - updatedBaseX, Math.max(5, baseY - y)), -max, max);
      } else if (gesture.mode === 'direct') {
        if (upward < 18 && !gesture.positionLocked) aim.x = worldXFromScreen(x, rect.width); else gesture.positionLocked = true;
        setPowerPreview(clamp(upward / active.throwThreshold, 0, 1));
      } else {
        const strength = powerFromGesture(gesture, y), low = Math.min(active.minPower, active.maxPower), high = Math.max(active.minPower, active.maxPower);
        setPowerPreview(clamp((strength - low) / Math.max(0.1, high - low), 0, 1));
      }
      predictionRef.current.lastCalc = 0; return;
    }
    gesture.active = false;
    const forward = gesture.originY - y;
    if (gesture.mode === 'position') return;
    if (gesture.mode === 'aim') { aim.locked = true; setAimLocked(true); predictionRef.current.lastCalc = 0; return; }
    if (forward >= active.throwThreshold) fire(active.power ? powerFromGesture(gesture, y) : active.fixedSpeed);
    else setPowerPreview(0);
  };

  const toggleAimLock = () => {
    if (!settings.angle) return;
    aimRef.current.locked = !aimRef.current.locked;
    setAimLocked(aimRef.current.locked);
    predictionRef.current.lastCalc = 0;
  };
  const patchSettings = (patch: Partial<Settings>) => {
    if (patch.dynamicDanger !== undefined) {
      dangerLineRef.current = patch.dynamicDanger ? DYNAMIC_DANGER_START : FIXED_DANGER;
      cupsRef.current.forEach((cup) => { cup.dangerMs = 0; });
    }
    if (patch.angle !== undefined) resetAim(lastLaunchXRef.current);
    setSettings((current) => ({ ...current, ...patch }));
  };
  const preset = (kind: 'stable' | 'balanced' | 'extreme') => {
    if (kind === 'stable') patchSettings({ wallRest: 0.4, cupRest: 0.07, drag: 0.978, slope: 0.014, fixedSpeed: 7 });
    else if (kind === 'balanced') patchSettings({ wallRest: 0.72, cupRest: 0.12, drag: 0.984, slope: 0.011, fixedSpeed: 7.7 });
    else patchSettings({ wallRest: 0.96, cupRest: 0.3, drag: 0.993, slope: 0.006, fixedSpeed: 9.4, minPower: 6.8, maxPower: 14.5 });
  };

  return <main className="app-shell"><section className="game-card" aria-label="果汁杯融合遊戲">
    <header className="hud">
      <div className="score-main hud-tile"><small>分數</small><strong>{score.toLocaleString()}</strong><em>最高 {best.toLocaleString()}・零復活 {bestClean.toLocaleString()}</em></div>
      <div className="orders hud-tile"><small>訂單</small><b>{orders}</b><em>累積 {lifetimeOrders}</em></div>
      <div className="queue hud-tile"><CupPreview label="下一杯" level={queue[0]} theme={settings.theme}/><i>›</i><CupPreview label="再下一杯" level={queue[1]} theme={settings.theme}/></div>
      <div className="shots hud-tile"><small>已投</small><b>{shots}</b></div>
      <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="開啟設定">⚙</button>
    </header>
    <div className="playfield">
      <canvas ref={canvasRef} onPointerDown={(e) => pointer(e, 'down')} onPointerMove={(e) => pointer(e, 'move')} onPointerUp={(e) => pointer(e, 'up')} onPointerCancel={(e) => pointer(e, 'up')} aria-label="定位、瞄準並投擲杯子"/>
      <div className="field-badges">
        {historyCount > 0 && <button onClick={undo} aria-label={`復原上一步，尚有 ${historyCount} 次`}>↶ <small>{historyCount}</small></button>}
        {revives > 0 && <span>復活 {revives}</span>}
        {settings.dynamicDanger && <span className="danger-mode">動態線</span>}
      </div>
      {settings.angle && <button className={`aim-state ${aimLocked ? 'locked' : ''}`} onClick={toggleAimLock}>{aimLocked ? '角度已鎖定・點此解鎖' : '拖曳杯子或瞄準線・點此鎖定'}</button>}
      {powerPreview > 0 && <div className="power-meter"><i style={{ height: `${Math.max(8, powerPreview * 100)}%` }}/><span>{settings.power ? '力度' : '有效'}</span></div>}
      {gameOver && <div className="game-over"><small>杯子越過危險線</small><h2>{score.toLocaleString()}</h2><p>本局訂單 {orders}・復活 {revives} 次</p><div>
        {historyCount > 0 && <button className="undo-action" onClick={undo}>復原</button>}<button onClick={revive}>復活</button><button className="secondary" onClick={() => reset()}>重來</button>
      </div></div>}
    </div>
    <section className="merge-strip"><div className="strip-label"><b>融合</b><small>{unlocked + 1}/7</small></div>
      {LEVELS.map((level, index) => <div className={`mini-level ${index <= unlocked ? '' : 'future'}`} key={level.name} title={level.name}><CupIcon level={index} theme={settings.theme}/>{index < 6 && <i>›</i>}</div>)}
      <div className="blast-mark" title="最高級爆炸">💥</div>
    </section>
    {settingsOpen && <SettingsSheet settings={settings} close={() => setSettingsOpen(false)} patch={patchSettings} preset={preset}/>}
  </section></main>;
}

function CupIcon({ level, theme }: { level: number; theme: Theme }) {
  const asset = PREMIUM_ASSETS[theme];
  if (asset) return <span className="sprite-icon" style={{ backgroundImage: `url(${asset})`, backgroundSize: '700% 100%', backgroundPosition: `${level / 6 * 100}% center` }}/>;
  const info = LEVELS[level];
  return <span className="simple-icon" style={{ '--juice': info.color, '--dark': info.dark } as React.CSSProperties}>{themeEmoji(theme)}</span>;
}

function CupPreview({ label, level, theme }: { label: string; level: number; theme: Theme }) {
  return <div className="cup-preview"><small>{label}</small><CupIcon level={level} theme={theme}/></div>;
}

function Toggle({ title, note, value, onChange }: { title: string; note: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><b>{title}</b><small>{note}</small></span><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}/><i/></label>;
}

function Slider({ title, value, min, max, step = 1, unit = '', onChange }: { title: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="slider-row"><span><b>{title}</b><output>{Number.isInteger(value) ? value : value.toFixed(2)}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}/></label>;
}

function ThemeButton({ value, current, title, patch }: { value: Theme; current: Theme; title: string; patch: (patch: Partial<Settings>) => void }) {
  return <button className={current === value ? 'active' : ''} onClick={() => patch({ theme: value })}><CupIcon level={value.startsWith('premium') ? 6 : 2} theme={value}/><span>{title}</span></button>;
}

function SettingsSheet({ settings, close, patch, preset }: { settings: Settings; close: () => void; patch: (patch: Partial<Settings>) => void; preset: (kind: 'stable' | 'balanced' | 'extreme') => void }) {
  return <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="settings-sheet" role="dialog" aria-modal="true" aria-label="遊戲設定">
    <header><div><small>遊戲設定</small><h2>玩法與外觀</h2></div><button onClick={close} aria-label="關閉設定">×</button></header>
    <div className="sheet-scroll">
      <div className="theme-picker">
        <ThemeButton value="premiumJuice" current={settings.theme} title="精緻果汁" patch={patch}/><ThemeButton value="premiumSundae" current={settings.theme} title="精緻聖代" patch={patch}/><ThemeButton value="premiumWine" current={settings.theme} title="精緻酒杯" patch={patch}/>
        <ThemeButton value="simpleJuice" current={settings.theme} title="果汁陽春" patch={patch}/><ThemeButton value="simpleSundae" current={settings.theme} title="聖代陽春" patch={patch}/><ThemeButton value="simpleWine" current={settings.theme} title="酒杯陽春" patch={patch}/>
      </div>
      <div className="setting-group">
        <Toggle title="動態危險線" note="未融合會推進，融合與訂單會退回" value={settings.dynamicDanger} onChange={(v) => patch({ dynamicDanger: v })}/>
        <Toggle title="角度瞄準" note="杯子調位置、瞄準線調角度、二次滑動投擲" value={settings.angle} onChange={(v) => patch({ angle: v })}/>
        <Toggle title="力度控制" note="距離 70%＋平均速度 30%" value={settings.power} onChange={(v) => patch({ power: v })}/>
        <Toggle title="顯示杯子等級" note="在杯身顯示 1～7" value={settings.levels} onChange={(v) => patch({ levels: v })}/>
        <Toggle title="顯示反彈路徑" note="使用斜坡物理預測軌跡" value={settings.bounces} onChange={(v) => patch({ bounces: v })}/>
        <Toggle title="音效" note="融合、爆炸與投擲音效" value={settings.sound} onChange={(v) => patch({ sound: v })}/>
        <Toggle title="震動" note="預設關閉，可隨時開啟" value={settings.vibration} onChange={(v) => patch({ vibration: v })}/>
        <Slider title="瞄準線長度" value={settings.aimLength} min={0} max={3000} step={100} onChange={(v) => patch({ aimLength: v })}/>
        <Slider title="最小力度" value={settings.minPower} min={4.5} max={12} step={0.1} onChange={(v) => patch({ minPower: Math.min(v, settings.maxPower - 0.1) })}/>
        <Slider title="最大力度" value={settings.maxPower} min={6} max={15} step={0.1} onChange={(v) => patch({ maxPower: Math.max(v, settings.minPower + 0.1) })}/>
        <Slider title="投擲有效距離" value={settings.throwThreshold} min={30} max={100} step={5} unit="px" onChange={(v) => patch({ throwThreshold: v })}/>
      </div>
      <details className="developer"><summary>開發者專區 <span>調整遊戲手感</span></summary><div className="presets"><button onClick={() => preset('stable')}>穩定堆積</button><button onClick={() => preset('balanced')}>平衡玩法</button><button onClick={() => preset('extreme')}>極限高彈</button><button onClick={() => patch(DEFAULTS)}>恢復新版預設</button></div>
        <Slider title="最大角度" value={settings.maxAngle} min={30} max={85} unit="°" onChange={(v) => patch({ maxAngle: v })}/><Slider title="固定力量" value={settings.fixedSpeed} min={5.5} max={12} step={0.1} onChange={(v) => patch({ fixedSpeed: v })}/><Slider title="左右牆反彈" value={settings.wallRest} min={0.1} max={0.98} step={0.01} onChange={(v) => patch({ wallRest: v })}/><Slider title="前方牆反彈" value={settings.frontRest} min={0} max={0.5} step={0.01} onChange={(v) => patch({ frontRest: v })}/><Slider title="杯子互撞反彈" value={settings.cupRest} min={0} max={0.5} step={0.01} onChange={(v) => patch({ cupRest: v })}/><Slider title="速度衰減" value={settings.drag} min={0.96} max={0.995} step={0.001} onChange={(v) => patch({ drag: v })}/><Slider title="斜坡重力" value={settings.slope} min={0} max={0.03} step={0.001} onChange={(v) => patch({ slope: v })}/><Slider title="杯子尺寸" value={settings.size} min={0.8} max={1.25} step={0.01} onChange={(v) => patch({ size: v })}/><Slider title="結束等待" value={settings.gameOverMs} min={300} max={2500} step={100} unit="ms" onChange={(v) => patch({ gameOverMs: v })}/><Slider title="爆炸範圍" value={settings.blastRadius} min={80} max={210} step={5} onChange={(v) => patch({ blastRadius: v })}/><Slider title="爆炸推力" value={settings.blastForce} min={1} max={8} step={0.2} onChange={(v) => patch({ blastForce: v })}/>
      </details>
    </div><button className="done-button" onClick={close}>完成</button>
  </section></div>;
}
