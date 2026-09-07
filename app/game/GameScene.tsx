'use client';

/* eslint-disable react-hooks/immutability -- Rapier body transforms are mutable simulation state held outside React. */

import { Line, Sparkles, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  CuboidCollider,
  CylinderCollider,
  Physics,
  RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import { MutableRefObject, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  AimState,
  ART_ASSET,
  BurstState,
  CUP_COLLIDER_SLICES,
  CupState,
  GraphicsQuality,
  LANE_ASSET,
  LANE_HALF,
  LANE_NEAR,
  Settings,
  SPAWN_Z,
  cupHeight,
  cupRadius,
  laneAngle,
  laneSurfaceY,
} from './config';
import { PredictionPoint, isStackDanger, predictPath } from './core';
import { CupModel3D } from './CupModel';

type BodyMap = Map<number, RapierRigidBody>;
type ContactMap = Map<number, Set<number>>;

type SceneProps = {
  cups: CupState[];
  cupsRef: MutableRefObject<CupState[]>;
  bodyMapRef: MutableRefObject<BodyMap>;
  contactsRef: MutableRefObject<ContactMap>;
  settings: Settings;
  paused: boolean;
  gameOver: boolean;
  aim: AimState;
  nextLevel: number;
  dangerLine: number;
  bursts: BurstState[];
  restoreEpoch: number;
  safeUntilRef: MutableRefObject<number>;
  onCamera: (camera: THREE.PerspectiveCamera | null) => void;
  onCupCollision: (firstId: number, secondId: number) => void;
  onGameOver: () => void;
  onRecycle: (id: number) => void;
  onReady: () => void;
};

function qualityDpr(quality: GraphicsQuality): [number, number] {
  if (quality === 'eco') return [0.8, 1.05];
  if (quality === 'cinematic') return [1.2, 1.85];
  return [1, 1.45];
}

function CameraRig({ height, visualMode, onCamera }: { height: number; visualMode: Settings['visualMode']; onCamera: SceneProps['onCamera'] }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const artMode = visualMode === 'art';
    camera.position.set(0, artMode ? ART_ASSET.lane.cameraHeight : height, 19);
    camera.fov = size.width / Math.max(1, size.height) < 0.7
      ? (artMode ? ART_ASSET.lane.portraitFov : 45)
      : (artMode ? ART_ASSET.lane.wideFov : 39);
    camera.near = 0.1;
    camera.far = 80;
    camera.lookAt(0, -0.1, -1);
    camera.updateProjectionMatrix();
    onCamera(camera);
    return () => onCamera(null);
  }, [camera, height, onCamera, size.height, size.width, visualMode]);
  return null;
}

function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

function LaneVisual({ slope }: { slope: number }) {
  const gltf = useGLTF('/models/lane-v51.glb');
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.name !== 'LaneSurface';
      object.receiveShadow = true;
      if (object.material instanceof THREE.MeshStandardMaterial) {
        object.material = object.material.clone();
        object.material.envMapIntensity = 0.72;
      }
    });
    return clone;
  }, [gltf.scene]);
  return <group rotation={[-laneAngle(slope), 0, 0]}><primitive object={scene}/></group>;
}

function WindowWall() {
  return <group position={[0, 2.7, -13.2]}>
    <mesh receiveShadow position={[0, 0, -0.25]}><boxGeometry args={[15, 7.5, 0.4]}/><meshStandardMaterial color="#b77842" roughness={0.72}/></mesh>
    <mesh position={[0, 0.5, 0]}><boxGeometry args={[6.8, 4.8, 0.16]}/><meshPhysicalMaterial color="#caeaf2" roughness={0.18} metalness={0.02}/></mesh>
    {[-3.42, 0, 3.42].map((x) => <mesh key={`v-${x}`} position={[x, 0.5, 0.14]} castShadow><boxGeometry args={[0.15, 5, 0.18]}/><meshStandardMaterial color="#6b371d" roughness={0.45}/></mesh>)}
    {[-1.92, 0.5, 2.92].map((y) => <mesh key={`h-${y}`} position={[0, y, 0.14]} castShadow><boxGeometry args={[7, 0.14, 0.18]}/><meshStandardMaterial color="#6b371d" roughness={0.45}/></mesh>)}
    <mesh position={[0, 3.22, 0.05]} castShadow><boxGeometry args={[8.4, 1.1, 0.35]}/><meshStandardMaterial color="#46200f" roughness={0.34}/></mesh>
    <mesh position={[0, 3.18, 0.25]}><boxGeometry args={[5.3, 0.11, 0.1]}/><meshStandardMaterial color="#ffc35b" emissive="#ff9a32" emissiveIntensity={1.6}/></mesh>
  </group>;
}

function Plant({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return <group position={[x, 0.1, z]} scale={scale}>
    <mesh castShadow position={[0, 0.45, 0]}><cylinderGeometry args={[0.42, 0.32, 0.9, 18]}/><meshStandardMaterial color="#b36b3d" roughness={0.65}/></mesh>
    {Array.from({ length: 7 }, (_, index) => {
      const angle = index / 7 * Math.PI * 2;
      return <mesh key={index} castShadow position={[Math.cos(angle) * 0.34, 1.05 + (index % 3) * 0.16, Math.sin(angle) * 0.27]}
        rotation={[0.3, -angle, Math.sin(angle) * 0.55]} scale={[0.3, 0.08, 0.72]}>
        <sphereGeometry args={[1, 12, 8]}/><meshStandardMaterial color={index % 2 ? '#2f8d48' : '#54aa52'} roughness={0.78}/>
      </mesh>;
    })}
  </group>;
}

function FruitBowl({ x, z }: { x: number; z: number }) {
  const colors = ['#ef8230', '#e74339', '#f5bd31', '#7eb343', '#e36a27'];
  return <group position={[x, 0.1, z]}>
    <mesh position={[0, 0.23, 0]} scale={[1, 0.36, 1]} receiveShadow><sphereGeometry args={[0.75, 24, 12]}/><meshStandardMaterial color="#ad6a3c" roughness={0.62}/></mesh>
    {colors.map((color, index) => {
      const angle = index / colors.length * Math.PI * 2;
      return <mesh key={color} castShadow position={[Math.cos(angle) * 0.38, 0.52 + (index % 2) * 0.12, Math.sin(angle) * 0.3]}>
        <sphereGeometry args={[0.23, 14, 10]}/><meshPhysicalMaterial color={color} roughness={0.34} clearcoat={0.35}/>
      </mesh>;
    })}
  </group>;
}

function PendantLamp({ x }: { x: number }) {
  return <group position={[x, 5.55, -10.9]}>
    <mesh castShadow rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.46, 0.62, 28, 1, true]}/><meshStandardMaterial color="#4a1f0f" metalness={0.45} roughness={0.24} side={THREE.DoubleSide}/></mesh>
    <mesh position={[0, -0.34, 0]}><sphereGeometry args={[0.14, 18, 12]}/><meshStandardMaterial color="#ffd884" emissive="#ff932f" emissiveIntensity={2.1}/></mesh>
    <mesh position={[0, 1.06, 0]}><cylinderGeometry args={[0.018, 0.018, 2.15, 8]}/><meshStandardMaterial color="#3b1a0e"/></mesh>
  </group>;
}

function BottleShelf() {
  const colors = ['#d8752d', '#4a9d67', '#7f54ad', '#e4b32f', '#b33a45', '#4f91a9'];
  return <group position={[0, 2.72, -12.82]}>
    <mesh castShadow><boxGeometry args={[5.4, 0.13, 0.48]}/><meshStandardMaterial color="#4b210f" roughness={0.34}/></mesh>
    {colors.map((color, index) => <group key={color} position={[-2.05 + index * 0.82, 0.42 + (index % 2) * 0.07, 0.02]}>
      <mesh castShadow><cylinderGeometry args={[0.14, 0.17, 0.66, 14]}/><meshPhysicalMaterial color={color} transparent opacity={0.82} roughness={0.18} clearcoat={0.55}/></mesh>
      <mesh position={[0, 0.41, 0]}><cylinderGeometry args={[0.055, 0.07, 0.18, 12]}/><meshStandardMaterial color="#f2d7a0" metalness={0.22} roughness={0.3}/></mesh>
    </group>)}
  </group>;
}

function BarStool({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh castShadow position={[0, 0.68, 0]} scale={[1, 0.25, 1]}><cylinderGeometry args={[0.48, 0.42, 0.42, 24]}/><meshPhysicalMaterial color="#713419" roughness={0.38} clearcoat={0.18}/></mesh>
    <mesh position={[0, 0.26, 0]}><cylinderGeometry args={[0.07, 0.09, 0.62, 14]}/><meshStandardMaterial color="#a76a34" metalness={0.22} roughness={0.34}/></mesh>
  </group>;
}

function EnvironmentSet({ quality }: { quality: GraphicsQuality }) {
  return <>
    <color attach="background" args={['#d9b277']}/>
    <fog attach="fog" args={['#d8b37d', 24, 54]}/>
    <ambientLight intensity={quality === 'eco' ? 1.25 : 0.85}/>
    <hemisphereLight args={['#fff3ce', '#8a4d27', quality === 'eco' ? 1.15 : 0.82]}/>
    <directionalLight
      castShadow={quality !== 'eco'}
      position={[-6, 14, 8]}
      intensity={2.25}
      color="#fff2cc"
      shadow-mapSize-width={quality === 'cinematic' ? 1536 : 1024}
      shadow-mapSize-height={quality === 'cinematic' ? 1536 : 1024}
      shadow-camera-left={-7}
      shadow-camera-right={7}
      shadow-camera-top={13}
      shadow-camera-bottom={-11}
      shadow-bias={-0.0002}
    />
    <pointLight position={[4, 5, -9]} intensity={10} distance={13} color="#ffb04f"/>
    <WindowWall/>
    {quality !== 'eco' && <><PendantLamp x={-2.25}/><PendantLamp x={0}/><PendantLamp x={2.25}/><BottleShelf/></>}
    <mesh receiveShadow position={[0, -0.48, 0]}><boxGeometry args={[18, 0.7, 31]}/><meshStandardMaterial color="#b97845" roughness={0.76}/></mesh>
    <mesh receiveShadow position={[-5.7, 0.1, -1]}><boxGeometry args={[4.3, 1.2, 22]}/><meshStandardMaterial color="#8b4f2d" roughness={0.58}/></mesh>
    <mesh receiveShadow position={[5.7, 0.1, -1]}><boxGeometry args={[4.3, 1.2, 22]}/><meshStandardMaterial color="#8b4f2d" roughness={0.58}/></mesh>
    <Plant x={-4.2} z={-7.8} scale={1.15}/><Plant x={4.15} z={-6.8}/>
    <FruitBowl x={4.25} z={1.2}/><FruitBowl x={-4.35} z={4.2}/>
    {quality !== 'eco' && <><BarStool x={-4.35} z={-0.3}/><BarStool x={4.35} z={4.7}/></>}
    {quality === 'cinematic' && <Sparkles count={35} scale={[10, 5, 22]} size={1.4} speed={0.12} opacity={0.16} color="#fff5c7"/>}
  </>;
}

function LanePhysics({ settings }: { settings: Settings }) {
  const angle = laneAngle(settings.slope);
  return <RigidBody type="fixed" colliders={false} rotation={[-angle, 0, 0]}>
    <CuboidCollider
      args={[LANE_ASSET.width / 2, LANE_ASSET.surfaceThickness / 2, LANE_ASSET.length / 2]}
      position={[0, -LANE_ASSET.surfaceThickness / 2, 0]}
      friction={settings.laneFriction}
      restitution={0}
    />
    <CuboidCollider
      args={[LANE_ASSET.railWidth / 2, LANE_ASSET.railHeight / 2, LANE_ASSET.length / 2 + 0.15]}
      position={[-LANE_ASSET.railCenterX, 0.25, 0]}
      friction={settings.laneFriction}
      restitution={settings.wallRest}
      restitutionCombineRule={3}
    />
    <CuboidCollider
      args={[LANE_ASSET.railWidth / 2, LANE_ASSET.railHeight / 2, LANE_ASSET.length / 2 + 0.15]}
      position={[LANE_ASSET.railCenterX, 0.25, 0]}
      friction={settings.laneFriction}
      restitution={settings.wallRest}
      restitutionCombineRule={3}
    />
    <CuboidCollider
      args={[LANE_ASSET.frontWallWidth / 2, LANE_ASSET.frontWallHeight / 2, LANE_ASSET.frontWallDepth / 2]}
      position={[0, LANE_ASSET.frontWallCenterY, LANE_ASSET.frontWallCenterZ]}
      friction={settings.laneFriction}
      restitution={settings.frontRest}
      restitutionCombineRule={3}
    />
    <CuboidCollider
      args={[LANE_HALF + 0.35, 0.3, 0.18]}
      position={[0, 0.1, LANE_ASSET.nearBumperCenterZ]}
      friction={settings.laneFriction}
      restitution={0.04}
      restitutionCombineRule={3}
    />
  </RigidBody>;
}

function CupBody({
  cup,
  settings,
  restoreEpoch,
  bodyMapRef,
  contactsRef,
  onCupCollision,
  microDetails,
}: {
  cup: CupState;
  settings: Settings;
  restoreEpoch: number;
  bodyMapRef: MutableRefObject<BodyMap>;
  contactsRef: MutableRefObject<ContactMap>;
  onCupCollision: SceneProps['onCupCollision'];
  microDetails: boolean;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const contactTokensRef = useRef(new Map<number, number>());
  const radius = cupRadius(cup.level, settings);
  const height = cupHeight(cup.level, settings);
  const contactSkin = Math.min(0.008, settings.contactSlop * 0.004);

  const assignBody = useCallback((body: RapierRigidBody | null) => {
    const previousBody = bodyRef.current;
    if (!body && previousBody) {
      const ownedColliderHandles = new Set<number>();
      for (let index = 0; index < previousBody.numColliders(); index += 1) {
        ownedColliderHandles.add(previousBody.collider(index).handle);
      }
      for (const contacts of contactsRef.current.values()) {
        for (const handle of ownedColliderHandles) {
          contacts.delete(handle + 1);
          contacts.delete(-(handle + 1));
        }
      }
    }
    bodyRef.current = body;
    if (body) {
      bodyMapRef.current.set(cup.id, body);
      contactsRef.current.set(cup.id, contactsRef.current.get(cup.id) ?? new Set());
    } else {
      bodyMapRef.current.delete(cup.id);
      contactsRef.current.delete(cup.id);
      contactTokensRef.current.clear();
    }
  }, [bodyMapRef, contactsRef, cup.id]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setTranslation({ x: cup.position[0], y: cup.position[1], z: cup.position[2] }, true);
    body.setLinvel({ x: cup.velocity[0], y: cup.velocity[1], z: cup.velocity[2] }, true);
    body.setRotation({ x: cup.rotation[0], y: cup.rotation[1], z: cup.rotation[2], w: cup.rotation[3] }, true);
    body.setAngvel({ x: cup.angularVelocity[0], y: cup.angularVelocity[1], z: cup.angularVelocity[2] }, true);
  }, [cup.angularVelocity, cup.position, cup.rotation, cup.velocity, restoreEpoch]);

  const updateContact = (handle: number, otherCupId: unknown, present: boolean) => {
    const contacts = contactsRef.current.get(cup.id) ?? new Set<number>();
    const inferredToken = typeof otherCupId === 'number' ? -(handle + 1) : handle + 1;
    if (present) {
      contactTokensRef.current.set(handle, inferredToken);
      contacts.add(inferredToken);
    } else {
      contacts.delete(contactTokensRef.current.get(handle) ?? inferredToken);
      contactTokensRef.current.delete(handle);
    }
    contactsRef.current.set(cup.id, contacts);
  };

  return <RigidBody
    ref={assignBody}
    colliders={false}
    position={cup.position}
    linearVelocity={cup.velocity}
    angularVelocity={cup.angularVelocity}
    enabledRotations={[false, true, false]}
    ccd
    softCcdPrediction={0.35}
    canSleep
    linearDamping={Math.max(0, (1 - settings.drag) * 60)}
    angularDamping={settings.angularDamping}
    additionalSolverIterations={2}
    userData={{ cupId: cup.id }}
    onCollisionEnter={(event) => {
      const otherId = event.other.rigidBodyObject?.userData?.cupId;
      updateContact(event.other.collider.handle, otherId, true);
      if (typeof otherId === 'number' && otherId !== cup.id) {
        const ownVelocity = bodyRef.current?.linvel();
        const otherVelocity = event.other.rigidBody?.linvel();
        if (ownVelocity && otherVelocity && Math.hypot(
          ownVelocity.x - otherVelocity.x,
          ownVelocity.y - otherVelocity.y,
          ownVelocity.z - otherVelocity.z,
        ) >= settings.wakeImpulse) {
          cup.sleepMs = 0;
          bodyRef.current?.wakeUp();
        }
        onCupCollision(cup.id, otherId);
      }
    }}
    onCollisionExit={(event) => updateContact(event.other.collider.handle, event.other.rigidBodyObject?.userData?.cupId, false)}
  >
    {CUP_COLLIDER_SLICES.map((slice) => <CylinderCollider
      key={slice.name}
      args={[height * slice.halfHeight, radius * slice.radius]}
      position={[0, height * slice.centerY, 0]}
      density={slice.density}
      friction={settings.cupFriction}
      restitution={settings.cupRest}
      restitutionCombineRule={3}
      contactSkin={contactSkin}
    />)}
    <CupModel3D
      theme={settings.theme}
      visualMode={settings.visualMode}
      level={cup.level}
      radius={radius}
      height={height}
      showLevel={settings.levels}
      showHalo={settings.occlusionCues}
      quality={settings.quality}
      microDetails={microDetails}
    />
  </RigidBody>;
}

function PredictionLines({
  cups,
  aim,
  nextLevel,
  settings,
}: Pick<SceneProps, 'cups' | 'aim' | 'nextLevel' | 'settings'>) {
  const speeds = settings.power
    ? [Math.min(settings.minPower, settings.maxPower), (settings.minPower + settings.maxPower) / 2, Math.max(settings.minPower, settings.maxPower)]
    : [settings.fixedSpeed];
  const paths = useMemo(() => speeds.map((speed) => predictPath(aim, nextLevel, speed, settings, cups)),
    // levelSizes is mutable only through a cloned settings object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aim.angle, aim.x, cups, nextLevel, settings]);
  if (settings.aimLength <= 0) return null;
  return <group>
    {paths.map((path, index) => {
      const middle = paths.length === 1 || index === 1;
      const points = path.map(([x, , z]) => [x, laneSurfaceY(z, settings.slope) + 0.095, z] as PredictionPoint);
      return points.length > 1 && <Line
        key={`${index}-${points.length}`}
        points={points}
        color={middle ? '#fffaf0' : '#f39a59'}
        lineWidth={middle ? 2.2 : 1.15}
        dashed
        dashSize={middle ? 0.25 : 0.12}
        gapSize={middle ? 0.19 : 0.22}
        transparent
        opacity={middle ? 0.88 : 0.47}
        depthTest={false}
        renderOrder={8}
      />;
    })}
  </group>;
}

function AimHandle({ aim, settings }: { aim: AimState; settings: Settings }) {
  if (!settings.angle) return null;
  const distance = 1.65;
  const endX = aim.x + Math.sin(aim.angle) * distance;
  const endZ = SPAWN_Z - Math.cos(aim.angle) * distance;
  const baseY = laneSurfaceY(SPAWN_Z, settings.slope) + 0.11;
  const endY = laneSurfaceY(endZ, settings.slope) + 0.11;
  return <group>
    <Line points={[[aim.x, baseY, SPAWN_Z], [endX, endY, endZ]]} color={aim.locked ? '#51d79a' : '#ffffff'} lineWidth={2.8} depthTest={false}/>
    <mesh position={[endX, endY + 0.035, endZ]} renderOrder={9}>
      <sphereGeometry args={[0.12, 18, 12]}/><meshBasicMaterial color={aim.locked ? '#49d28f' : '#fffaf0'} depthTest={false}/>
    </mesh>
  </group>;
}

function DangerLine({ z, settings }: { z: number; settings: Settings }) {
  const y = laneSurfaceY(z, settings.slope) + 0.08;
  const color = settings.dynamicDanger ? '#ff674f' : '#ef6655';
  return <group>
    <Line points={[[-LANE_HALF + 0.06, y, z], [LANE_HALF - 0.06, y, z]]} color={color} lineWidth={5.5} transparent opacity={0.18} depthTest={false}/>
    <Line points={[[-LANE_HALF + 0.06, y + 0.01, z], [LANE_HALF - 0.06, y + 0.01, z]]} color={color} lineWidth={2.1} dashed dashSize={0.24} gapSize={0.19} depthTest={false}/>
  </group>;
}

function Burst({ burst, slope }: { burst: BurstState; slope: number }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const elapsed = (performance.now() - burst.createdAt) / (burst.kind === 'blast' ? 780 : 520);
    if (!group.current || !ring.current) return;
    group.current.visible = elapsed < 1;
    group.current.scale.setScalar(0.18 + Math.min(1, elapsed) * burst.radius);
    ring.current.opacity = Math.max(0, (1 - elapsed) * 0.72);
  });
  return <group ref={group} position={[burst.x, laneSurfaceY(burst.z, slope) + 0.18, burst.z]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.74, 1, 48]}/><meshBasicMaterial ref={ring} color={burst.color} transparent opacity={0.72} depthWrite={false}/></mesh>
  </group>;
}

function PhysicsMonitor({
  cupsRef,
  bodyMapRef,
  contactsRef,
  settings,
  dangerLine,
  safeUntilRef,
  onGameOver,
  onRecycle,
  active,
}: Pick<SceneProps, 'cupsRef' | 'bodyMapRef' | 'contactsRef' | 'settings' | 'dangerLine' | 'safeUntilRef' | 'onGameOver' | 'onRecycle'> & { active: boolean }) {
  const triggeredRef = useRef(false);
  const recycleGuard = useRef(new Set<number>());
  useEffect(() => {
    if (active) triggeredRef.current = false;
  }, [active]);

  useFrame((_, delta) => {
    if (!active) return;
    const deltaMs = Math.min(50, delta * 1000);
    let shouldEnd = false;
    for (const cup of cupsRef.current) {
      const body = bodyMapRef.current.get(cup.id);
      if (!body) continue;
      const position = body.translation();
      const velocity = body.linvel();
      const rotation = body.rotation();
      const angularVelocity = body.angvel();
      cup.position = [position.x, position.y, position.z];
      cup.velocity = [velocity.x, velocity.y, velocity.z];
      cup.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
      cup.angularVelocity = [angularVelocity.x, angularVelocity.y, angularVelocity.z];
      cup.ageMs += deltaMs;
      cup.mergeLockMs = Math.max(0, cup.mergeLockMs - deltaMs);
      const radius = cupRadius(cup.level, settings);
      const planarSpeed = Math.hypot(velocity.x, velocity.z);
      const spatialSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const contactSet = contactsRef.current.get(cup.id);
      const contacts = contactSet?.size ?? 0;
      let hasCupContact = false;
      if (contactSet) {
        for (const token of contactSet) {
          if (token < 0) {
            hasCupContact = true;
            break;
          }
        }
      }
      if (position.z + radius < dangerLine - 0.08) cup.safeExited = true;
      if (!body.isSleeping() && contacts > 0 && spatialSpeed < settings.bounceCutoff) {
        const settle = Math.pow(0.84, delta * 60);
        body.setLinvel({ x: velocity.x * settle, y: velocity.y * 0.72, z: velocity.z * settle }, false);
      }
      if (contacts > 0 && spatialSpeed < settings.sleepSpeed) cup.sleepMs += deltaMs;
      else cup.sleepMs = Math.max(0, cup.sleepMs - deltaMs * 2);
      if (!body.isSleeping() && cup.sleepMs >= settings.sleepDelayMs) body.sleep();

      const stable = body.isSleeping() || (contacts > 0 && spatialSpeed < Math.max(0.14, settings.sleepSpeed * 2));
      const penetration = position.z + radius - dangerLine;
      const inDanger = penetration > Math.max(0.1, radius * settings.dangerPenetration);
      if (isStackDanger(cup, stable, inDanger, hasCupContact)) cup.dangerMs += deltaMs;
      else cup.dangerMs = Math.max(0, cup.dangerMs - deltaMs * 3);
      if (cup.dangerMs >= settings.gameOverMs) shouldEnd = true;

      const escaped = (position.z > LANE_NEAR + 0.65 && planarSpeed > settings.returnSpeed) || position.y < -2.5;
      if (escaped && cup.ageMs > 300 && !recycleGuard.current.has(cup.id)) {
        recycleGuard.current.add(cup.id);
        onRecycle(cup.id);
      }
    }
    if (shouldEnd && performance.now() >= safeUntilRef.current && !triggeredRef.current) {
      triggeredRef.current = true;
      onGameOver();
    }
  });
  return null;
}

function PreviewCup({ level, aim, settings }: { level: number; aim: AimState; settings: Settings }) {
  const radius = cupRadius(level, settings);
  const height = cupHeight(level, settings);
  return <group position={[aim.x, laneSurfaceY(SPAWN_Z, settings.slope) + 0.025, SPAWN_Z]}>
    <mesh position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.9, radius * 1.14, 36]}/><meshBasicMaterial color="#fff4c5" transparent opacity={0.28} depthWrite={false}/>
    </mesh>
    <CupModel3D theme={settings.theme} level={level} radius={radius} height={height}
      visualMode={settings.visualMode} showLevel={settings.levels} showHalo={settings.occlusionCues} quality={settings.quality} preview/>
  </group>;
}

function World({ props }: { props: SceneProps }) {
  return <>
    {props.settings.visualMode !== 'art' && (
      <EnvironmentSet quality={props.settings.quality}/>
    )}
    <CameraRig height={props.settings.cameraHeight} visualMode={props.settings.visualMode} onCamera={props.onCamera}/>
    <Suspense fallback={null}>
      {props.settings.visualMode !== 'art' && (
        <LaneVisual slope={props.settings.slope}/>
      )}
      <Physics
        gravity={[0, -9.81, 0]}
        paused={props.paused || props.gameOver}
        colliders={false}
        timeStep={1 / 60}
        interpolate
        allowedLinearError={0.0015}
        predictionDistance={0.008}
        numSolverIterations={props.settings.solverIterations}
        numInternalPgsIterations={2}
        maxCcdSubsteps={props.settings.ccdSubsteps}
        contactNaturalFrequency={24}
        debug={props.settings.debugHitboxes}
      >
        <LanePhysics settings={props.settings}/>
        {props.cups.map((cup, index) => <CupBody key={`${cup.id}-${props.restoreEpoch}`} cup={cup} settings={props.settings}
          restoreEpoch={props.restoreEpoch} bodyMapRef={props.bodyMapRef} contactsRef={props.contactsRef}
          onCupCollision={props.onCupCollision}
          microDetails={props.settings.quality === 'cinematic' || (props.settings.quality === 'balanced' &&
            (props.cups.length <= 28 || index >= props.cups.length - 18))}/>) }
        <PhysicsMonitor cupsRef={props.cupsRef} bodyMapRef={props.bodyMapRef} contactsRef={props.contactsRef}
          settings={props.settings} dangerLine={props.dangerLine} safeUntilRef={props.safeUntilRef}
          onGameOver={props.onGameOver} onRecycle={props.onRecycle} active={!props.paused && !props.gameOver}/>
      </Physics>
      <PredictionLines cups={props.cups} aim={props.aim} nextLevel={props.nextLevel} settings={props.settings}/>
      <AimHandle aim={props.aim} settings={props.settings}/>
      <DangerLine z={props.dangerLine} settings={props.settings}/>
      <PreviewCup level={props.nextLevel} aim={props.aim} settings={props.settings}/>
      {props.bursts.map((burst) => <Burst key={burst.id} burst={burst} slope={props.settings.slope}/>) }
      <SceneReady onReady={props.onReady}/>
    </Suspense>
  </>;
}

export function GameScene(props: SceneProps) {
  return <Canvas
    className={`v5-canvas visual-${props.settings.visualMode}`}
    dpr={qualityDpr(props.settings.quality)}
    shadows={props.settings.visualMode !== 'art' && props.settings.quality !== 'eco'}
    camera={{ position: [0, props.settings.cameraHeight, 19], fov: 45, near: 0.1, far: 80 }}
    gl={{ antialias: props.settings.quality !== 'eco', alpha: true, powerPreference: 'high-performance' }}
    onCreated={({ gl, camera }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.08;
      gl.shadowMap.type = THREE.PCFShadowMap;
      gl.setClearColor(0x000000, 0);
      if (camera instanceof THREE.PerspectiveCamera) props.onCamera(camera);
    }}
  >
    <World props={props}/>
  </Canvas>;
}

export type { BodyMap, ContactMap };

useGLTF.preload('/models/lane-v51.glb');
