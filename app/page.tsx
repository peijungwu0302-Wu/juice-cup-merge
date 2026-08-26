'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const JUICES = [
  { name: '檸檬露', color: '#ffe56a', dark: '#e4b92e', emoji: '🍋' },
  { name: '蜜柑汁', color: '#ffab45', dark: '#ef721d', emoji: '🍊' },
  { name: '草莓乳', color: '#ff718b', dark: '#dc3157', emoji: '🍓' },
  { name: '葡萄冰', color: '#a878f2', dark: '#6534b6', emoji: '🍇' },
  { name: '哈密瓜', color: '#76d995', dark: '#2a9a5d', emoji: '🍈' },
  { name: '西瓜蘇打', color: '#ff5267', dark: '#c5223c', emoji: '🍉' },
  { name: '彩虹果昔', color: '#5bd8dc', dark: '#198caa', emoji: '🌈' },
];

type Cup = { id: number; x: number; y: number; vx: number; vy: number; level: number; r: number; settled: number };
type Burst = { x: number; y: number; life: number; color: string };
const radiusFor = (level: number) => 18 + level * 4.7;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cupsRef = useRef<Cup[]>([]), burstsRef = useRef<Burst[]>([]), nextId = useRef(1);
  const gameSize = useRef({ w: 360, h: 570, dpr: 1 });
  const aim = useRef({ x: 180, startX: 180, startY: 0, dragY: 0, active: false });
  const optionsRef = useRef({ angle: false, power: false }), running = useRef(true);
  const [angleMode, setAngleMode] = useState(false), [powerMode, setPowerMode] = useState(false);
  const [score, setScore] = useState(0), [best, setBest] = useState(0), [shots, setShots] = useState(0);
  const [nextLevel, setNextLevel] = useState(0), [unlocked, setUnlocked] = useState(1), [gameOver, setGameOver] = useState(false);

  useEffect(() => { optionsRef.current = { angle: angleMode, power: powerMode }; }, [angleMode, powerMode]);
  useEffect(() => { setBest(Number(localStorage.getItem('juice-best') || 0)); }, []);
  const reset = useCallback(() => {
    cupsRef.current = [
      { id: nextId.current++, x: 155, y: 145, vx: 0, vy: 0, level: 0, r: radiusFor(0), settled: 0 },
      { id: nextId.current++, x: 205, y: 185, vx: 0, vy: 0, level: 0, r: radiusFor(0), settled: 0 },
      { id: nextId.current++, x: 180, y: 105, vx: 0, vy: 0, level: 1, r: radiusFor(1), settled: 0 },
    ];
    burstsRef.current = []; running.current = true;
    setScore(0); setShots(0); setNextLevel(0); setUnlocked(1); setGameOver(false);
  }, []);
  useEffect(() => { reset(); }, [reset]);

  const fire = useCallback(() => {
    if (!running.current) return;
    const { w, h } = gameSize.current, o = optionsRef.current;
    const horizontal = o.angle ? Math.max(-0.48, Math.min(0.48, (aim.current.x - aim.current.startX) / 130)) : 0;
    const power = o.power ? Math.max(5.3, Math.min(10.5, 5.3 + aim.current.dragY / 20)) : 7.3;
    cupsRef.current.push({ id: nextId.current++, x: Math.max(28, Math.min(w - 28, aim.current.x)), y: h - 42, vx: horizontal * power, vy: -power, level: nextLevel, r: radiusFor(nextLevel), settled: 0 });
    setShots(s => s + 1); setNextLevel(Math.random() < .78 ? 0 : 1);
  }, [nextLevel]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    let raf = 0, last = performance.now();
    const resize = () => { const box = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(box.width*dpr); canvas.height = Math.round(box.height*dpr); gameSize.current = {w:box.width,h:box.height,dpr}; };
    resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
    const drawCup = (c:Cup) => {
      const {color,dark}=JUICES[c.level]; ctx.save(); ctx.translate(c.x,c.y); ctx.shadowColor='#3c241c3d';ctx.shadowBlur=9;ctx.shadowOffsetY=4;
      const g=ctx.createRadialGradient(-c.r*.35,-c.r*.4,2,0,0,c.r);g.addColorStop(0,'#fff9');g.addColorStop(.18,color);g.addColorStop(1,dark);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,c.r,0,Math.PI*2);ctx.fill();
      ctx.shadowColor='transparent';ctx.strokeStyle='#fff9';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,c.r-2,Math.PI*1.05,Math.PI*1.85);ctx.stroke();ctx.strokeStyle='#542d1f55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,c.r,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(10,c.r*.55)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(c.level+1),0,1);ctx.restore();
    };
    const loop=(now:number)=>{
      const dt=Math.min(2,(now-last)/16.67);last=now;const {w,h,dpr}=gameSize.current;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#e8f6da');bg.addColorStop(1,'#fff3d4');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle='#d5aa78';ctx.fillRect(0,0,w,18);ctx.fillStyle='#fff8';ctx.fillRect(0,18,w,5);
      ctx.strokeStyle='#d09a6b66';ctx.lineWidth=2;ctx.setLineDash([7,9]);ctx.beginPath();ctx.moveTo(0,h-78);ctx.lineTo(w,h-78);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#85513799';ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText('發射區',w/2,h-59);
      const cups=cupsRef.current;for(const c of cups){c.x+=c.vx*dt;c.y+=c.vy*dt;const f=Math.pow(.988,dt);c.vx*=f;c.vy*=f;if(Math.hypot(c.vx,c.vy)<.04){c.vx=0;c.vy=0;c.settled+=dt;}if(c.x-c.r<5){c.x=c.r+5;c.vx=Math.abs(c.vx)*.72}if(c.x+c.r>w-5){c.x=w-c.r-5;c.vx=-Math.abs(c.vx)*.72}if(c.y-c.r<20){c.y=c.r+20;c.vy=Math.abs(c.vy)*.68}if(c.y+c.r>h-5){c.y=h-c.r-5;c.vy=-Math.abs(c.vy)*.45}}
      const remove=new Set<number>(),add:Cup[]=[];for(let i=0;i<cups.length;i++)for(let j=i+1;j<cups.length;j++){const a=cups[i],b=cups[j];if(remove.has(a.id)||remove.has(b.id))continue;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||.01,min=a.r+b.r;if(dist>=min)continue;const nx=dx/dist,ny=dy/dist,overlap=min-dist;a.x-=nx*overlap/2;a.y-=ny*overlap/2;b.x+=nx*overlap/2;b.y+=ny*overlap/2;const rvx=b.vx-a.vx,rvy=b.vy-a.vy,along=rvx*nx+rvy*ny;if(along<0){const ma=a.r*a.r,mb=b.r*b.r,imp=-(1+.62)*along/(1/ma+1/mb);a.vx-=imp*nx/ma;a.vy-=imp*ny/ma;b.vx+=imp*nx/mb;b.vy+=imp*ny/mb}if(a.level===b.level&&a.level<JUICES.length-1){remove.add(a.id);remove.add(b.id);const nl=a.level+1,ma=a.r*a.r,mb=b.r*b.r,x=(a.x+b.x)/2,y=(a.y+b.y)/2;add.push({id:nextId.current++,x,y,vx:(a.vx*ma+b.vx*mb)/(ma+mb),vy:(a.vy*ma+b.vy*mb)/(ma+mb),level:nl,r:radiusFor(nl),settled:0});burstsRef.current.push({x,y,life:1,color:JUICES[nl].color});const gain=(nl+1)*100;setScore(s=>{const n=s+gain;setBest(old=>{const v=Math.max(old,n);localStorage.setItem('juice-best',String(v));return v});return n});setUnlocked(u=>Math.max(u,nl))}}
      if(remove.size)cupsRef.current=cups.filter(c=>!remove.has(c.id)).concat(add);for(const b of burstsRef.current){b.life-=.035*dt;ctx.globalAlpha=Math.max(0,b.life);ctx.strokeStyle=b.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.x,b.y,20+(1-b.life)*35,0,Math.PI*2);ctx.stroke()}ctx.globalAlpha=1;burstsRef.current=burstsRef.current.filter(b=>b.life>0);for(const c of cupsRef.current)drawCup(c);
      if(cupsRef.current.some(c=>c.y+c.r>h-82&&c.settled>80)&&running.current){running.current=false;setGameOver(true)}
      if(running.current){ctx.globalAlpha=.72;ctx.strokeStyle='#8a5937';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(aim.current.x,h-48);ctx.lineTo(aim.current.x,h-135);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=JUICES[nextLevel].color;ctx.beginPath();ctx.arc(aim.current.x,h-38,radiusFor(nextLevel),0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke()}raf=requestAnimationFrame(loop);
    };raf=requestAnimationFrame(loop);return()=>{cancelAnimationFrame(raf);ro.disconnect()};
  },[nextLevel]);

  const pointer=(e:React.PointerEvent<HTMLCanvasElement>,phase:'down'|'move'|'up')=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(phase==='down'){aim.current={x,startX:x,startY:y,dragY:0,active:true};e.currentTarget.setPointerCapture(e.pointerId)}else if(phase==='move'&&aim.current.active){aim.current.x=Math.max(26,Math.min(r.width-26,x));aim.current.dragY=Math.max(0,aim.current.startY-y)}else if(phase==='up'&&aim.current.active){aim.current.active=false;fire()}};

  return <main className="app-shell"><section className="game-card" aria-label="果汁杯融合遊戲">
    <header className="topbar"><div><span className="eyebrow">JUICE LAB</span><h1>果汁碰碰杯</h1></div><div className="scorebox"><span>分數<b>{score.toLocaleString()}</b></span><span>最高<b>{best.toLocaleString()}</b></span></div></header>
    <div className="settings"><label><span><b>角度瞄準</b><small>{angleMode?'拖動決定方向':'直線前進'}</small></span><input aria-label="角度瞄準" type="checkbox" checked={angleMode} onChange={e=>setAngleMode(e.target.checked)}/><i/></label><label><span><b>力度控制</b><small>{powerMode?'拖越遠越有力':'固定力量'}</small></span><input aria-label="力度控制" type="checkbox" checked={powerMode} onChange={e=>setPowerMode(e.target.checked)}/><i/></label></div>
    <div className="canvas-wrap"><canvas ref={canvasRef} onPointerDown={e=>pointer(e,'down')} onPointerMove={e=>pointer(e,'move')} onPointerUp={e=>pointer(e,'up')} onPointerCancel={e=>pointer(e,'up')} aria-label="左右拖動選擇位置，放開發射果汁杯"/><div className="next-pill">下一杯 <span style={{background:JUICES[nextLevel].color}}>{JUICES[nextLevel].emoji}</span></div>{gameOver&&<div className="game-over"><span>本局完成</span><h2>{score.toLocaleString()} 分</h2><p>杯子碰到發射線了</p><button onClick={reset}>再玩一次</button></div>}</div>
    <div className="hint"><span>☝️</span><p><b>{angleMode?'拖曳瞄準，放開發射':'左右移動杯子，放開直線發射'}</b><small>兩個相同果汁杯碰撞，就會融合升級</small></p><em>{shots} 杯</em></div>
    <section className="merge-guide"><div className="guide-title"><div><span>融合圖鑑</span><small>相同＋相同＝下一級</small></div><b>{unlocked+1}/{JUICES.length} 解鎖</b></div><div className="upgrade-row">{JUICES.map((j,i)=><div className={`juice-level ${i<=unlocked?'open':'locked'}`} key={j.name}><div className="mini-cup" style={{'--juice':j.color,'--juice-dark':j.dark} as React.CSSProperties}>{i<=unlocked?j.emoji:'?'}</div><span>Lv.{i+1}</span><small>{i<=unlocked?j.name:'尚未解鎖'}</small>{i<JUICES.length-1&&<i>›</i>}</div>)}</div></section>
  </section></main>;
}
