'use client';

import { useGLTF, useTexture } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  CUP_MODEL_HEIGHT,
  CUP_MODEL_RADIUS,
  ART_ASSET,
  CupKind,
  GraphicsQuality,
  LEVELS,
  Theme,
  VisualMode,
  artSpritePath,
  isPremiumTheme,
  kindForTheme,
  laneAngle,
} from './config';

type CupNodes = Record<string, THREE.Mesh>;

const LEGACY_MODEL_INFO: Record<CupKind, { node: string; radius: number; height: number }> = {
  juice: { node: 'JuiceShell', radius: 0.96, height: 2.24 },
  sundae: { node: 'SundaeShell', radius: 0.98, height: 2.02 },
  wine: { node: 'WineShell', radius: 0.98, height: 2.17 },
};

const SUNDAE_COLORS = ['#fff0c2', '#d88931', '#6fa64a', '#6a3d2f', '#6656bf', '#3d1d22', '#e68bd7'];
const WINE_COLORS = ['#bfefff', '#a78bdb', '#ef8ca6', '#395bc0', '#43a46c', '#bd274f', '#5c56d9'];

function liquidColor(theme: Theme, level: number) {
  const kind = kindForTheme(theme);
  if (kind === 'sundae') return SUNDAE_COLORS[level] ?? SUNDAE_COLORS[0];
  if (kind === 'wine') return WINE_COLORS[level] ?? WINE_COLORS[0];
  return LEVELS[level]?.color ?? LEVELS[0].color;
}

const glassMaterialCache = new Map<string, THREE.Material>();

function glassMaterial(premium: boolean, quality: GraphicsQuality) {
  const key = `${premium ? 'premium' : 'simple'}-${quality}`;
  const cached = glassMaterialCache.get(key);
  if (cached) return cached;
  const material = quality === 'eco' || !premium
    ? new THREE.MeshStandardMaterial({
      color: '#e8fbff', transparent: true, opacity: premium ? 0.42 : 0.48,
      roughness: 0.16, metalness: 0.02, side: THREE.DoubleSide, depthWrite: false,
    })
    : new THREE.MeshPhysicalMaterial({
      color: '#effcff', transparent: true, opacity: quality === 'cinematic' ? 0.34 : 0.4,
      transmission: quality === 'cinematic' ? 0.5 : 0, thickness: 0.16, ior: 1.46,
      roughness: 0.045, metalness: 0.015, clearcoat: 0.92, clearcoatRoughness: 0.06,
      envMapIntensity: 0.92, side: THREE.DoubleSide, depthWrite: false,
    });
  material.name = `V51RuntimeGlass-${key}`;
  glassMaterialCache.set(key, material);
  return material;
}

const levelTextures = new Map<number, THREE.CanvasTexture>();
const artShadowTextures = new Map<'contact' | 'ambient', THREE.CanvasTexture>();

function getArtShadowTexture(kind: 'contact' | 'ambient') {
  const cached = artShadowTextures.get(kind);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 32, kind === 'contact' ? 2 : 7, 64, 32, 58);
  gradient.addColorStop(0, kind === 'contact' ? 'rgba(50, 24, 10, .82)' : 'rgba(73, 39, 20, .34)');
  gradient.addColorStop(0.48, kind === 'contact' ? 'rgba(66, 32, 13, .34)' : 'rgba(91, 51, 25, .15)');
  gradient.addColorStop(1, 'rgba(77, 37, 14, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  artShadowTextures.set(kind, texture);
  return texture;
}

function getLevelTexture(level: number) {
  if (levelTextures.has(level)) return levelTextures.get(level)!;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(34, 25, 4, 48, 48, 44);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#fff0cf');
  context.beginPath();
  context.arc(48, 48, 42, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = LEVELS[level].dark;
  context.stroke();
  context.fillStyle = '#512717';
  context.font = '900 48px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(level + 1), 48, 51);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  levelTextures.set(level, texture);
  return texture;
}

function LevelBadge({ level, height, radius }: { level: number; height: number; radius: number }) {
  const texture = useMemo(() => getLevelTexture(level), [level]);
  return <sprite position={[0, height * 0.56, radius * 1.04]} scale={[0.5, 0.5, 0.5]} renderOrder={9}>
    <spriteMaterial map={texture} transparent depthTest={false}/>
  </sprite>;
}

function ArtCup({
  theme,
  level,
  radius,
  height,
  slope,
  preview,
}: {
  theme: Theme;
  level: number;
  radius: number;
  height: number;
  slope: number;
  preview: boolean;
}) {
  const sourceTexture = useTexture(artSpritePath(theme, level));
  const texture = useMemo(() => {
    const configured = sourceTexture.clone();
    configured.colorSpace = THREE.SRGBColorSpace;
    configured.minFilter = THREE.LinearMipmapLinearFilter;
    configured.magFilter = THREE.LinearFilter;
    configured.generateMipmaps = true;
    configured.needsUpdate = true;
    return configured;
  }, [sourceTexture]);
  const contactShadow = useMemo(() => getArtShadowTexture('contact'), []);
  const ambientShadow = useMemo(() => getArtShadowTexture('ambient'), []);
  const kind = kindForTheme(theme);
  const profile = ART_ASSET.sprite.themes[kind];
  const image = texture.image as { width: number; height: number };
  const padding = ART_ASSET.sprite.padding;
  const contentWidth = Math.max(1, image.width - padding * 2);
  const contentHeight = Math.max(1, image.height - padding * 2);
  const bodyRatio = profile.bodyRatios[level] ?? profile.bodyRatios[0];
  const footInset = profile.footInsets[level] ?? padding;
  const footShadowRatio = profile.footShadowRatios[level] ?? 0.86;
  const contentWorldWidth = radius * 2 / bodyRatio;
  const contentWorldHeight = Math.min(
    contentWorldWidth * contentHeight / contentWidth,
    height * ART_ASSET.sprite.heightCap,
  );
  const spriteWidth = contentWorldWidth * image.width / contentWidth;
  const spriteHeight = contentWorldHeight * image.height / contentHeight;
  const bottomPaddingWorld = spriteHeight * footInset / image.height;
  const groundRotation: [number, number, number] = [-Math.PI / 2 - laneAngle(slope), 0, 0];

  useEffect(() => () => texture.dispose(), [texture]);

  return <group>
    {!preview && <>
      <mesh position={[0, -0.026, radius * 0.04]} rotation={groundRotation} renderOrder={1}>
        <planeGeometry args={[radius * 1.9 * footShadowRatio, radius * 0.48]}/>
        <meshBasicMaterial map={contactShadow} transparent opacity={0.72} depthWrite={false} toneMapped={false}/>
      </mesh>
      <mesh position={[radius * 0.12, -0.028, radius * 0.34]} rotation={groundRotation} renderOrder={1}>
        <planeGeometry args={[radius * 2.45, radius * 0.92]}/>
        <meshBasicMaterial map={ambientShadow} transparent opacity={0.2} depthWrite={false} toneMapped={false}/>
      </mesh>
    </>}
    <sprite position={[0, -bottomPaddingWorld, 0]} scale={[spriteWidth, spriteHeight, 1]} center={[0.5, 0]} renderOrder={6}>
      <spriteMaterial map={texture} transparent alphaTest={0.018} depthWrite depthTest toneMapped={false}/>
    </sprite>
  </group>;
}

function SimpleCup({
  theme,
  level,
  radius,
  height,
  quality,
  preview,
}: {
  theme: Theme;
  level: number;
  radius: number;
  height: number;
  quality: GraphicsQuality;
  preview: boolean;
}) {
  const gltf = useGLTF('/models/cups-v5.glb');
  const kind = kindForTheme(theme);
  const info = LEGACY_MODEL_INFO[kind];
  const shell = (gltf.nodes as CupNodes)[info.node];
  const color = liquidColor(theme, level);
  const scale: [number, number, number] = [radius / info.radius, height / info.height, radius / info.radius];
  return <group scale={scale}>
    {kind === 'juice' && <mesh position={[0, 1.08, 0]} castShadow={!preview}>
      <cylinderGeometry args={[0.82, 0.6, 1.68, 28]}/><meshStandardMaterial color={color} roughness={0.3}/>
    </mesh>}
    {kind === 'sundae' && <mesh position={[0, 1.55, 0]} scale={[0.8, 0.5, 0.8]} castShadow={!preview}>
      <sphereGeometry args={[1, 24, 16]}/><meshStandardMaterial color={color} roughness={0.34}/>
    </mesh>}
    {kind === 'wine' && <mesh position={[0, 1.48, 0]} scale={[0.76, 0.5, 0.76]} castShadow={!preview}>
      <sphereGeometry args={[1, 24, 16]}/><meshStandardMaterial color={color} roughness={0.26}/>
    </mesh>}
    {shell && <mesh geometry={shell.geometry} castShadow={!preview} receiveShadow={!preview}>
      <primitive object={glassMaterial(false, quality)} attach="material"/>
    </mesh>}
  </group>;
}

function PremiumCup({
  kind,
  level,
  radius,
  height,
  quality,
  microDetails,
  preview,
}: {
  kind: CupKind;
  level: number;
  radius: number;
  height: number;
  quality: GraphicsQuality;
  microDetails: boolean;
  preview: boolean;
}) {
  const gltf = useGLTF('/models/cups-v51.glb');
  const template = gltf.scene.getObjectByName(`Cup_${kind}_${level}`);
  const model = useMemo(() => {
    if (!template) return null;
    const clone = template.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const role = object.userData.role as string | undefined;
      const isGlass = role === 'glass' || object.name.endsWith('_Glass');
      const isDetail = role === 'detail' || object.name.endsWith('_Detail');
      const isMicro = role === 'micro' || object.name.endsWith('_Micro');
      object.visible = !isMicro || (microDetails && quality !== 'eco');
      if (isGlass) object.material = glassMaterial(true, quality);
      object.castShadow = !preview && quality !== 'eco' && !isGlass;
      object.receiveShadow = !preview;
      object.renderOrder = isGlass ? 5 : isDetail ? 4 : 3;
    });
    return clone;
  }, [microDetails, preview, quality, template]);
  const scale: [number, number, number] = [radius / CUP_MODEL_RADIUS, height / CUP_MODEL_HEIGHT, radius / CUP_MODEL_RADIUS];
  const simpleTheme = `simple${kind === 'juice' ? 'Juice' : kind === 'sundae' ? 'Sundae' : 'Wine'}` as Theme;
  return model
    ? <primitive object={model} scale={scale}/>
    : <SimpleCup theme={simpleTheme} level={level} radius={radius} height={height} quality={quality} preview={preview}/>;
}

export function CupModel3D({
  theme,
  level,
  radius,
  height,
  showLevel,
  showHalo,
  quality,
  visualMode,
  slope = 0,
  microDetails = true,
  preview = false,
}: {
  theme: Theme;
  level: number;
  radius: number;
  height: number;
  showLevel: boolean;
  showHalo: boolean;
  quality: GraphicsQuality;
  visualMode: VisualMode;
  slope?: number;
  microDetails?: boolean;
  preview?: boolean;
}) {
  const kind = kindForTheme(theme);
  const premium = isPremiumTheme(theme);
  return <group>
    {visualMode === 'art'
      ? <ArtCup theme={theme} level={level} radius={radius} height={height} slope={slope} preview={preview}/>
      : visualMode === 'realtime3d' && premium
        ? <PremiumCup kind={kind} level={level} radius={radius} height={height} quality={quality} microDetails={microDetails} preview={preview}/>
        : <SimpleCup theme={theme} level={level} radius={radius} height={height} quality={quality} preview={preview}/>
    }
    {showHalo && <mesh position={[0, height * 1.025, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={8}>
      <torusGeometry args={[radius * 0.92, Math.max(0.018, radius * 0.035), 8, 42]}/>
      <meshBasicMaterial color={LEVELS[level].accent} transparent opacity={preview ? 0.45 : 0.3} depthWrite={false} depthTest={false}/>
    </mesh>}
    {showLevel && <LevelBadge level={level} height={height} radius={radius}/>}
  </group>;
}

useGLTF.preload('/models/cups-v51.glb');
useGLTF.preload('/models/cups-v5.glb');
