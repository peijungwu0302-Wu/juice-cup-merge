'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const JUICES = [
  { name: '檸檬露', color: '#ffe775', dark: '#d8ac24', emoji: '🍋' },
  { name: '蜜柑汁', color: '#ffac47', dark: '#e86b18', emoji: '🍊' },
  { name: '草莓乳', color: '#ff708d', dark: '#d62e55', emoji: '🍓' },
  { name: '葡萄冰', color: '#a87af0', dark: '#6131a9', emoji: '🍇' },
  { name: '哈密瓜', color: '#75d999', dark: '#248d56', emoji: '🍈' },
  { name: '西瓜蘇打', color: '#ff5369', dark: '#c51e3b', emoji: '🍉' },
  { name: '彩虹果昔', color: '#5cdce1', dark: '#168eaa', emoji: '🌈' },
];

type Cup = { id:number; x:number; y:number; vx:number; vy:number; level:number; r:number; still:number };
type Burst = { x:number; y:number; life:number; color:string };
type Aim = { launchX:number; originX:number; originY:number; angle:number; drag:number; active:boolean };

const radiusFor = (level:number) => 22 + level * 4.9;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cupsRef = useRef<Cup[]>([]), burstsRef = useRef<Burst[]>([]), nextId = useRef(1);
  const sizeRef = useRef({w:390,h:700,dpr:1});
  const aimRef = useRef<Aim>({launchX:195,originX:195,originY:0,angle:0,drag:0,active:false});
  const runningRef = useRef(true), nextLevelRef = useRef(0);
  const optionsRef = useRef({angle:false,power:false,levels:false,line:150});

  const [score,setScore] = useState(0), [best,setBest] = useState(0), [shots,setShots] = useState(0);
  const [nextLevel,setNextLevel] = useState(0), [unlocked,setUnlocked] = useState(0), [gameOver,setGameOver] = useState(false);
  const [settingsOpen,setSettingsOpen] = useState(false), [angleMode,setAngleMode] = useState(false), [powerMode,setPowerMode] = useState(false);
  const [showLevels,setShowLevels] = useState(false), [aimLine,setAimLine] = useState(150);

  useEffect(()=>{
    const saved = localStorage.getItem('juice-settings');
    if(saved){try{const s=JSON.parse(saved);setAngleMode(!!s.angle);setPowerMode(!!s.power);setShowLevels(!!s.levels);setAimLine(Number.isFinite(s.line)?s.line:150)}catch{}}
    setBest(Number(localStorage.getItem('juice-best')||0));
  },[]);
  useEffect(()=>{
    optionsRef.current={angle:angleMode,power:powerMode,levels:showLevels,line:aimLine};
    localStorage.setItem('juice-settings',JSON.stringify(optionsRef.current));
  },[angleMode,powerMode,showLevels,aimLine]);

  const reset = useCallback(()=>{
    cupsRef.current=[];burstsRef.current=[];runningRef.current=true;nextLevelRef.current=0;
    setScore(0);setShots(0);setNextLevel(0);setUnlocked(0);setGameOver(false);
  },[]);
  useEffect(()=>reset(),[reset]);

  const queueNext = () => {
    const n=Math.random()<.8?0:1;nextLevelRef.current=n;setNextLevel(n);
  };
  const fire = useCallback(()=>{
    if(!runningRef.current)return;
    const {w,h}=sizeRef.current,o=optionsRef.current,a=aimRef.current;
    const angle=o.angle?a.angle:0;
    const speed=o.power?Math.max(5.7,Math.min(10.2,5.7+a.drag/34)):7.6;
    const level=nextLevelRef.current;
    cupsRef.current.push({id:nextId.current++,x:Math.max(28,Math.min(w-28,a.launchX)),y:h-35,vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,level,r:radiusFor(level),still:0});
    setShots(s=>s+1);queueNext();
  },[]);

  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    let raf=0,last=performance.now();
    const resize=()=>{const b=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(b.width*dpr);canvas.height=Math.round(b.height*dpr);sizeRef.current={w:b.width,h:b.height,dpr};aimRef.current.launchX=Math.max(28,Math.min(b.width-28,aimRef.current.launchX||b.width/2))};
    resize();const ro=new ResizeObserver(resize);ro.observe(canvas);

    const drawCup=(c:Cup)=>{
      const j=JUICES[c.level],r=c.r;
      ctx.save();ctx.translate(c.x,c.y);
      ctx.fillStyle='#3c291c2d';ctx.beginPath();ctx.ellipse(2,r*.25,r*1.02,r*.68,0,0,Math.PI*2);ctx.fill();
      const glass=ctx.createRadialGradient(-r*.45,-r*.5,1,0,0,r*1.08);glass.addColorStop(0,'#ffffffee');glass.addColorStop(.26,'#ffffff55');glass.addColorStop(.67,'#d9f4f233');glass.addColorStop(1,'#8cb6b955');ctx.fillStyle=glass;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      const juice=ctx.createRadialGradient(-r*.27,-r*.32,2,0,0,r*.83);juice.addColorStop(0,'#ffffff88');juice.addColorStop(.2,j.color);juice.addColorStop(1,j.dark);ctx.fillStyle=juice;ctx.beginPath();ctx.arc(0,1,r*.78,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ffffff54';ctx.beginPath();ctx.ellipse(-r*.18,-r*.38,r*.18,r*.09,-.4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#ffffffd9';ctx.lineWidth=Math.max(2.5,r*.105);ctx.beginPath();ctx.arc(0,0,r*.92,Math.PI*.08,Math.PI*1.92);ctx.stroke();
      ctx.strokeStyle='#54777c66';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,1,r*.81,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#ffffffc7';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.arc(-r*.02,0,r*.69,Math.PI*.83,Math.PI*1.29);ctx.stroke();
      if(optionsRef.current.levels){ctx.fillStyle='#fff';ctx.shadowColor='#331e1777';ctx.shadowBlur=3;ctx.font=`800 ${Math.max(11,r*.53)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(c.level+1),0,2)}
      ctx.restore();
    };

    const loop=(now:number)=>{
      const dt=Math.min(2,(now-last)/16.67);last=now;const {w,h,dpr}=sizeRef.current;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const floor=ctx.createLinearGradient(0,0,0,h);floor.addColorStop(0,'#dbeecf');floor.addColorStop(.5,'#eff1ce');floor.addColorStop(1,'#f7dfb9');ctx.fillStyle=floor;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#ba966d24';ctx.lineWidth=1;for(let y=38;y<h;y+=68){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
      ctx.fillStyle='#a97551';ctx.fillRect(0,0,w,15);ctx.fillStyle='#fff9';ctx.fillRect(0,15,w,4);
      const dangerY=h-71;ctx.strokeStyle='#c16e4c55';ctx.lineWidth=1.5;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(0,dangerY);ctx.lineTo(w,dangerY);ctx.stroke();ctx.setLineDash([]);

      const cups=cupsRef.current;
      for(const c of cups){
        c.vy-=.012*dt;const friction=Math.pow(.982,dt);c.vx*=friction;c.vy*=friction;c.x+=c.vx*dt;c.y+=c.vy*dt;
        if(c.x-c.r<4){c.x=c.r+4;c.vx=Math.abs(c.vx)*.18}if(c.x+c.r>w-4){c.x=w-c.r-4;c.vx=-Math.abs(c.vx)*.18}
        if(c.y-c.r<19){c.y=c.r+19;c.vy=Math.max(0,c.vy*.06);c.vx*=.86}if(c.y+c.r>h){c.y=h-c.r;c.vy=-Math.abs(c.vy)*.08}
        if(Math.hypot(c.vx,c.vy)<.09)c.still+=dt;else c.still=0;
      }
      const remove=new Set<number>(),add:Cup[]=[];
      for(let i=0;i<cups.length;i++)for(let k=i+1;k<cups.length;k++){
        const a=cups[i],b=cups[k];if(remove.has(a.id)||remove.has(b.id))continue;
        const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||.01,min=a.r+b.r;if(dist>=min)continue;
        const nx=dx/dist,ny=dy/dist,overlap=min-dist,ma=a.r*a.r,mb=b.r*b.r,total=ma+mb;
        a.x-=nx*overlap*(mb/total);a.y-=ny*overlap*(mb/total);b.x+=nx*overlap*(ma/total);b.y+=ny*overlap*(ma/total);
        const rvx=b.vx-a.vx,rvy=b.vy-a.vy,normal=rvx*nx+rvy*ny;
        if(normal<0){const impulse=-(1+.12)*normal/(1/ma+1/mb);a.vx-=impulse*nx/ma;a.vy-=impulse*ny/ma;b.vx+=impulse*nx/mb;b.vy+=impulse*ny/mb;const tx=-ny,ty=nx,tangent=(b.vx-a.vx)*tx+(b.vy-a.vy)*ty,fric=Math.max(-.1*impulse,Math.min(.1*impulse,-tangent/(1/ma+1/mb)));a.vx-=fric*tx/ma;a.vy-=fric*ty/ma;b.vx+=fric*tx/mb;b.vy+=fric*ty/mb}
        if(a.level===b.level&&a.level<JUICES.length-1){
          remove.add(a.id);remove.add(b.id);const nl=a.level+1,x=(a.x+b.x)/2,y=(a.y+b.y)/2;
          add.push({id:nextId.current++,x,y,vx:(a.vx*ma+b.vx*mb)/total,vy:(a.vy*ma+b.vy*mb)/total,level:nl,r:radiusFor(nl),still:0});burstsRef.current.push({x,y,life:1,color:JUICES[nl].color});
          const gain=(nl+1)*100;setScore(s=>{const n=s+gain;setBest(old=>{const v=Math.max(old,n);localStorage.setItem('juice-best',String(v));return v});return n});setUnlocked(u=>Math.max(u,nl));
        }
      }
      if(remove.size)cupsRef.current=cups.filter(c=>!remove.has(c.id)).concat(add);
      for(const b of burstsRef.current){b.life-=.04*dt;ctx.globalAlpha=Math.max(0,b.life);ctx.strokeStyle=b.color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(b.x,b.y,20+(1-b.life)*30,0,Math.PI*2);ctx.stroke()}ctx.globalAlpha=1;burstsRef.current=burstsRef.current.filter(b=>b.life>0);
      for(const c of cupsRef.current)drawCup(c);

      const a=aimRef.current,o=optionsRef.current,launchY=h-34,line=o.line;
      if(runningRef.current){
        if(line>0){ctx.strokeStyle='#65452ca8';ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.beginPath();ctx.moveTo(a.launchX,launchY);ctx.lineTo(a.launchX+Math.sin(a.angle)*line,launchY-Math.cos(a.angle)*line);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#65452c';ctx.beginPath();ctx.arc(a.launchX+Math.sin(a.angle)*line,launchY-Math.cos(a.angle)*line,3,0,Math.PI*2);ctx.fill()}
        drawCup({id:-1,x:a.launchX,y:launchY,vx:0,vy:0,level:nextLevelRef.current,r:radiusFor(nextLevelRef.current),still:0});
      }
      if(cupsRef.current.some(c=>c.y+c.r>dangerY&&c.still>65)&&runningRef.current){runningRef.current=false;setGameOver(true)}
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);return()=>{cancelAnimationFrame(raf);ro.disconnect()};
  },[]);

  const pointer=(e:React.PointerEvent<HTMLCanvasElement>,phase:'down'|'move'|'up')=>{
    e.preventDefault();if(settingsOpen||!runningRef.current)return;
    const b=e.currentTarget.getBoundingClientRect(),x=Math.max(28,Math.min(b.width-28,e.clientX-b.left)),y=e.clientY-b.top,a=aimRef.current,o=optionsRef.current;
    if(phase==='down'){a.launchX=x;a.originX=x;a.originY=y;a.angle=0;a.drag=0;a.active=true;e.currentTarget.setPointerCapture(e.pointerId)}
    else if(phase==='move'&&a.active){const dx=x-a.originX,up=Math.max(20,a.originY-y);a.drag=Math.hypot(dx,a.originY-y);if(o.angle)a.angle=Math.max(-.82,Math.min(.82,Math.atan2(dx,up)));else a.angle=0;if(!o.angle&&!o.power)a.launchX=x}
    else if(phase==='up'&&a.active){a.active=false;fire()}
  };

  return <main className="app-shell"><section className="game-card" aria-label="果汁杯融合遊戲">
    <header className="hud">
      <div className="hud-stat"><small>分數</small><strong>{score.toLocaleString()}</strong></div>
      <div className="next-cup"><small>下一杯</small><span style={{'--juice':JUICES[nextLevel].color,'--dark':JUICES[nextLevel].dark} as React.CSSProperties}>{JUICES[nextLevel].emoji}</span></div>
      <div className="hud-stat cups-count"><small>已投</small><strong>{shots}<em>杯</em></strong></div>
      <button className="settings-button" onClick={()=>setSettingsOpen(true)} aria-label="開啟設定">⚙</button>
    </header>
    <div className="playfield"><canvas ref={canvasRef} onPointerDown={e=>pointer(e,'down')} onPointerMove={e=>pointer(e,'move')} onPointerUp={e=>pointer(e,'up')} onPointerCancel={e=>pointer(e,'up')} aria-label="選擇起始位置並發射果汁杯"/>
      {gameOver&&<div className="game-over"><small>本局分數</small><h2>{score.toLocaleString()}</h2><p>最高 {best.toLocaleString()}</p><button onClick={reset}>再玩一次</button></div>}
    </div>
    <section className="merge-strip" aria-label="融合升級順序"><div className="strip-label"><b>融合</b><small>{unlocked+1}/7</small></div>{JUICES.map((j,i)=><div className={`guide-cup ${i<=unlocked?'unlocked':'locked'}`} key={j.name} title={`第 ${i+1} 級：${j.name}`}><span style={{'--juice':j.color,'--dark':j.dark} as React.CSSProperties}>{j.emoji}</span>{i<JUICES.length-1&&<i>›</i>}</div>)}</section>
    {settingsOpen&&<div className="modal-backdrop" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><section className="settings-sheet" role="dialog" aria-modal="true" aria-label="遊戲設定"><header><div><small>遊戲設定</small><h2>調整操作方式</h2></div><button onClick={()=>setSettingsOpen(false)} aria-label="關閉設定">×</button></header>
      <div className="setting-list">
        <SettingToggle title="角度瞄準" note="按下位置決定起點，拖曳調整角度" checked={angleMode} onChange={setAngleMode}/>
        <SettingToggle title="力度控制" note="拖曳距離決定發射力量" checked={powerMode} onChange={setPowerMode}/>
        <SettingToggle title="顯示杯子等級" note="在杯中顯示 1、2、3…" checked={showLevels} onChange={setShowLevels}/>
        <label className="range-setting"><div><span><b>瞄準線長度</b><small>設為 0 可完全隱藏</small></span><output>{aimLine}</output></div><input type="range" min="0" max="240" step="10" value={aimLine} onChange={e=>setAimLine(Number(e.target.value))}/></label>
      </div><button className="done-button" onClick={()=>setSettingsOpen(false)}>完成</button>
    </section></div>}
  </section></main>;
}

function SettingToggle({title,note,checked,onChange}:{title:string;note:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="setting-row"><span><b>{title}</b><small>{note}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></label>;
}
