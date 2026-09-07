'use client';

/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect -- the real-time physics bridge intentionally synchronizes mutable Rapier state through refs. */

import { Component, ErrorInfo, lazy, ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CupIcon } from './game/CupIcon';
import type { BodyMap, ContactMap } from './game/GameScene';
import {
  AimState,
  BurstState,
  CupState,
  DEFAULTS,
  DYNAMIC_DANGER_MIN_Z,
  DYNAMIC_DANGER_START_Z,
  FIXED_DANGER_Z,
  GameSnapshot,
  GraphicsQuality,
  LEGACY_TO_WORLD,
  LEVELS,
  SPAWN_Z,
  STORAGE_KEY,
  Settings,
  Theme,
  clamp,
  cloneCup,
  cupHeight,
  cupRadius,
  laneSurfaceY,
  levelName,
  maxLaunchX,
  speedToWorld,
} from './game/config';
import { normalizeSettings, powerFromGesture, selectControlledLevel } from './game/core';

const GameScene = lazy(() => import('./game/GameScene').then((module) => ({ default: module.GameScene })));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('V5 3D scene failed to initialize', error, info.componentStack);
  }
  render() {
    if (this.state.failed) return <div className="scene-error"><b>3D 場景暫時無法載入</b><small>請確認網路後重新整理，最高分與累積訂單不會受影響。</small><button onClick={() => location.reload()}>重新載入</button></div>;
    return this.props.children;
  }
}

type GestureMode = 'direct' | 'position-or-throw' | 'position' | 'aim' | 'throw';
type Gesture = {
  active: boolean;
  pointerId: number;
  mode: GestureMode;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  positionLocked: boolean;
  samples: Array<{ y: number; t: number }>;
};

const EMPTY_GESTURE: Gesture = {
  active: false,
  pointerId: -1,
  mode: 'direct',
  originX: 0,
  originY: 0,
  lastX: 0,
  lastY: 0,
  positionLocked: false,
  samples: [],
};

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing; the current run remains playable.
  }
}

function recall(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storedCount(key: string) {
  const parsed = Number(recall(key));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function freshCup(id: number, level: number, x: number, angle: number, power: number, settings: Settings): CupState {
  const velocity = speedToWorld(power);
  return {
    id,
    level,
    position: [x, laneSurfaceY(SPAWN_Z, settings.slope) + 0.03, SPAWN_Z],
    velocity: [Math.sin(angle) * velocity, 0, -Math.cos(angle) * velocity],
    rotation: [0, 0, 0, 1],
    angularVelocity: [0, (Math.sin(angle) * velocity) * 0.08, 0],
    ageMs: 0,
    dangerMs: 0,
    safeExited: false,
    mergeLockMs: 0,
    sleepMs: 0,
  };
}

export default function Home() {
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bodyMapRef = useRef<BodyMap>(new Map());
  const contactsRef = useRef<ContactMap>(new Map());
  const cupsRef = useRef<CupState[]>([]);
  const historyRef = useRef<GameSnapshot[]>([]);
  const settingsRef = useRef<Settings>(DEFAULTS);
  const aimRef = useRef<AimState>({ x: 0, angle: 0, locked: false });
  const gestureRef = useRef<Gesture>({ ...EMPTY_GESTURE });
  const runningRef = useRef(true);
  const pausedRef = useRef(false);
  const manualPauseRef = useRef(false);
  const lastShotRef = useRef(0);
  const safeUntilRef = useRef(0);
  const idRef = useRef(1);
  const burstIdRef = useRef(1);
  const scoreRef = useRef(0);
  const shotsRef = useRef(0);
  const ordersRef = useRef(0);
  const unlockedRef = useRef(0);
  const revivesRef = useRef(0);
  const lifetimeOrdersRef = useRef(0);
  const maxOrdersThisRunRef = useRef(0);
  const queueRef = useRef<number[]>([0, 0]);
  const bagRef = useRef<number[]>([]);
  const luckyCooldownRef = useRef(0);
  const dangerLineRef = useRef(DYNAMIC_DANGER_START_Z);
  const lastLaunchXRef = useRef(0);
  const mergeGuardRef = useRef(new Set<number>());
  const hydratedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  const [mounted, setMounted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cups, setCupsState] = useState<CupState[]>([]);
  const [aim, setAimState] = useState<AimState>({ x: 0, angle: 0, locked: false });
  const [bursts, setBursts] = useState<BurstState[]>([]);
  const [dangerLine, setDangerLineState] = useState(DYNAMIC_DANGER_START_Z);
  const [queue, setQueue] = useState<number[]>([0, 0]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [bestClean, setBestClean] = useState(0);
  const [shots, setShots] = useState(0);
  const [orders, setOrders] = useState(0);
  const [lifetimeOrders, setLifetimeOrders] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [revives, setRevives] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [restoreEpoch, setRestoreEpoch] = useState(0);
  const [powerPreview, setPowerPreview] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  const commitCups = useCallback((recipe: CupState[] | ((current: CupState[]) => CupState[])) => {
    setCupsState((current) => {
      const next = typeof recipe === 'function' ? recipe(current) : recipe;
      cupsRef.current = next;
      return next;
    });
  }, []);

  const commitAim = useCallback((next: AimState | ((current: AimState) => AimState)) => {
    setAimState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      aimRef.current = value;
      return value;
    });
  }, []);

  const commitDanger = useCallback((value: number) => {
    dangerLineRef.current = value;
    setDangerLineState(value);
  }, []);

  const drawBag = useCallback(() => {
    if (!bagRef.current.length) {
      const bag = [0, 0, 0, 0, 0, 0, 1, 1];
      for (let index = bag.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [bag[index], bag[swap]] = [bag[swap], bag[index]];
      }
      bagRef.current = bag;
    }
    const baseLevel = bagRef.current.shift() ?? 0;
    const selected = selectControlledLevel(baseLevel, unlockedRef.current, shotsRef.current, ordersRef.current,
      luckyCooldownRef.current, Math.random());
    luckyCooldownRef.current = selected.luckyCooldown;
    return selected.level;
  }, []);

  const syncBodies = useCallback(() => {
    for (const cup of cupsRef.current) {
      const body = bodyMapRef.current.get(cup.id);
      if (!body) continue;
      const position = body.translation();
      const velocity = body.linvel();
      const rotation = body.rotation();
      const angular = body.angvel();
      cup.position = [position.x, position.y, position.z];
      cup.velocity = [velocity.x, velocity.y, velocity.z];
      cup.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
      cup.angularVelocity = [angular.x, angular.y, angular.z];
    }
  }, []);

  const pushHistory = useCallback(() => {
    syncBodies();
    historyRef.current.push({
      cups: cupsRef.current.map(cloneCup),
      score: scoreRef.current,
      shots: shotsRef.current,
      orders: ordersRef.current,
      queue: [...queueRef.current],
      bag: [...bagRef.current],
      unlocked: unlockedRef.current,
      dangerLine: dangerLineRef.current,
      launchX: aimRef.current.x,
      revives: revivesRef.current,
      luckyCooldown: luckyCooldownRef.current,
    });
    setHistoryCount(historyRef.current.length);
  }, [syncBodies]);

  const resetAim = useCallback((x = lastLaunchXRef.current) => {
    const level = queueRef.current[0] ?? 0;
    const maximum = maxLaunchX(level, settingsRef.current);
    commitAim({ x: clamp(x, -maximum, maximum), angle: 0, locked: false });
    setPowerPreview(0);
  }, [commitAim]);

  const reset = useCallback((activeSettings?: Settings) => {
    const active = activeSettings ?? settingsRef.current;
    bodyMapRef.current.clear();
    contactsRef.current.clear();
    mergeGuardRef.current.clear();
    historyRef.current = [];
    bagRef.current = [];
    luckyCooldownRef.current = 0;
    scoreRef.current = 0;
    shotsRef.current = 0;
    ordersRef.current = 0;
    unlockedRef.current = 0;
    revivesRef.current = 0;
    maxOrdersThisRunRef.current = 0;
    lastLaunchXRef.current = 0;
    runningRef.current = true;
    pausedRef.current = false;
    manualPauseRef.current = false;
    safeUntilRef.current = performance.now() + 700;
    const nextQueue = [drawBag(), drawBag()];
    queueRef.current = nextQueue;
    const nextDanger = active.dynamicDanger ? DYNAMIC_DANGER_START_Z : FIXED_DANGER_Z;
    commitCups([]);
    commitDanger(nextDanger);
    commitAim({ x: 0, angle: 0, locked: false });
    setQueue(nextQueue);
    setScore(0);
    setShots(0);
    setOrders(0);
    setUnlocked(0);
    setRevives(0);
    setHistoryCount(0);
    setBursts([]);
    setGameOver(false);
    setPaused(false);
    setPowerPreview(0);
    setRestoreEpoch((value) => value + 1);
  }, [commitAim, commitCups, commitDanger, drawBag]);

  useEffect(() => {
    setMounted(true);
    let loaded: Settings = DEFAULTS;
    try {
      const raw = recall(STORAGE_KEY) ?? recall('juice-v43-settings');
      loaded = normalizeSettings(raw ? JSON.parse(raw) as Partial<Settings> : null);
    } catch {
      loaded = DEFAULTS;
    }
    settingsRef.current = loaded;
    setSettings(loaded);
    setBest(storedCount('juice-best'));
    setBestClean(storedCount('juice-best-clean'));
    const storedOrders = storedCount('juice-orders');
    lifetimeOrdersRef.current = storedOrders;
    setLifetimeOrders(storedOrders);
    hydratedRef.current = true;
    reset(loaded);
  }, [reset]);

  useEffect(() => {
    settingsRef.current = settings;
    if (hydratedRef.current) persist(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (!document.hidden || !runningRef.current) return;
      manualPauseRef.current = true;
      pausedRef.current = true;
      setPaused(true);
      setPowerPreview(0);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      const audio = audioRef.current;
      audioRef.current = null;
      if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined);
    };
  }, []);

  const signal = useCallback((strong = false) => {
    const active = settingsRef.current;
    if (active.vibration && navigator.vibrate) navigator.vibrate(strong ? [26, 22, 40] : 16);
    if (!active.sound) return;
    try {
      const AudioCtor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let audio = audioRef.current;
      if (!audio || audio.state === 'closed') {
        audio = new AudioCtor();
        audioRef.current = audio;
      }
      if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = strong ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(strong ? 190 : 470, audio.currentTime);
      gain.gain.setValueAtTime(0.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        gain.disconnect();
      }, { once: true });
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.18);
    } catch {
      // Sound is optional and may be blocked until the first user gesture.
    }
  }, []);

  const award = useCallback((points: number) => {
    const next = scoreRef.current + points;
    scoreRef.current = next;
    setScore(next);
    setBest((current) => {
      const value = Math.max(current, next);
      persist('juice-best', String(value));
      return value;
    });
    if (revivesRef.current === 0) {
      setBestClean((current) => {
        const value = Math.max(current, next);
        persist('juice-best-clean', String(value));
        return value;
      });
    }
  }, []);

  const registerOrder = useCallback(() => {
    const next = ordersRef.current + 1;
    ordersRef.current = next;
    setOrders(next);
    if (next <= maxOrdersThisRunRef.current) return;
    maxOrdersThisRunRef.current = next;
    const lifetime = lifetimeOrdersRef.current + 1;
    lifetimeOrdersRef.current = lifetime;
    setLifetimeOrders(lifetime);
    persist('juice-orders', String(lifetime));
  }, []);

  const addBurst = useCallback((burst: Omit<BurstState, 'id' | 'createdAt'>) => {
    const id = burstIdRef.current++;
    setBursts((current) => [...current, { ...burst, id, createdAt: performance.now() }].slice(-10));
    window.setTimeout(() => setBursts((current) => current.filter((item) => item.id !== id)), 1000);
  }, []);

  const handleCupCollision = useCallback((firstId: number, secondId: number) => {
    if (!runningRef.current || pausedRef.current || firstId === secondId) return;
    const first = cupsRef.current.find((cup) => cup.id === firstId);
    const second = cupsRef.current.find((cup) => cup.id === secondId);
    if (!first || !second || first.level !== second.level || first.mergeLockMs > 0 || second.mergeLockMs > 0) return;
    if (mergeGuardRef.current.has(firstId) || mergeGuardRef.current.has(secondId)) return;
    const active = settingsRef.current;
    mergeGuardRef.current.add(firstId);
    mergeGuardRef.current.add(secondId);
    window.setTimeout(() => {
      mergeGuardRef.current.delete(firstId);
      mergeGuardRef.current.delete(secondId);
    }, Math.max(600, active.mergeSettleMs + 250));
    syncBodies();
    const massA = Math.pow(cupRadius(first.level, active), 3);
    const massB = Math.pow(cupRadius(second.level, active), 3);
    const totalMass = massA + massB;
    const x = (first.position[0] * massA + second.position[0] * massB) / totalMass;
    const z = (first.position[2] * massA + second.position[2] * massB) / totalMass;
    const y = Math.max(laneSurfaceY(z, active.slope) + 0.03,
      (first.position[1] * massA + second.position[1] * massB) / totalMass);
    const velocity: [number, number, number] = [
      (first.velocity[0] * massA + second.velocity[0] * massB) / totalMass,
      Math.max(0, (first.velocity[1] + second.velocity[1]) * 0.22),
      (first.velocity[2] * massA + second.velocity[2] * massB) / totalMass,
    ];

    if (first.level === LEVELS.length - 1) {
      const blastWorld = active.blastRadius * LEGACY_TO_WORLD;
      const removed = new Set([firstId, secondId]);
      let cleared = 0;
      for (const other of cupsRef.current) {
        if (removed.has(other.id)) continue;
        const dx = other.position[0] - x;
        const dz = other.position[2] - z;
        const distance = Math.hypot(dx, dz) || 0.001;
        if (distance >= blastWorld) continue;
        if (other.level <= 2) {
          removed.add(other.id);
          cleared += 1;
          continue;
        }
        const body = bodyMapRef.current.get(other.id);
        const force = (1 - distance / blastWorld) * active.blastForce;
        body?.applyImpulse({ x: dx / distance * force, y: Math.min(0.7, force * 0.08), z: dz / distance * force }, true);
      }
      commitCups((current) => current.filter((cup) => !removed.has(cup.id)));
      award(5000 + cleared * 250);
      registerOrder();
      if (active.dynamicDanger) commitDanger(clamp(dangerLineRef.current + 26 * LEGACY_TO_WORLD, DYNAMIC_DANGER_MIN_Z, FIXED_DANGER_Z));
      addBurst({ x, z, color: '#ffd65a', radius: Math.max(1.2, blastWorld), kind: 'blast' });
      signal(true);
      return;
    }

    const nextLevel = first.level + 1;
    const merged: CupState = {
      id: idRef.current++,
      level: nextLevel,
      position: [x, y, z],
      velocity,
      rotation: [0, 0, 0, 1],
      angularVelocity: [0, (first.angularVelocity[1] + second.angularVelocity[1]) * 0.35, 0],
      ageMs: Math.max(first.ageMs, second.ageMs),
      dangerMs: 0,
      safeExited: first.safeExited || second.safeExited,
      mergeLockMs: active.mergeSettleMs,
      sleepMs: 0,
    };
    commitCups((current) => current.filter((cup) => cup.id !== firstId && cup.id !== secondId).concat(merged));
    award((nextLevel + 1) * 120);
    unlockedRef.current = Math.max(unlockedRef.current, nextLevel);
    setUnlocked(unlockedRef.current);
    if (active.dynamicDanger) commitDanger(clamp(dangerLineRef.current + 2 * LEGACY_TO_WORLD, DYNAMIC_DANGER_MIN_Z, FIXED_DANGER_Z));
    addBurst({ x, z, color: LEVELS[nextLevel].color, radius: 0.8 + nextLevel * 0.1, kind: 'merge' });
    signal(false);
  }, [addBurst, award, commitCups, commitDanger, registerOrder, signal, syncBodies]);

  const fire = useCallback((requestedPower: number) => {
    const now = performance.now();
    if (!runningRef.current || pausedRef.current || now - lastShotRef.current < 50) return;
    lastShotRef.current = now;
    pushHistory();
    const active = settingsRef.current;
    const currentAim = aimRef.current;
    const level = queueRef.current[0] ?? 0;
    const low = Math.min(active.minPower, active.maxPower);
    const high = Math.max(active.minPower, active.maxPower);
    const power = active.power ? clamp(requestedPower, low, high) : active.fixedSpeed;
    commitCups((current) => [...current, freshCup(idRef.current++, level, currentAim.x, active.angle ? currentAim.angle : 0, power, active)]);
    if (active.dynamicDanger) commitDanger(clamp(dangerLineRef.current - 9 * LEGACY_TO_WORLD, DYNAMIC_DANGER_MIN_Z, FIXED_DANGER_Z));
    shotsRef.current += 1;
    setShots(shotsRef.current);
    const nextQueue = [queueRef.current[1] ?? 0, drawBag()];
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    lastLaunchXRef.current = currentAim.x;
    const maximum = maxLaunchX(nextQueue[0], active);
    commitAim({ x: clamp(currentAim.x, -maximum, maximum), angle: 0, locked: false });
    setPowerPreview(0);
    signal(false);
  }, [commitAim, commitCups, commitDanger, drawBag, pushHistory, signal]);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    bodyMapRef.current.clear();
    contactsRef.current.clear();
    mergeGuardRef.current.clear();
    scoreRef.current = snapshot.score;
    shotsRef.current = snapshot.shots;
    ordersRef.current = snapshot.orders;
    queueRef.current = [...snapshot.queue];
    bagRef.current = [...snapshot.bag];
    unlockedRef.current = snapshot.unlocked;
    revivesRef.current = snapshot.revives;
    luckyCooldownRef.current = snapshot.luckyCooldown;
    lastLaunchXRef.current = snapshot.launchX;
    runningRef.current = true;
    pausedRef.current = false;
    manualPauseRef.current = false;
    safeUntilRef.current = performance.now() + 1000;
    commitCups(snapshot.cups.map(cloneCup));
    commitDanger(snapshot.dangerLine);
    commitAim({ x: snapshot.launchX, angle: 0, locked: false });
    setScore(snapshot.score);
    setShots(snapshot.shots);
    setOrders(snapshot.orders);
    setQueue([...snapshot.queue]);
    setUnlocked(snapshot.unlocked);
    setRevives(snapshot.revives);
    setHistoryCount(historyRef.current.length);
    setGameOver(false);
    setPaused(false);
    setPowerPreview(0);
    setRestoreEpoch((value) => value + 1);
  }, [commitAim, commitCups, commitDanger]);

  const revive = useCallback(() => {
    syncBodies();
    const remove = new Set([...cupsRef.current].sort((a, b) => b.position[2] - a.position[2]).slice(0, 3).map((cup) => cup.id));
    const active = settingsRef.current;
    const shifted = cupsRef.current.filter((cup) => !remove.has(cup.id)).map((cup) => {
      const next = cloneCup(cup);
      next.position[2] = Math.max(-8.7, next.position[2] - 1.25);
      next.position[1] = laneSurfaceY(next.position[2], active.slope) + 0.05;
      next.velocity = [next.velocity[0] * 0.25, 0, Math.min(-0.35, next.velocity[2] * 0.2)];
      next.dangerMs = 0;
      next.safeExited = true;
      next.sleepMs = 0;
      return next;
    });
    revivesRef.current += 1;
    runningRef.current = true;
    pausedRef.current = false;
    manualPauseRef.current = false;
    safeUntilRef.current = performance.now() + 3000;
    commitCups(shifted);
    if (active.dynamicDanger) commitDanger(clamp(dangerLineRef.current + 40 * LEGACY_TO_WORLD, DYNAMIC_DANGER_MIN_Z, FIXED_DANGER_Z));
    setRevives(revivesRef.current);
    setGameOver(false);
    setPaused(false);
    resetAim(lastLaunchXRef.current);
    setRestoreEpoch((value) => value + 1);
  }, [commitCups, commitDanger, resetAim, syncBodies]);

  const handleGameOver = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setGameOver(true);
    setPowerPreview(0);
    signal(true);
  }, [signal]);

  const handleRecycle = useCallback((id: number) => {
    commitCups((current) => current.filter((cup) => cup.id !== id));
  }, [commitCups]);

  const projectToScreen = useCallback((point: THREE.Vector3, rect: DOMRect) => {
    const camera = cameraRef.current;
    if (!camera) return { x: rect.width / 2, y: rect.height / 2 };
    const projected = point.clone().project(camera);
    return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2 };
  }, []);

  const handleCamera = useCallback((camera: THREE.PerspectiveCamera | null) => {
    cameraRef.current = camera;
  }, []);

  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);

  const screenToLaunchX = useCallback((screenX: number, rect: DOMRect) => {
    const active = settingsRef.current;
    const level = queueRef.current[0] ?? 0;
    const maximum = maxLaunchX(level, active);
    const y = laneSurfaceY(SPAWN_Z, active.slope) + cupHeight(level, active) * 0.45;
    const left = projectToScreen(new THREE.Vector3(-maximum, y, SPAWN_Z), rect).x;
    const right = projectToScreen(new THREE.Vector3(maximum, y, SPAWN_Z), rect).x;
    const ratio = clamp((screenX - left) / Math.max(1, right - left), 0, 1);
    return -maximum + ratio * maximum * 2;
  }, [projectToScreen]);

  const pointer = useCallback((event: React.PointerEvent<HTMLDivElement>, phase: 'down' | 'move' | 'up' | 'cancel') => {
    const target = event.target as HTMLElement;
    if (target.closest('button') || settingsOpen || !runningRef.current || pausedRef.current || !sceneReady) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const active = settingsRef.current;
    const currentAim = aimRef.current;
    const level = queueRef.current[0] ?? 0;
    const gesture = gestureRef.current;
    const now = performance.now();
    const baseWorldY = laneSurfaceY(SPAWN_Z, active.slope);
    const cupPoint = projectToScreen(new THREE.Vector3(currentAim.x, baseWorldY + cupHeight(level, active) * 0.48, SPAWN_Z), rect);
    const lineBase = projectToScreen(new THREE.Vector3(currentAim.x, baseWorldY + 0.12, SPAWN_Z), rect);
    const handleDistance = 1.65;
    const handleZ = SPAWN_Z - Math.cos(currentAim.angle) * handleDistance;
    const handlePoint = projectToScreen(new THREE.Vector3(currentAim.x + Math.sin(currentAim.angle) * handleDistance,
      laneSurfaceY(handleZ, active.slope) + 0.12, handleZ), rect);

    if (phase === 'down') {
      let mode: GestureMode = 'direct';
      if (active.angle) {
        const nearCup = Math.hypot(x - cupPoint.x, y - cupPoint.y) < 70;
        const vx = handlePoint.x - lineBase.x;
        const vy = handlePoint.y - lineBase.y;
        const lengthSquared = Math.max(1, vx * vx + vy * vy);
        const t = clamp(((x - lineBase.x) * vx + (y - lineBase.y) * vy) / lengthSquared, 0, 1);
        const nearLine = Math.hypot(x - (lineBase.x + vx * t), y - (lineBase.y + vy * t)) < 29;
        const nearHandle = Math.hypot(x - handlePoint.x, y - handlePoint.y) < 48;
        if (nearCup) mode = 'position-or-throw';
        else if (nearLine || nearHandle || !currentAim.locked) mode = 'aim';
        else mode = 'throw';
      }
      gestureRef.current = { active: true, pointerId: event.pointerId, mode, originX: x, originY: y,
        lastX: x, lastY: y,
        positionLocked: mode === 'direct' && active.straightStabilizer && active.straightLockDistance <= 0,
        samples: [{ y, t: now }] };
      if (mode === 'direct') commitAim({ x: screenToLaunchX(x, rect), angle: 0, locked: false });
      if (mode === 'aim') commitAim({ ...currentAim, locked: false });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    if (phase === 'cancel') {
      gestureRef.current = { ...EMPTY_GESTURE };
      setPowerPreview(0);
      return;
    }
    if (phase === 'move') {
      gesture.lastX = x;
      gesture.lastY = y;
      gesture.samples.push({ y, t: now });
      gesture.samples = gesture.samples.filter((sample) => now - sample.t < 160);
      const upward = gesture.originY - y;
      const horizontal = x - gesture.originX;
      if (gesture.mode === 'position-or-throw') {
        if (currentAim.locked && upward > 12 && upward > Math.abs(horizontal) * 1.12) gesture.mode = 'throw';
        else if (Math.abs(horizontal) > 4) gesture.mode = 'position';
      }
      if (gesture.mode === 'position') {
        commitAim((previous) => ({ ...previous, x: screenToLaunchX(x, rect) }));
      } else if (gesture.mode === 'aim') {
        const base = projectToScreen(new THREE.Vector3(aimRef.current.x, baseWorldY + 0.12, SPAWN_Z), rect);
        const maximum = active.maxAngle * Math.PI / 180;
        const angle = clamp(Math.atan2(x - base.x, Math.max(5, base.y - y)), -maximum, maximum);
        commitAim((previous) => ({ ...previous, angle, locked: false }));
      } else if (gesture.mode === 'direct') {
        if (!active.straightStabilizer || !gesture.positionLocked) {
          commitAim({ x: screenToLaunchX(x, rect), angle: 0, locked: false });
          if (active.straightStabilizer && upward >= active.straightLockDistance) gesture.positionLocked = true;
        }
        if (active.power) {
          const power = powerFromGesture(gesture.originY, y, gesture.samples, now, active);
          const low = Math.min(active.minPower, active.maxPower);
          const high = Math.max(active.minPower, active.maxPower);
          setPowerPreview(clamp((power - low) / Math.max(0.1, high - low), 0, 1));
        } else setPowerPreview(clamp(upward / active.throwThreshold, 0, 1));
      } else if (gesture.mode === 'throw') {
        const power = powerFromGesture(gesture.originY, y, gesture.samples, now, active);
        const low = Math.min(active.minPower, active.maxPower);
        const high = Math.max(active.minPower, active.maxPower);
        setPowerPreview(active.power ? clamp((power - low) / Math.max(0.1, high - low), 0, 1) : clamp(upward / active.throwThreshold, 0, 1));
      }
      return;
    }

    gesture.active = false;
    const forward = gesture.originY - y;
    if (gesture.mode === 'aim') {
      commitAim((previous) => ({ ...previous, locked: true }));
      setPowerPreview(0);
      return;
    }
    if (gesture.mode === 'position' || gesture.mode === 'position-or-throw') {
      setPowerPreview(0);
      return;
    }
    if (forward >= active.throwThreshold) fire(active.power ? powerFromGesture(gesture.originY, y, gesture.samples, now, active) : active.fixedSpeed);
    else setPowerPreview(0);
  }, [commitAim, fire, projectToScreen, sceneReady, screenToLaunchX, settingsOpen]);

  const toggleAimLock = useCallback(() => {
    if (!settingsRef.current.angle) return;
    commitAim((current) => ({ ...current, locked: !current.locked }));
    setPowerPreview(0);
  }, [commitAim]);

  const openSettings = useCallback(() => {
    if (runningRef.current) {
      pausedRef.current = true;
      setPaused(true);
    }
    setSettingsOpen(true);
    setPowerPreview(0);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (runningRef.current && !manualPauseRef.current) {
      pausedRef.current = false;
      setPaused(false);
      safeUntilRef.current = Math.max(safeUntilRef.current, performance.now() + 450);
    }
  }, []);

  const pauseGame = useCallback(() => {
    manualPauseRef.current = true;
    pausedRef.current = true;
    setPaused(true);
    setSettingsOpen(false);
    setPowerPreview(0);
  }, []);

  const resumeGame = useCallback(() => {
    manualPauseRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    safeUntilRef.current = Math.max(safeUntilRef.current, performance.now() + 450);
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    const previous = settingsRef.current;
    const next = normalizeSettings({ ...previous, ...patch });
    if (patch.slope !== undefined && next.slope !== previous.slope) {
      syncBodies();
      const delta = Math.atan(next.slope) - Math.atan(previous.slope);
      const cosine = Math.cos(delta);
      const sine = Math.sin(delta);
      for (const cup of cupsRef.current) {
        const oldSurface = laneSurfaceY(cup.position[2], previous.slope);
        cup.position[1] = laneSurfaceY(cup.position[2], next.slope) + (cup.position[1] - oldSurface);
        const [, velocityY, velocityZ] = cup.velocity;
        cup.velocity[1] = velocityY * cosine + velocityZ * sine;
        cup.velocity[2] = -velocityY * sine + velocityZ * cosine;
        const body = bodyMapRef.current.get(cup.id);
        body?.setTranslation({ x: cup.position[0], y: cup.position[1], z: cup.position[2] }, false);
        body?.setLinvel({ x: cup.velocity[0], y: cup.velocity[1], z: cup.velocity[2] }, false);
      }
    }
    settingsRef.current = next;
    setSettings(next);
    if (patch.dynamicDanger !== undefined) {
      for (const cup of cupsRef.current) cup.dangerMs = 0;
      commitDanger(patch.dynamicDanger ? DYNAMIC_DANGER_START_Z : FIXED_DANGER_Z);
    }
    if (patch.angle !== undefined) resetAim(lastLaunchXRef.current);
    if (patch.size !== undefined || patch.levelSizes !== undefined || patch.slope !== undefined) {
      safeUntilRef.current = Math.max(safeUntilRef.current, performance.now() + 900);
      const maximum = maxLaunchX(queueRef.current[0] ?? 0, next);
      commitAim((current) => ({ ...current, x: clamp(current.x, -maximum, maximum) }));
    }
  }, [commitAim, commitDanger, resetAim, syncBodies]);

  const applyPreset = useCallback((kind: 'stable' | 'balanced' | 'extreme') => {
    if (kind === 'stable') patchSettings({ wallRest: 0.72, cupRest: 0.1, drag: 0.982, slope: 0.012, fixedSpeed: 8,
      minPower: 7, maxPower: 14, sleepSpeed: 0.11, sleepDelayMs: 300, laneFriction: 0.28, cupFriction: 0.2,
      angularDamping: 3.2, solverIterations: 9, contactSlop: 0.55, bounceCutoff: 0.75, wakeImpulse: 0.6,
      mergeSettleMs: 190, gameOverMs: 1450 });
    else if (kind === 'balanced') patchSettings({ wallRest: 0.91, frontRest: 0.12, cupRest: 0.22,
      drag: 0.994, slope: 0.01, fixedSpeed: 9, minPower: 10, maxPower: 16, sleepSpeed: 0.08,
      sleepDelayMs: 420, contactSlop: 0.45, dangerPenetration: 0.32, returnSpeed: 0.8,
      bounceCutoff: 0.55, wakeImpulse: 0.45, mergeSettleMs: 160,
      laneFriction: 0.18, cupFriction: 0.12, angularDamping: 2.4, solverIterations: 8, ccdSubsteps: 2,
      gameOverMs: 1400 });
    else patchSettings({ wallRest: 0.985, frontRest: 0.28, cupRest: 0.34, drag: 0.994, slope: 0.006,
      fixedSpeed: 10.5, minPower: 10, maxPower: 24, sleepSpeed: 0.045, sleepDelayMs: 680,
      contactSlop: 0.3, bounceCutoff: 0.2, wakeImpulse: 0.25, mergeSettleMs: 90,
      laneFriction: 0.08, cupFriction: 0.06, angularDamping: 1.2, solverIterations: 8, ccdSubsteps: 3 });
  }, [patchSettings]);

  const restartGame = useCallback(() => {
    setSettingsOpen(false);
    reset(settingsRef.current);
  }, [reset]);

  return <main className="app-shell"><section className="game-card" aria-label="果汁杯融合遊戲 V5.1">
    <header className="hud">
      <div className="score-main hud-tile"><small>分數</small><strong>{score.toLocaleString()}</strong><em>最高 {best.toLocaleString()}・零復活 {bestClean.toLocaleString()}</em></div>
      <div className="orders hud-tile"><small>訂單</small><b>{orders}</b><em>累積 {lifetimeOrders}</em></div>
      <div className="queue hud-tile"><CupPreview label="下一杯" level={queue[0]} theme={settings.theme}/><i>›</i><CupPreview label="再下一杯" level={queue[1]} theme={settings.theme}/></div>
      <div className="shots hud-tile"><small>已投</small><b>{shots}</b></div>
      <button className="settings-button" onClick={openSettings} aria-label="開啟設定"><span aria-hidden>⚙</span></button>
    </header>
    <div className="playfield" onPointerDown={(event) => pointer(event, 'down')} onPointerMove={(event) => pointer(event, 'move')}
      onPointerUp={(event) => pointer(event, 'up')} onPointerCancel={(event) => pointer(event, 'cancel')}>
      {mounted && <SceneBoundary><Suspense fallback={null}><GameScene cups={cups} cupsRef={cupsRef} bodyMapRef={bodyMapRef} contactsRef={contactsRef}
        settings={settings} paused={paused} gameOver={gameOver} aim={aim} nextLevel={queue[0] ?? 0}
        dangerLine={dangerLine} bursts={bursts} restoreEpoch={restoreEpoch} safeUntilRef={safeUntilRef}
        onCamera={handleCamera} onCupCollision={handleCupCollision}
        onGameOver={handleGameOver} onRecycle={handleRecycle} onReady={handleSceneReady}/></Suspense></SceneBoundary>}
      {!sceneReady && <div className="scene-loading"><span/><b>正在準備精品 3D 跑道</b></div>}
      <div className="field-badges">
        {historyCount > 0 && <button onClick={undo} aria-label={`復原上一步，尚有 ${historyCount} 次`}>↶ <small>{historyCount}</small></button>}
        {revives > 0 && <span>復活 {revives}</span>}
        {settings.dynamicDanger && <span className="danger-mode">動態線</span>}
        <span className="physics-mode">3D 5.1</span>
      </div>
      {settings.angle && <button className={`aim-state ${aim.locked ? 'locked' : ''}`} onClick={toggleAimLock}>{aim.locked ? '角度已鎖定・點此解鎖' : '拖曳預測線調角度・點此鎖定'}</button>}
      {powerPreview > 0 && <div className="power-meter"><i style={{ height: `${Math.max(8, powerPreview * 100)}%` }}/><span>{settings.power ? '力度' : '有效'}</span></div>}
      {paused && !settingsOpen && !gameOver && <div className="pause-panel"><small>遊戲已暫停</small><h2>3D 物理世界已凍結</h2><div><button onClick={resumeGame}>繼續遊戲</button><button className="secondary" onClick={openSettings}>開啟設定</button></div></div>}
      {gameOver && <div className="game-over"><small>穩定堆積越過危險線</small><h2>{score.toLocaleString()}</h2><p>本局訂單 {orders}・復活 {revives} 次</p><div>{historyCount > 0 && <button className="undo-action" onClick={undo}>復原</button>}<button onClick={revive}>復活</button><button className="secondary" onClick={() => reset()}>重來</button></div></div>}
    </div>
    <section className="merge-strip"><div className="strip-label"><b>融合</b><small>{unlocked + 1}/7</small></div>
      {LEVELS.map((level, index) => <div className={`mini-level ${index <= unlocked ? '' : 'future'}`} key={level.name} title={levelName(settings.theme, index)}><CupIcon level={index} theme={settings.theme}/>{index < LEVELS.length - 1 && <i>›</i>}</div>)}
      <div className="blast-mark" title="最高級爆炸">✦</div>
    </section>
    {settingsOpen && <SettingsSheet settings={settings} close={closeSettings} patch={patchSettings} preset={applyPreset} pause={pauseGame} restart={restartGame}/>}
  </section></main>;
}

function CupPreview({ label, level, theme }: { label: string; level: number; theme: Theme }) {
  return <div className={`cup-preview${level >= 2 ? ' lucky' : ''}`}><small>{label}</small><CupIcon level={level} theme={theme}/></div>;
}

function Toggle({ title, note, value, onChange }: { title: string; note: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><b>{title}</b><small>{note}</small></span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)}/><i/></label>;
}

function Slider({ title, value, min, max, step = 1, unit = '', onChange }: { title: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const precision = Math.max(0, (String(step).split('.')[1] || '').length);
  return <label className="slider-row"><span><b>{title}</b><output>{value.toFixed(precision)}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/></label>;
}

function ThemeButton({ value, current, title, patch }: { value: Theme; current: Theme; title: string; patch: (patch: Partial<Settings>) => void }) {
  return <button className={current === value ? 'active' : ''} onClick={() => patch({ theme: value })}><CupIcon level={value.startsWith('premium') ? 6 : 2} theme={value}/><span>{title}</span></button>;
}

function QualityButton({ value, current, title, note, patch }: { value: GraphicsQuality; current: GraphicsQuality; title: string; note: string; patch: (patch: Partial<Settings>) => void }) {
  return <button className={current === value ? 'active' : ''} onClick={() => patch({ quality: value })}><b>{title}</b><small>{note}</small></button>;
}

function SettingsSheet({ settings, close, patch, preset, pause, restart }: { settings: Settings; close: () => void; patch: (patch: Partial<Settings>) => void; preset: (kind: 'stable' | 'balanced' | 'extreme') => void; pause: () => void; restart: () => void }) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="settings-sheet" role="dialog" aria-modal="true" aria-label="遊戲設定">
    <header><div><small>遊戲設定</small><h2>玩法、3D 與手感</h2></div><button onClick={close} aria-label="關閉設定">×</button></header>
    <div className="sheet-scroll">
      <div className="theme-picker">
        <ThemeButton value="premiumJuice" current={settings.theme} title="精品果汁吧" patch={patch}/><ThemeButton value="premiumSundae" current={settings.theme} title="聖代工房" patch={patch}/><ThemeButton value="premiumWine" current={settings.theme} title="水晶酒窖" patch={patch}/>
        <ThemeButton value="simpleJuice" current={settings.theme} title="果汁陽春" patch={patch}/><ThemeButton value="simpleSundae" current={settings.theme} title="聖代陽春" patch={patch}/><ThemeButton value="simpleWine" current={settings.theme} title="酒杯陽春" patch={patch}/>
      </div>
      <div className="quality-picker"><QualityButton value="eco" current={settings.quality} title="省電" note="較低畫質" patch={patch}/><QualityButton value="balanced" current={settings.quality} title="平衡" note="手機預設" patch={patch}/><QualityButton value="cinematic" current={settings.quality} title="電影" note="完整光影" patch={patch}/></div>
      <div className="setting-group">
        <Toggle title="動態危險線" note="未融合會推進，融合與訂單會退回" value={settings.dynamicDanger} onChange={(value) => patch({ dynamicDanger: value })}/>
        <Toggle title="角度瞄準" note="杯身水平移動；拖曳預測線調角度；二次前滑投擲" value={settings.angle} onChange={(value) => patch({ angle: value })}/>
        <Toggle title="動態防手抖" note="直線模式達到距離後，隱形固定發射起點" value={settings.straightStabilizer} onChange={(value) => patch({ straightStabilizer: value })}/>
        {settings.straightStabilizer && <Slider title="防手抖觸發距離" value={settings.straightLockDistance} min={0} max={40} step={1} unit="px" onChange={(value) => patch({ straightLockDistance: value })}/>}
        <Toggle title="力度控制" note="滑動距離 70%＋末段速度 30%，角度不受出手微操影響" value={settings.power} onChange={(value) => patch({ power: value })}/>
        <Toggle title="顯示杯子等級" note="在 3D 杯身顯示 1～7" value={settings.levels} onChange={(value) => patch({ levels: value })}/>
        <Toggle title="杯口辨識光環" note="協助辨認被前排遮住的杯子，可自由關閉" value={settings.occlusionCues} onChange={(value) => patch({ occlusionCues: value })}/>
        <Toggle title="顯示反彈路徑" note="以跑道尺寸、斜坡與反彈參數預測" value={settings.bounces} onChange={(value) => patch({ bounces: value })}/>
        <Toggle title="音效" note="投擲、融合與爆炸音效" value={settings.sound} onChange={(value) => patch({ sound: value })}/>
        <Toggle title="震動" note="預設關閉，可隨時開啟" value={settings.vibration} onChange={(value) => patch({ vibration: value })}/>
        <Slider title="瞄準線長度" value={settings.aimLength} min={0} max={3000} step={100} onChange={(value) => patch({ aimLength: value })}/>
        <Slider title="最小力度" value={settings.minPower} min={4.5} max={20} step={0.1} onChange={(value) => patch({ minPower: Math.min(value, settings.maxPower - 0.1) })}/>
        <Slider title="最大力度" value={settings.maxPower} min={6} max={25} step={0.1} onChange={(value) => patch({ maxPower: Math.max(value, settings.minPower + 0.1) })}/>
        <Slider title="投擲有效距離" value={settings.throwThreshold} min={30} max={100} step={5} unit="px" onChange={(value) => patch({ throwThreshold: value })}/>
      </div>
      <details className="developer"><summary>開發者專區 <span>即時調整真 3D 手感</span></summary>
        <div className="presets"><button onClick={() => preset('stable')}>穩定堆積</button><button onClick={() => preset('balanced')}>預設手感</button><button onClick={() => preset('extreme')}>極限高彈</button><button onClick={() => patch(DEFAULTS)}>恢復 V5.1 預設</button></div>
        <Toggle title="顯示 3D 碰撞體" note="直接顯示 Rapier 的杯身、護欄、跑道與前牆" value={settings.debugHitboxes} onChange={(value) => patch({ debugHitboxes: value })}/>
        <Slider title="最大角度" value={settings.maxAngle} min={30} max={85} unit="°" onChange={(value) => patch({ maxAngle: value })}/>
        <Slider title="固定力量" value={settings.fixedSpeed} min={5.5} max={14} step={0.1} onChange={(value) => patch({ fixedSpeed: value })}/>
        <Slider title="左右護欄反彈" value={settings.wallRest} min={0.1} max={0.99} step={0.01} onChange={(value) => patch({ wallRest: value })}/>
        <Slider title="前方牆反彈" value={settings.frontRest} min={0} max={0.6} step={0.01} onChange={(value) => patch({ frontRest: value })}/>
        <Slider title="杯子互撞反彈" value={settings.cupRest} min={0} max={0.55} step={0.01} onChange={(value) => patch({ cupRest: value })}/>
        <Slider title="速度衰減" value={settings.drag} min={0.96} max={0.998} step={0.001} onChange={(value) => patch({ drag: value })}/>
        <Slider title="斜坡重力" value={settings.slope} min={0} max={0.04} step={0.001} onChange={(value) => patch({ slope: value })}/>
        <Slider title="跑道摩擦" value={settings.laneFriction} min={0} max={0.8} step={0.01} onChange={(value) => patch({ laneFriction: value })}/>
        <Slider title="杯身摩擦" value={settings.cupFriction} min={0} max={0.8} step={0.01} onChange={(value) => patch({ cupFriction: value })}/>
        <Slider title="旋轉衰減" value={settings.angularDamping} min={0.2} max={6} step={0.1} onChange={(value) => patch({ angularDamping: value })}/>
        <Slider title="物理解算次數" value={settings.solverIterations} min={4} max={16} step={1} onChange={(value) => patch({ solverIterations: value })}/>
        <Slider title="高速碰撞子步驟" value={settings.ccdSubsteps} min={1} max={4} step={1} onChange={(value) => patch({ ccdSubsteps: value })}/>
        <Slider title="休眠速度" value={settings.sleepSpeed} min={0.02} max={0.3} step={0.005} onChange={(value) => patch({ sleepSpeed: value })}/>
        <Slider title="休眠等待" value={settings.sleepDelayMs} min={100} max={1200} step={20} unit="ms" onChange={(value) => patch({ sleepDelayMs: value })}/>
        <Slider title="碰撞皮膚誤差" value={settings.contactSlop} min={0} max={1.5} step={0.05} onChange={(value) => patch({ contactSlop: value })}/>
        <Slider title="低速安定門檻" value={settings.bounceCutoff} min={0} max={2} step={0.05} onChange={(value) => patch({ bounceCutoff: value })}/>
        <Slider title="碰撞喚醒門檻" value={settings.wakeImpulse} min={0.1} max={2} step={0.05} onChange={(value) => patch({ wakeImpulse: value })}/>
        <Slider title="融合安定時間" value={settings.mergeSettleMs} min={0} max={400} step={10} unit="ms" onChange={(value) => patch({ mergeSettleMs: value })}/>
        <Slider title="危險線深入比例" value={settings.dangerPenetration} min={0.1} max={0.8} step={0.02} onChange={(value) => patch({ dangerPenetration: value })}/>
        <Slider title="高速回收門檻" value={settings.returnSpeed} min={0.2} max={4} step={0.1} onChange={(value) => patch({ returnSpeed: value })}/>
        <Slider title="攝影機高度" value={settings.cameraHeight} min={9.5} max={16} step={0.1} onChange={(value) => patch({ cameraHeight: value })}/>
        <Slider title="整體杯子尺寸（即時）" value={settings.size} min={0.55} max={2.2} step={0.01} onChange={(value) => patch({ size: value })}/>
        <details className="level-sizes"><summary>各級 3D 杯身與碰撞比例 <span>立即生效</span></summary><div>{settings.levelSizes.map((value, index) => <Slider key={index} title={`等級 ${index + 1} 比例`} value={value} min={0.55} max={3.8} step={0.01} onChange={(nextValue) => { const next = [...settings.levelSizes]; next[index] = nextValue; patch({ levelSizes: next }); }}/>)}</div></details>
        <Slider title="穩定堆積結束等待" value={settings.gameOverMs} min={500} max={3000} step={100} unit="ms" onChange={(value) => patch({ gameOverMs: value })}/>
        <Slider title="爆炸範圍" value={settings.blastRadius} min={80} max={240} step={5} onChange={(value) => patch({ blastRadius: value })}/>
        <Slider title="爆炸推力" value={settings.blastForce} min={1} max={9} step={0.2} onChange={(value) => patch({ blastForce: value })}/>
      </details>
    </div>
    <div className="settings-actions"><button className="pause-action" onClick={pause}>暫停遊戲</button><button className={`restart-action ${confirmRestart ? 'confirm' : ''}`} onClick={() => { if (confirmRestart) restart(); else setConfirmRestart(true); }}>{confirmRestart ? '再次點擊確認重來' : '重新開始'}</button></div>
    <button className="done-button" onClick={close}>完成並繼續</button>
  </section></div>;
}
