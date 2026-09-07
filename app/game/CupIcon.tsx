'use client';

import { useId } from 'react';
import { LEVELS, Theme, isPremiumTheme, kindForTheme, levelName } from './config';

const SUNDAE = ['#fff0c2', '#d88931', '#6fa64a', '#6a3d2f', '#6656bf', '#3d1d22', '#e68bd7'];
const WINE = ['#bfefff', '#a78bdb', '#ef8ca6', '#395bc0', '#43a46c', '#bd274f', '#5c56d9'];

function colorFor(theme: Theme, level: number) {
  const kind = kindForTheme(theme);
  if (kind === 'sundae') return SUNDAE[level];
  if (kind === 'wine') return WINE[level];
  return LEVELS[level].color;
}

function MiniGarnish({ level, kind }: { level: number; kind: ReturnType<typeof kindForTheme> }) {
  if (kind === 'sundae') {
    return <>
      <path d="M29 29c3-8 13-8 16 0 5 1 7 8 3 11H26c-4-4-1-10 3-11Z" fill="#fff8e5" stroke="#c79c77" strokeWidth="1.2"/>
      {level === 3 && <rect x="39" y="18" width="8" height="17" rx="2" transform="rotate(19 39 18)" fill="#4a261c"/>}
      {level !== 3 && <circle cx="37" cy="20" r="5" fill={level >= 5 ? '#d7264c' : level === 2 ? '#6d2b26' : '#e68738'}/>} 
    </>;
  }
  if (level === 5 && kind === 'juice') return <path d="M38 19 57 31 34 36Z" fill="#ef465b" stroke="#318348" strokeWidth="3"/>;
  return <>
    <circle cx="47" cy="24" r="8" fill={level === 6 ? '#eb2948' : level === 3 ? '#6f2d9f' : '#ffd441'} stroke="#fff1ae" strokeWidth="2"/>
    {(level === 0 || level === 4 || level === 6) && <path d="M36 20c-8-8-12 0-6 6 5 3 9-1 6-6Z" fill="#45a755"/>}
  </>;
}

export function CupIcon({ level, theme, className = '' }: { level: number; theme: Theme; className?: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `liquid-${rawId}`;
  const glassId = `glass-${rawId}`;
  const color = colorFor(theme, level);
  const dark = kindForTheme(theme) === 'juice' ? LEVELS[level].dark : color;
  const kind = kindForTheme(theme);
  const premium = isPremiumTheme(theme);
  return <svg className={`cup-icon ${className}`} viewBox="0 0 70 96" role="img" aria-label={levelName(theme, level)}>
    <defs>
      <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".7"/>
        <stop offset=".2" stopColor={color}/>
        <stop offset="1" stopColor={dark}/>
      </linearGradient>
      <linearGradient id={glassId} x1="0" x2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".88"/>
        <stop offset=".22" stopColor="#dffaff" stopOpacity=".25"/>
        <stop offset=".72" stopColor="#fff" stopOpacity=".08"/>
        <stop offset="1" stopColor="#fff" stopOpacity=".78"/>
      </linearGradient>
      <filter id={`shadow-${rawId}`} x="-40%" y="-30%" width="180%" height="190%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#57301e" floodOpacity=".35"/>
      </filter>
    </defs>
    <g filter={`url(#shadow-${rawId})`}>
      {kind === 'juice' && <>
        <path d="M15 26h40l-5 55c-.5 6-5 9-15 9s-14.5-3-15-9Z" fill={`url(#${gradientId})`}/>
        {premium && <>{[0, 1, 2].map((index) => <rect key={index} x={24 + index * 9} y={42 + (index % 2) * 12} width="9" height="8" rx="2" transform={`rotate(${index * 18 - 12} ${28 + index * 9} 48)`} fill="#fff" opacity=".38"/>)}<circle cx="27" cy="67" r="2" fill="#fff" opacity=".7"/><circle cx="42" cy="54" r="1.5" fill="#fff" opacity=".7"/></>}
        <path d="M15 26h40l-5 55c-.5 6-5 9-15 9s-14.5-3-15-9Z" fill={`url(#${glassId})`} stroke="#f7ffff" strokeWidth="2"/>
        <ellipse cx="35" cy="26" rx="20" ry="5" fill={color} stroke="#fff" strokeWidth="2"/>
        <MiniGarnish level={level} kind={kind}/>
        {(level === 1 || level === 6) && <><path d="m47 10-10 55" stroke="#fff8e5" strokeWidth="4"/><path d="m46 14-2 9m-3 8-2 9m-3 8-2 9" stroke="#e7513f" strokeWidth="4"/></>}
      </>}
      {kind === 'sundae' && <>
        <ellipse cx="35" cy="87" rx="16" ry="4" fill="#d7f4f7" stroke="#fff" strokeWidth="2"/>
        <rect x="32" y="58" width="6" height="28" rx="3" fill="#e8fbff" stroke="#fff" strokeWidth="1.5"/>
        <path d="M11 28h48c-2 26-11 38-24 38S13 54 11 28Z" fill={`url(#${gradientId})`} stroke="#fff" strokeWidth="2"/>
        {premium && <path d="M18 35c2 14 7 22 15 25" fill="none" stroke="#fff" strokeWidth="3" opacity=".5"/>}
        <MiniGarnish level={level} kind={kind}/>
      </>}
      {kind === 'wine' && <>
        <ellipse cx="35" cy="88" rx="16" ry="4" fill="#dff8ff" stroke="#fff" strokeWidth="2"/>
        <rect x="32" y="57" width="6" height="30" rx="3" fill="#e7fbff" stroke="#fff" strokeWidth="1.5"/>
        <path d="M11 22h48c-2 27-10 40-24 40S13 49 11 22Z" fill={`url(#${gradientId})`} stroke="#fff" strokeWidth="2"/>
        {premium && <><path d="M19 30c2 14 7 23 14 27" fill="none" stroke="#fff" strokeWidth="3" opacity=".58"/><circle cx="46" cy="42" r="2" fill="#fff" opacity=".75"/><circle cx="39" cy="50" r="1.4" fill="#fff" opacity=".75"/></>}
        <MiniGarnish level={level} kind={kind}/>
      </>}
    </g>
  </svg>;
}
