'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  CupKind,
  LEVELS,
  Theme,
  isPremiumTheme,
  kindForTheme,
} from './config';

type CupNodes = Record<string, THREE.Mesh>;

const MODEL_INFO: Record<CupKind, { node: string; radius: number; height: number }> = {
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

function GlassMaterial({ premium }: { premium: boolean }) {
  if (!premium) {
    return <meshStandardMaterial color="#e6fbff" transparent opacity={0.48} roughness={0.18} metalness={0.02} depthWrite={false}/>;
  }
  return <meshPhysicalMaterial
    color="#f4fdff"
    transparent
    opacity={0.4}
    transmission={0.28}
    thickness={0.18}
    ior={1.45}
    roughness={0.06}
    metalness={0.02}
    clearcoat={0.88}
    clearcoatRoughness={0.08}
    envMapIntensity={0.72}
    depthWrite={false}
  />;
}

function LiquidMaterial({ color, premium, emissive = false }: { color: string; premium: boolean; emissive?: boolean }) {
  if (!premium) return <meshStandardMaterial color={color} roughness={0.32} metalness={0.02}/>;
  return <meshPhysicalMaterial
    color={color}
    emissive={emissive ? color : '#000000'}
    emissiveIntensity={emissive ? 0.13 : 0}
    transparent
    opacity={0.9}
    transmission={0.06}
    roughness={0.16}
    metalness={0.03}
    clearcoat={0.55}
    clearcoatRoughness={0.12}
  />;
}

function Citrus({ color = '#ffd844', position = [0.48, 2.08, 0] as [number, number, number] }) {
  return <group position={position} rotation={[Math.PI / 2, 0.2, 0.08]}>
    <mesh castShadow><cylinderGeometry args={[0.24, 0.24, 0.055, 24]}/><meshStandardMaterial color={color} roughness={0.45}/></mesh>
    <mesh position={[0, 0.031, 0]}><torusGeometry args={[0.18, 0.018, 8, 24]}/><meshStandardMaterial color="#fff4b0"/></mesh>
  </group>;
}

function Leaves({ position = [-0.24, 2.08, 0] as [number, number, number], count = 2 }) {
  return <group position={position}>
    {Array.from({ length: count }, (_, index) => <mesh key={index} castShadow
      position={[(index - (count - 1) / 2) * 0.16, index % 2 ? 0.05 : 0, 0]}
      rotation={[0.25, index * 1.2, index % 2 ? -0.55 : 0.55]}
      scale={[0.24, 0.08, 0.42]}>
      <sphereGeometry args={[1, 12, 8]}/><meshStandardMaterial color={index % 2 ? '#2d9b43' : '#64c54d'} roughness={0.68}/>
    </mesh>)}
  </group>;
}

function BerryCluster({ color = '#75319e', position = [0, 2.1, 0] as [number, number, number], count = 4 }) {
  const points = [[0, 0, 0], [0.18, -0.04, 0.03], [-0.16, -0.05, 0.05], [0.06, 0.12, -0.03], [-0.05, -0.14, -0.02]];
  return <group position={position}>
    {points.slice(0, count).map((point, index) => <mesh key={index} castShadow position={point as [number, number, number]}>
      <sphereGeometry args={[0.12, 14, 10]}/><meshPhysicalMaterial color={color} roughness={0.24} clearcoat={0.6}/>
    </mesh>)}
  </group>;
}

function Straw({ position = [0.36, 1.78, 0] as [number, number, number], color = '#ef523b' }) {
  return <group position={position} rotation={[0, 0, -0.23]}>
    <mesh castShadow><cylinderGeometry args={[0.035, 0.035, 1.25, 12]}/><meshStandardMaterial color="#fff7e7" roughness={0.45}/></mesh>
    {[0.16, 0.42, 0.68, 0.94].map((y) => <mesh key={y} position={[0, y - 0.62, 0]}>
      <cylinderGeometry args={[0.039, 0.039, 0.11, 12]}/><meshStandardMaterial color={color}/>
    </mesh>)}
  </group>;
}

function Watermelon({ position = [0.48, 2.02, 0] as [number, number, number] }) {
  return <group position={position} rotation={[Math.PI / 2, 0.35, 0]}>
    <mesh castShadow><cylinderGeometry args={[0.3, 0.3, 0.075, 3, 1, false, 0, Math.PI]}/><meshStandardMaterial color="#f34359" roughness={0.4}/></mesh>
    <mesh position={[0, -0.045, 0]} scale={[1.08, 1, 1.08]}><torusGeometry args={[0.25, 0.036, 8, 18, Math.PI]}/><meshStandardMaterial color="#3b9d4a"/></mesh>
  </group>;
}

function SundaeTop({ level, color }: { level: number; color: string }) {
  return <group position={[0, 1.84, 0]}>
    <mesh castShadow scale={[0.76, 0.45, 0.76]}><sphereGeometry args={[1, 24, 16]}/><LiquidMaterial color={color} premium/></mesh>
    <mesh position={[0, 0.35, 0]} castShadow scale={[0.53, 0.32, 0.53]}><sphereGeometry args={[1, 20, 14]}/><meshPhysicalMaterial color="#fff8e7" roughness={0.24} clearcoat={0.28}/></mesh>
    {level === 0 && <mesh position={[0.18, 0.6, 0]} rotation={[0.2, 0, -0.35]} castShadow><boxGeometry args={[0.28, 0.38, 0.08]}/><meshStandardMaterial color="#f4cc77" roughness={0.65}/></mesh>}
    {level === 1 && <Citrus color="#e48b2f" position={[0.42, 0.42, 0]}/>}
    {level === 2 && <BerryCluster color="#7e2f29" position={[0.05, 0.56, 0]} count={4}/>}
    {level === 3 && <group position={[0.28, 0.48, 0]} rotation={[0.1, 0, -0.4]}><mesh castShadow><boxGeometry args={[0.34, 0.44, 0.1]}/><meshStandardMaterial color="#3b2119" roughness={0.7}/></mesh></group>}
    {level === 4 && <BerryCluster color="#5146ab" position={[0.04, 0.57, 0]} count={5}/>}
    {level === 5 && <BerryCluster color="#b71735" position={[0, 0.58, 0]} count={3}/>}
    {level === 6 && <><BerryCluster color="#e22854" position={[0, 0.58, 0]} count={3}/><mesh position={[0, 0.78, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><torusGeometry args={[0.18, 0.045, 8, 4]}/><meshStandardMaterial color="#f7c43e" metalness={0.65} roughness={0.22}/></mesh></>}
  </group>;
}

function JuiceDetails({ level, premium }: { level: number; premium: boolean }) {
  if (!premium) return level === 1 ? <Straw/> : null;
  return <>
    {level === 0 && <><Citrus/><Leaves count={1}/></>}
    {level === 1 && <><Citrus color="#ff962e"/><Straw/></>}
    {level === 2 && <><BerryCluster color="#f0445d" position={[0.06, 2.12, 0]} count={3}/><Leaves count={1}/></>}
    {level === 3 && <><BerryCluster/><Leaves position={[-0.18, 2.16, 0]} count={2}/></>}
    {level === 4 && <><Citrus color="#84d95d"/><Leaves count={3}/></>}
    {level === 5 && <><Watermelon/><Leaves count={2}/></>}
    {level === 6 && <><Citrus/><BerryCluster color="#e32745" position={[0, 2.26, 0]} count={1}/><Leaves count={2}/></>}
  </>;
}

function WineDetails({ level, premium }: { level: number; premium: boolean }) {
  if (!premium) return null;
  return <>
    {level === 0 && <Citrus color="#d7f4ff" position={[0.48, 2.07, 0]}/>}
    {level === 1 && <Leaves position={[-0.12, 2.14, 0]} count={2}/>}
    {level === 2 && <BerryCluster color="#f5c9dc" position={[0.1, 2.16, 0]} count={2}/>}
    {level === 3 && <><BerryCluster color="#6d84f2" position={[0.08, 2.16, 0]} count={2}/><Leaves count={1}/></>}
    {level === 4 && <Leaves position={[0, 2.13, 0]} count={3}/>}
    {level === 5 && <BerryCluster color="#d1254e" position={[0.08, 2.15, 0]} count={4}/>}
    {level === 6 && <><mesh position={[0, 2.24, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><torusGeometry args={[0.2, 0.04, 8, 6]}/><meshStandardMaterial color="#ffe982" emissive="#a56cff" emissiveIntensity={0.5} metalness={0.45}/></mesh><BerryCluster color="#63dce2" position={[0.05, 2.12, 0]} count={3}/></>}
  </>;
}

function IceAndBubbles({ premium, kind }: { premium: boolean; kind: CupKind }) {
  if (!premium || kind === 'sundae') return null;
  const ice = [[-0.25, 1.0, 0.15], [0.24, 1.34, -0.1], [0.1, 0.72, 0.23]];
  const bubbles = [[-0.36, 1.46, 0.22], [0.32, 1.1, 0.25], [-0.12, 1.75, 0.3], [0.42, 1.66, -0.08]];
  return <>
    {ice.map((position, index) => <mesh key={`ice-${index}`} position={position as [number, number, number]} rotation={[0.2 * index, 0.35 * index, 0.14]} castShadow>
      <boxGeometry args={[0.36, 0.31, 0.32]}/><meshPhysicalMaterial color="#f7ffff" transparent opacity={0.36} roughness={0.08} transmission={0.35}/>
    </mesh>)}
    {bubbles.map((position, index) => <mesh key={`bubble-${index}`} position={position as [number, number, number]}>
      <sphereGeometry args={[0.035 + index * 0.006, 8, 6]}/><meshStandardMaterial color="#ffffff" transparent opacity={0.7}/>
    </mesh>)}
  </>;
}

const levelTextures = new Map<number, THREE.CanvasTexture>();

function getLevelTexture(level: number) {
  if (levelTextures.has(level)) return levelTextures.get(level)!;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.beginPath();
  context.arc(48, 48, 42, 0, Math.PI * 2);
  context.fillStyle = '#fff9e8';
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = LEVELS[level].dark;
  context.stroke();
  context.fillStyle = '#5a2e1c';
  context.font = '900 49px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(level + 1), 48, 51);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  levelTextures.set(level, texture);
  return texture;
}

function LevelBadge({ level, height }: { level: number; height: number }) {
  const texture = useMemo(() => getLevelTexture(level), [level]);
  return <sprite position={[0, height * 0.58, 0.99]} scale={[0.5, 0.5, 0.5]}>
    <spriteMaterial map={texture} transparent depthTest={false}/>
  </sprite>;
}

export function CupModel3D({
  theme,
  level,
  radius,
  height,
  showLevel,
  showHalo,
  preview = false,
}: {
  theme: Theme;
  level: number;
  radius: number;
  height: number;
  showLevel: boolean;
  showHalo: boolean;
  preview?: boolean;
}) {
  const gltf = useGLTF('/models/cups-v5.glb');
  const nodes = gltf.nodes as CupNodes;
  const kind = kindForTheme(theme);
  const info = MODEL_INFO[kind];
  const shell = nodes[info.node];
  const premium = isPremiumTheme(theme);
  const color = liquidColor(theme, level);
  const scale: [number, number, number] = [radius / info.radius, height / info.height, radius / info.radius];

  return <group scale={scale} renderOrder={preview ? 4 : 1}>
    {kind === 'juice' && <mesh position={[0, 1.08, 0]} castShadow={!preview} receiveShadow>
      <cylinderGeometry args={[0.82, 0.6, 1.68, 32]}/><LiquidMaterial color={color} premium={premium} emissive={level === 6}/>
    </mesh>}
    {kind === 'sundae' && <SundaeTop level={level} color={color}/>} 
    {kind === 'wine' && <mesh position={[0, 1.48, 0]} scale={[0.92, 0.58, 0.92]} castShadow={!preview}>
      <sphereGeometry args={[0.82, 28, 18]}/><LiquidMaterial color={color} premium={premium} emissive={level >= 5}/>
    </mesh>}
    <IceAndBubbles premium={premium} kind={kind}/>
    {shell && <mesh geometry={shell.geometry} castShadow={!preview} receiveShadow>
      <GlassMaterial premium={premium}/>
    </mesh>}
    {kind === 'juice' && <JuiceDetails level={level} premium={premium}/>} 
    {kind === 'wine' && <WineDetails level={level} premium={premium}/>} 
    {showHalo && <mesh position={[0, info.height + 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={6}>
      <torusGeometry args={[0.8, 0.035, 8, 38]}/>
      <meshBasicMaterial color={LEVELS[level].accent} transparent opacity={preview ? 0.42 : 0.28} depthWrite={false}/>
    </mesh>}
    {showLevel && <LevelBadge level={level} height={info.height}/>} 
  </group>;
}
