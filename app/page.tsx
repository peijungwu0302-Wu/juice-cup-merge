'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const WORLD_W=340, WORLD_H=640;
const LEVELS=[
  {name:'檸檬露',color:'#f8d53c',dark:'#c28a12',emoji:'🍋'},
  {name:'蜜柑汁',color:'#ff9d2f',dark:'#d95a10',emoji:'🍊'},
  {name:'草莓乳',color:'#ff6986',dark:'#cf244a',emoji:'🍓'},
  {name:'葡萄冰',color:'#9964df',dark:'#582397',emoji:'🍇'},
  {name:'哈密瓜',color:'#62cf80',dark:'#21874d',emoji:'🌿'},
  {name:'西瓜蘇打',color:'#fb5268',dark:'#bf1836',emoji:'🍉'},
  {name:'彩虹果昔',color:'#55dbe0',dark:'#14889f',emoji:'🌈'},
];
const SIZE_CURVE=[1,1.11,1.18,1.32,1.49,1.69,1.92];
type Theme='juice'|'sundae'|'wine';
type Settings={angle:boolean;power:boolean;levels:boolean;theme:Theme;aimLength:number;bounces:boolean;sound:boolean;vibration:boolean;maxAngle:number;fixedSpeed:number;wallRest:number;frontRest:number;cupRest:number;drag:number;slope:number;size:number;throwThreshold:number;gameOverMs:number;blastRadius:number;blastForce:number};
const DEFAULTS:Settings={angle:false,power:false,levels:false,theme:'juice',aimLength:1500,bounces:true,sound:false,vibration:false,maxAngle:85,fixedSpeed:7.4,wallRest:.72,frontRest:.06,cupRest:.11,drag:.982,slope:.012,size:1,throwThreshold:65,gameOverMs:1200,blastRadius:138,blastForce:4.2};
type Cup={id:number;x:number;y:number;vx:number;vy:number;level:number;r:number;dangerMs:number;ageMs:number;safeExited:boolean};
type Burst={x:number;y:number;life:number;color:string;maxR:number};
type Aim={x:number;angle:number;locked:boolean};
type Gesture={active:boolean;mode:'setup'|'throw'|'direct';pointerId:number;originX:number;originY:number;lastX:number;lastY:number;positionLocked:boolean;samples:Array<{y:number;t:number}>};
type Pred={paths:Array<Array<{x:number;y:number}>>;lastCalc:number};

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const themeIcon=(t:Theme)=>t==='juice'?'🥤':t==='sundae'?'🍨':'🍷';

export default function Home(){
  const canvasRef=useRef<HTMLCanvasElement>(null),cupsRef=useRef<Cup[]>([]),burstsRef=useRef<Burst[]>([]),idRef=useRef(1);
  const settingsRef=useRef<Settings>(DEFAULTS),runningRef=useRef(true),safeUntilRef=useRef(0),lastShotRef=useRef(0),revivesRef=useRef(0);
  const aimRef=useRef<Aim>({x:0,angle:0,locked:false}),gestureRef=useRef<Gesture>({active:false,mode:'direct',pointerId:0,originX:0,originY:0,lastX:0,lastY:0,positionLocked:false,samples:[]});
  const sizeRef=useRef({w:390,h:700,dpr:1}),queueRef=useRef<number[]>([0,0]),bagRef=useRef<number[]>([]),lastPowerRef=useRef(9),predictionRef=useRef<Pred>({paths:[],lastCalc:0});
  const [settings,setSettings]=useState<Settings>(DEFAULTS),[settingsOpen,setSettingsOpen]=useState(false),[gameOver,setGameOver]=useState(false),[aimLocked,setAimLocked]=useState(false);
  const [score,setScore]=useState(0),[best,setBest]=useState(0),[bestClean,setBestClean]=useState(0),[shots,setShots]=useState(0),[revives,setRevives]=useState(0);
  const [orders,setOrders]=useState(0),[lifetimeOrders,setLifetimeOrders]=useState(0),[queue,setQueue]=useState<number[]>([0,0]),[unlocked,setUnlocked]=useState(0),[powerPreview,setPowerPreview]=useState(0);

  useEffect(()=>{
    const raw=localStorage.getItem('juice-v3-settings');if(raw){try{setSettings({...DEFAULTS,...JSON.parse(raw)})}catch{}}
    setBest(Number(localStorage.getItem('juice-best')||0));setBestClean(Number(localStorage.getItem('juice-best-clean')||0));setLifetimeOrders(Number(localStorage.getItem('juice-orders')||0));
  },[]);
  useEffect(()=>{settingsRef.current=settings;localStorage.setItem('juice-v3-settings',JSON.stringify(settings));predictionRef.current.lastCalc=0},[settings]);

  const drawBag=useCallback(()=>{
    if(!bagRef.current.length){const a=[0,0,0,0,0,0,1,1];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}bagRef.current=a}
    return bagRef.current.shift()??0;
  },[]);
  const resetAim=()=>{aimRef.current={x:0,angle:0,locked:false};setAimLocked(false);predictionRef.current.lastCalc=0};
  const reset=useCallback(()=>{
    cupsRef.current=[];burstsRef.current=[];runningRef.current=true;safeUntilRef.current=0;revivesRef.current=0;bagRef.current=[];resetAim();
    const q=[drawBag(),drawBag()];queueRef.current=q;setQueue(q);setScore(0);setShots(0);setRevives(0);setOrders(0);setUnlocked(0);setGameOver(false);setPowerPreview(0);
  },[drawBag]);
  useEffect(()=>reset(),[reset]);

  const award=useCallback((points:number)=>{
    setScore(old=>{const n=old+points;setBest(b=>{const v=Math.max(b,n);localStorage.setItem('juice-best',String(v));return v});if(revivesRef.current===0)setBestClean(b=>{const v=Math.max(b,n);localStorage.setItem('juice-best-clean',String(v));return v});return n});
  },[]);
  const signal=(strong=false)=>{const s=settingsRef.current;if(s.vibration&&navigator.vibrate)navigator.vibrate(strong?[28,25,45]:18);if(s.sound){try{const AC=window.AudioContext||(window as typeof window&{webkitAudioContext:typeof AudioContext}).webkitAudioContext,ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=strong?210:480;g.gain.setValueAtTime(.05,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.18);o.start();o.stop(ac.currentTime+.18)}catch{}}};
  const radiusFor=(level:number)=>19*SIZE_CURVE[level]*settingsRef.current.size;

  const fire=useCallback((power:number)=>{
    const now=performance.now();if(!runningRef.current||now-lastShotRef.current<50)return;lastShotRef.current=now;
    const s=settingsRef.current,a=aimRef.current,level=queueRef.current[0],speed=s.power?power:s.fixedSpeed;
    cupsRef.current.push({id:idRef.current++,x:a.x,y:WORLD_H-26,vx:Math.sin(a.angle)*speed,vy:-Math.cos(a.angle)*speed,level,r:radiusFor(level),dangerMs:0,ageMs:0,safeExited:false});
    lastPowerRef.current=speed;setShots(v=>v+1);const q=[queueRef.current[1],drawBag()];queueRef.current=q;setQueue(q);resetAim();setPowerPreview(0);signal(false);
  },[drawBag]);

  const revive=()=>{
    const sorted=[...cupsRef.current].sort((a,b)=>b.y-a.y),remove=new Set(sorted.slice(0,3).map(c=>c.id));cupsRef.current=cupsRef.current.filter(c=>!remove.has(c.id));
    for(const c of cupsRef.current){c.y=Math.max(c.r+6,c.y-38);c.dangerMs=0;c.ageMs=1000;c.safeExited=true;c.vy-=.4}
    revivesRef.current+=1;setRevives(revivesRef.current);safeUntilRef.current=performance.now()+3000;runningRef.current=true;setGameOver(false);resetAim();
  };

  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;let raf=0,last=performance.now();
    const resize=()=>{const b=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(b.width*dpr);canvas.height=Math.round(b.height*dpr);sizeRef.current={w:b.width,h:b.height,dpr}};
    resize();const ro=new ResizeObserver(resize);ro.observe(canvas);
    const geom=()=>{const {w,h}=sizeRef.current;return{cx:w/2,farY:42,nearY:h-8,farHalf:w*.275,nearHalf:w*.48}};
    const project=(x:number,y:number)=>{const g=geom(),t=clamp(y/WORLD_H,0,1),half=g.farHalf+(g.nearHalf-g.farHalf)*t;return{x:g.cx+(x/(WORLD_W/2))*half,y:g.farY+(g.nearY-g.farY)*t,scale:.6+.4*t}};

    const simulate=(speed:number)=>{
      const s=settingsRef.current,a=aimRef.current,pts:Array<{x:number;y:number}>=[],r=radiusFor(queueRef.current[0]);let x=a.x,y=WORLD_H-26,vx=Math.sin(a.angle)*speed,vy=-Math.cos(a.angle)*speed,travel=0,bounces=0;
      for(let i=0;i<360&&pts.length<180&&travel<s.aimLength;i++){
        const dt=.72;vy-=s.slope*dt;const f=Math.pow(s.drag,dt);vx*=f;vy*=f;const ox=x,oy=y;x+=vx*dt;y+=vy*dt;travel+=Math.hypot(x-ox,y-oy);
        if(x-r<-WORLD_W/2){x=-WORLD_W/2+r;vx=Math.abs(vx)*s.wallRest;bounces++;if(!s.bounces)break}else if(x+r>WORLD_W/2){x=WORLD_W/2-r;vx=-Math.abs(vx)*s.wallRest;bounces++;if(!s.bounces)break}
        if(y-r<0){y=r;vy=Math.abs(vy)*s.frontRest;bounces++;if(!s.bounces)break}
        if(i%2===0)pts.push({x,y});
        if(cupsRef.current.some(c=>Math.hypot(c.x-x,c.y-y)<c.r+r))break;
        if(bounces>8)break;
      }return pts;
    };
    const recalcPred=(now:number)=>{const s=settingsRef.current;if(s.aimLength<=0){predictionRef.current.paths=[];return}if(now-predictionRef.current.lastCalc<100)return;predictionRef.current.lastCalc=now;predictionRef.current.paths=s.power?[simulate(6.5),simulate(lastPowerRef.current||9),simulate(12.2)]:[simulate(s.fixedSpeed)]};

    const glassShadow=(x:number,y:number,w:number)=>{ctx.fillStyle='#3d291d2d';ctx.beginPath();ctx.ellipse(x+w*.08,y+2,w*.53,w*.16,-.08,0,Math.PI*2);ctx.fill()};
    const glassOutline=(path:Path2D)=>{ctx.fillStyle='#eefcfa30';ctx.fill(path);ctx.strokeStyle='#ffffffdf';ctx.lineWidth=2.2;ctx.stroke(path);ctx.strokeStyle='#56757970';ctx.lineWidth=.8;ctx.stroke(path)};
    const garnish=(level:number,x:number,y:number,w:number)=>{
      ctx.save();if(level===0){ctx.fillStyle='#ffe344';ctx.strokeStyle='#d1a20c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x+w*.33,y,w*.16,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(x+w*.33,y);ctx.lineTo(x+w*.46,y);ctx.stroke()}
      if(level===1){ctx.strokeStyle='#f7f0df';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+w*.24,y+w*.05);ctx.lineTo(x+w*.38,y-w*.62);ctx.stroke();ctx.strokeStyle='#ef5e35';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([])}
      if(level===2){ctx.fillStyle='#ff4866';for(const dx of[-.2,.12]){ctx.beginPath();ctx.arc(x+w*dx,y-w*.04,w*.1,0,Math.PI*2);ctx.fill()}}
      if(level===3){ctx.fillStyle='#d9bbff';for(const p of[[-.18,-.05],[.18,.06],[0,.15]]){ctx.beginPath();ctx.arc(x+w*p[0],y+w*p[1],w*.045,0,Math.PI*2);ctx.fill()}}
      if(level===4){ctx.fillStyle='#39a953';ctx.beginPath();ctx.ellipse(x-w*.1,y-w*.13,w*.15,w*.07,-.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+w*.09,y-w*.16,w*.15,w*.07,.45,0,Math.PI*2);ctx.fill()}
      if(level===5){ctx.fillStyle='#fa4057';ctx.strokeStyle='#247744';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+w*.13,y-w*.18);ctx.lineTo(x+w*.48,y+w*.02);ctx.lineTo(x+w*.34,y-w*.34);ctx.closePath();ctx.fill();ctx.stroke()}
      if(level===6){ctx.fillStyle='#d52b3f';ctx.beginPath();ctx.arc(x,y-w*.22,w*.105,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#3d8d4f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-w*.31);ctx.quadraticCurveTo(x+w*.08,y-w*.48,x+w*.18,y-w*.43);ctx.stroke()}
      ctx.restore();
    };
    const levelNumber=(level:number,x:number,y:number,w:number)=>{if(!settingsRef.current.levels)return;ctx.save();ctx.fillStyle='#fff';ctx.shadowColor='#32180b99';ctx.shadowBlur=4;ctx.font=`800 ${Math.max(11,w*.25)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(level+1),x,y);ctx.restore()};
    const drawJuice=(c:Cup)=>{const p=project(c.x,c.y),j=LEVELS[c.level],w=c.r*2.2*p.scale,h=w*1.43,top=p.y-h,bot=p.y,bh=w*.34,th=w*.51;glassShadow(p.x,p.y,w);
      const body=new Path2D();body.moveTo(p.x-th,top);body.quadraticCurveTo(p.x-th*.92,top+h*.55,p.x-bh,bot);body.quadraticCurveTo(p.x,bot+w*.06,p.x+bh,bot);body.quadraticCurveTo(p.x+th*.92,top+h*.55,p.x+th,top);body.closePath();
      ctx.save();ctx.clip(body);if(c.level===6){const cols=['#ef495d','#ff9d28','#ffe047','#59c777','#4aaee8','#8d58d2'];cols.forEach((col,i)=>{ctx.fillStyle=col;ctx.fillRect(p.x-th,top+h*.2+i*h*.12,w,h*.13)})}else{const gr=ctx.createLinearGradient(0,top,0,bot);gr.addColorStop(0,j.color+'dd');gr.addColorStop(1,j.dark+'f2');ctx.fillStyle=gr;ctx.fillRect(p.x-th,top+h*.2,w,h*.78)}ctx.fillStyle='#ffffff30';ctx.fillRect(p.x-w*.29,top,w*.11,h);ctx.restore();glassOutline(body);
      ctx.fillStyle=j.color;ctx.globalAlpha=.88;ctx.beginPath();ctx.ellipse(p.x,top+h*.2,th*.92,w*.13,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#ffffffeb';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(p.x,top,th,w*.16,0,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#6d929366';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,top+h*.02,th*.9,w*.13,0,0,Math.PI*2);ctx.stroke();garnish(c.level,p.x,top,w);levelNumber(c.level,p.x,top+h*.62,w)};
    const drawSundae=(c:Cup)=>{const p=project(c.x,c.y),j=LEVELS[c.level],w=c.r*2.35*p.scale,h=w*1.55,top=p.y-h,bowlY=top+h*.42;glassShadow(p.x,p.y,w);
      ctx.strokeStyle='#eaffffdd';ctx.lineWidth=Math.max(2,w*.045);ctx.beginPath();ctx.moveTo(p.x,top+h*.36);ctx.quadraticCurveTo(p.x-w*.36,bowlY,p.x-w*.18,top+h*.75);ctx.quadraticCurveTo(p.x,top+h*.88,p.x+w*.18,top+h*.75);ctx.quadraticCurveTo(p.x+w*.36,bowlY,p.x,top+h*.36);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,top+h*.78);ctx.lineTo(p.x,p.y-w*.08);ctx.ellipse(p.x,p.y,w*.3,w*.08,0,0,Math.PI*2);ctx.stroke();
      const scoops=Math.min(3,1+Math.floor(c.level/2));for(let i=0;i<scoops;i++){ctx.fillStyle=i%2?j.dark:j.color;ctx.beginPath();ctx.arc(p.x+(i-(scoops-1)/2)*w*.2,top+h*.35-(i%2)*w*.08,w*.23,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff8';ctx.stroke()}
      ctx.fillStyle='#fff4dc';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(p.x+(i-1)*w*.11,top+h*(.18-i*.045),w*(.16-i*.02),0,Math.PI*2);ctx.fill()}garnish(c.level,p.x,top+h*.08,w);levelNumber(c.level,p.x,bowlY+w*.13,w)};
    const drawWine=(c:Cup)=>{const p=project(c.x,c.y),j=LEVELS[c.level],w=c.r*2.3*p.scale,h=w*1.7,top=p.y-h;glassShadow(p.x,p.y,w);const bowl=new Path2D();bowl.moveTo(p.x-w*.48,top);bowl.bezierCurveTo(p.x-w*.42,top+h*.38,p.x-w*.24,top+h*.58,p.x,top+h*.62);bowl.bezierCurveTo(p.x+w*.24,top+h*.58,p.x+w*.42,top+h*.38,p.x+w*.48,top);bowl.closePath();
      ctx.save();ctx.clip(bowl);if(c.level===6){const cols=['#ef4e62','#ff9e2f','#ffe050','#54c675','#48a9df','#8d60db'];cols.forEach((col,i)=>{ctx.fillStyle=col;ctx.fillRect(p.x-w*.5,top+h*.15+i*h*.07,w,h*.08)})}else{ctx.fillStyle=j.color;ctx.globalAlpha=.85;ctx.fillRect(p.x-w*.5,top+h*.23,w,h*.42);ctx.globalAlpha=1}ctx.restore();glassOutline(bowl);ctx.strokeStyle='#eaffffdf';ctx.lineWidth=2.2;ctx.beginPath();ctx.ellipse(p.x,top,w*.48,w*.13,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,top+h*.61);ctx.lineTo(p.x,p.y-w*.08);ctx.ellipse(p.x,p.y,w*.34,w*.075,0,0,Math.PI*2);ctx.stroke();garnish(c.level,p.x,top,w);levelNumber(c.level,p.x,top+h*.4,w)};
    const drawCup=(c:Cup)=>{const t=settingsRef.current.theme;if(t==='juice')drawJuice(c);else if(t==='sundae')drawSundae(c);else drawWine(c)};

    const loop=(now:number)=>{
      const dt=Math.min(2,(now-last)/16.67);last=now;const {w,h,dpr}=sizeRef.current,g=geom(),s=settingsRef.current;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#9c6138');bg.addColorStop(.12,'#e7c184');bg.addColorStop(1,'#f7e6bd');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#704027';ctx.fillRect(g.cx-g.farHalf-11,10,g.farHalf*2+22,42);ctx.fillStyle='#b57a46';ctx.fillRect(g.cx-g.farHalf,22,g.farHalf*2,29);ctx.fillStyle='#f7dfac';ctx.fillRect(g.cx-g.farHalf+10,34,g.farHalf*2-20,4);
      const floor=new Path2D();floor.moveTo(g.cx-g.farHalf,g.farY);floor.lineTo(g.cx+g.farHalf,g.farY);floor.lineTo(g.cx+g.nearHalf,g.nearY);floor.lineTo(g.cx-g.nearHalf,g.nearY);floor.closePath();const fg=ctx.createLinearGradient(0,g.farY,0,g.nearY);fg.addColorStop(0,'#e8f1cc');fg.addColorStop(.52,'#f4e7ba');fg.addColorStop(1,'#f6dca6');ctx.fillStyle=fg;ctx.fill(floor);
      for(let yy=35;yy<WORLD_H;yy+=68){const l=project(-WORLD_W/2,yy),r=project(WORLD_W/2,yy);ctx.strokeStyle='#b78f5b25';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(r.x,r.y);ctx.stroke()}
      ctx.fillStyle='#8b532f';ctx.beginPath();ctx.moveTo(g.cx-g.farHalf-8,g.farY);ctx.lineTo(g.cx-g.farHalf,g.farY);ctx.lineTo(g.cx-g.nearHalf,g.nearY);ctx.lineTo(g.cx-g.nearHalf-12,g.nearY);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(g.cx+g.farHalf,g.farY);ctx.lineTo(g.cx+g.farHalf+8,g.farY);ctx.lineTo(g.cx+g.nearHalf+12,g.nearY);ctx.lineTo(g.cx+g.nearHalf,g.nearY);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffe7af';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(g.cx-g.farHalf,g.farY);ctx.lineTo(g.cx-g.nearHalf,g.nearY);ctx.stroke();ctx.beginPath();ctx.moveTo(g.cx+g.farHalf,g.farY);ctx.lineTo(g.cx+g.nearHalf,g.nearY);ctx.stroke();
      const danger=project(0,WORLD_H-72),dl=project(-WORLD_W/2,WORLD_H-72),dr=project(WORLD_W/2,WORLD_H-72);ctx.strokeStyle=now<safeUntilRef.current?'#3cae73aa':'#bd563f70';ctx.lineWidth=1.4;ctx.setLineDash([6,7]);ctx.beginPath();ctx.moveTo(dl.x,danger.y);ctx.lineTo(dr.x,danger.y);ctx.stroke();ctx.setLineDash([]);

      if(runningRef.current){for(const c of cupsRef.current){c.ageMs+=dt*16.67;c.vy-=s.slope*dt;const f=Math.pow(s.drag,dt);c.vx*=f;c.vy*=f;c.x+=c.vx*dt;c.y+=c.vy*dt;if(c.x-c.r<-WORLD_W/2){c.x=-WORLD_W/2+c.r;c.vx=Math.abs(c.vx)*s.wallRest}else if(c.x+c.r>WORLD_W/2){c.x=WORLD_W/2-c.r;c.vx=-Math.abs(c.vx)*s.wallRest}if(c.y-c.r<0){c.y=c.r;c.vy=Math.abs(c.vy)*s.frontRest;c.vx*=.86}if(c.y+c.r>WORLD_H){c.y=WORLD_H-c.r;c.vy=-Math.abs(c.vy)*.08}if(c.y+c.r<WORLD_H-72)c.safeExited=true;if((c.safeExited||c.ageMs>900)&&c.y+c.r>WORLD_H-72)c.dangerMs+=dt*16.67;else c.dangerMs=0}}
      const remove=new Set<number>(),add:Cup[]=[];const cups=cupsRef.current;
      if(runningRef.current)for(let i=0;i<cups.length;i++)for(let k=i+1;k<cups.length;k++){
        const a=cups[i],b=cups[k];if(remove.has(a.id)||remove.has(b.id))continue;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||.01,min=a.r+b.r;if(dist>=min)continue;const nx=dx/dist,ny=dy/dist,overlap=min-dist,ma=a.r*a.r,mb=b.r*b.r,total=ma+mb;a.x-=nx*overlap*(mb/total);a.y-=ny*overlap*(mb/total);b.x+=nx*overlap*(ma/total);b.y+=ny*overlap*(ma/total);
        const rvx=b.vx-a.vx,rvy=b.vy-a.vy,nv=rvx*nx+rvy*ny;if(nv<0){const imp=-(1+s.cupRest)*nv/(1/ma+1/mb);a.vx-=imp*nx/ma;a.vy-=imp*ny/ma;b.vx+=imp*nx/mb;b.vy+=imp*ny/mb}
        if(a.level===b.level){remove.add(a.id);remove.add(b.id);const x=(a.x+b.x)/2,y=(a.y+b.y)/2;if(a.level===6){
            let cleared=0;for(const c of cups){if(remove.has(c.id)||c.id===a.id||c.id===b.id)continue;const ex=c.x-x,ey=c.y-y,d=Math.hypot(ex,ey)||1;if(d<s.blastRadius){if(c.level<=2){remove.add(c.id);cleared++}else if(c.level<6){const force=(1-d/s.blastRadius)*s.blastForce;c.vx+=ex/d*force;c.vy+=ey/d*force}}}burstsRef.current.push({x,y,life:1,color:'#ffd75c',maxR:s.blastRadius});award(5000+cleared*250);setOrders(v=>v+1);setLifetimeOrders(v=>{const n=v+1;localStorage.setItem('juice-orders',String(n));return n});signal(true);
          }else{const nl=a.level+1;add.push({id:idRef.current++,x,y,vx:(a.vx*ma+b.vx*mb)/total,vy:(a.vy*ma+b.vy*mb)/total,level:nl,r:radiusFor(nl),dangerMs:0,ageMs:Math.max(a.ageMs,b.ageMs),safeExited:a.safeExited||b.safeExited});burstsRef.current.push({x,y,life:1,color:LEVELS[nl].color,maxR:52});award((nl+1)*120);setUnlocked(v=>Math.max(v,nl));signal(false)}}
      }
      if(remove.size)cupsRef.current=cupsRef.current.filter(c=>!remove.has(c.id)).concat(add);
      recalcPred(now);if(runningRef.current&&s.aimLength>0){const paths=predictionRef.current.paths;paths.forEach((path,idx)=>{ctx.strokeStyle=paths.length===1?'#684423b5':idx===1?'#684423b5':'#d27a4650';ctx.lineWidth=idx===1||paths.length===1?2:5;ctx.setLineDash(idx===1||paths.length===1?[7,6]:[3,8]);ctx.beginPath();path.forEach((pt,n)=>{const q=project(pt.x,pt.y);n?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.stroke()});ctx.setLineDash([])}
      const ordered=[...cupsRef.current].sort((a,b)=>a.y-b.y);for(const c of ordered)drawCup(c);
      for(const b of burstsRef.current){b.life-=.035*dt;const p=project(b.x,b.y),r=(1-b.life)*b.maxR*p.scale;ctx.globalAlpha=Math.max(0,b.life);ctx.strokeStyle=b.color;ctx.lineWidth=6;ctx.beginPath();ctx.arc(p.x,p.y-r*.2,r,0,Math.PI*2);ctx.stroke();for(let i=0;i<7;i++){const an=i/7*Math.PI*2,rr=r*1.15;ctx.fillStyle=i%2?'#fff1b0':b.color;ctx.beginPath();ctx.arc(p.x+Math.cos(an)*rr,p.y-r*.2+Math.sin(an)*rr,Math.max(2,5*b.life),0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}burstsRef.current=burstsRef.current.filter(b=>b.life>0);
      if(runningRef.current){drawCup({id:-1,x:aimRef.current.x,y:WORLD_H-19,vx:0,vy:0,level:queueRef.current[0],r:radiusFor(queueRef.current[0]),dangerMs:0,ageMs:0,safeExited:false});if(s.angle&&aimRef.current.locked){const base=project(aimRef.current.x,WORLD_H-19),len=58,ex=base.x+Math.sin(aimRef.current.angle)*len,ey=base.y-Math.cos(aimRef.current.angle)*len;ctx.fillStyle='#fff';ctx.strokeStyle='#9e6237';ctx.lineWidth=2;ctx.beginPath();ctx.arc(ex,ey,7,0,Math.PI*2);ctx.fill();ctx.stroke()}}
      if(runningRef.current&&performance.now()>safeUntilRef.current&&cupsRef.current.some(c=>c.dangerMs>=s.gameOverMs)){runningRef.current=false;setGameOver(true);signal(true)}
      raf=requestAnimationFrame(loop);
    };raf=requestAnimationFrame(loop);return()=>{cancelAnimationFrame(raf);ro.disconnect()};
  },[award]);

  const worldXFromScreen=(screenX:number,w:number)=>clamp((screenX-w/2)/(w*.48)*(WORLD_W/2),-WORLD_W/2+28,WORLD_W/2-28);
  const powerFromGesture=(g:Gesture,releaseY:number)=>{const s=settingsRef.current,dist=Math.max(0,g.originY-releaseY),samples=g.samples.filter(v=>performance.now()-v.t<130),first=samples[0],last=samples[samples.length-1];const vel=first&&last&&last.t>first.t?(first.y-last.y)/((last.t-first.t)/1000):0,d=clamp((dist-s.throwThreshold)/(220-s.throwThreshold),0,1),v=clamp((vel-350)/1250,0,1);return 6.5+(d*.7+v*.3)*5.7};
  const pointer=(e:React.PointerEvent<HTMLCanvasElement>,phase:'down'|'move'|'up')=>{
    e.preventDefault();if(settingsOpen||!runningRef.current)return;const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,g=gestureRef.current,s=settingsRef.current,a=aimRef.current,now=performance.now();
    if(phase==='down'){
      const baseX=rect.width/2+(a.x/(WORLD_W/2))*(rect.width*.48),baseY=rect.height-22,handleX=baseX+Math.sin(a.angle)*70,handleY=baseY-Math.cos(a.angle)*70,nearHandle=Math.hypot(x-baseX,y-baseY)<60||Math.hypot(x-handleX,y-handleY)<55;
      const mode:Gesture['mode']=s.angle?(a.locked&&!nearHandle?'throw':'setup'):'direct';Object.assign(g,{active:true,mode,pointerId:e.pointerId,originX:x,originY:y,lastX:x,lastY:y,positionLocked:false,samples:[{y,t:now}]});if(mode==='setup'||mode==='direct'){a.x=worldXFromScreen(x,rect.width);if(mode==='setup'&&!a.locked)a.angle=0}e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(!g.active||g.pointerId!==e.pointerId)return;if(phase==='move'){
      g.lastX=x;g.lastY=y;g.samples.push({y,t:now});g.samples=g.samples.filter(v=>now-v.t<160);const up=g.originY-y;
      if(g.mode==='setup'){if(up<16&&!g.positionLocked)a.x=worldXFromScreen(x,rect.width);else{g.positionLocked=true;const baseX=rect.width/2+(a.x/(WORLD_W/2))*(rect.width*.48),baseY=rect.height-22,max=s.maxAngle*Math.PI/180;a.angle=clamp(Math.atan2(x-baseX,Math.max(5,baseY-y)),-max,max)}predictionRef.current.lastCalc=0}
      if(g.mode==='direct'){if(up<18&&!g.positionLocked)a.x=worldXFromScreen(x,rect.width);else g.positionLocked=true;setPowerPreview(clamp(up/s.throwThreshold,0,1))}
      if(g.mode==='throw'){const p=powerFromGesture(g,y);setPowerPreview(clamp((p-6.5)/5.7,0,1))}return;
    }
    if(phase==='up'){g.active=false;const forward=g.originY-y;if(g.mode==='setup'){a.locked=true;setAimLocked(true);predictionRef.current.lastCalc=0;setPowerPreview(0);return}if(forward>=s.throwThreshold){const p=s.power?powerFromGesture(g,y):s.fixedSpeed;fire(p)}else setPowerPreview(0)};
  };

  const patchSettings=(p:Partial<Settings>)=>setSettings(v=>({...v,...p}));
  const preset=(kind:'stable'|'balanced'|'bounce')=>patchSettings(kind==='stable'?{wallRest:.4,cupRest:.06,drag:.978,slope:.014,fixedSpeed:7}:kind==='bounce'?{wallRest:.84,cupRest:.2,drag:.989,slope:.009,fixedSpeed:8.5}:{wallRest:.72,cupRest:.11,drag:.982,slope:.012,fixedSpeed:7.4});
  return <main className="app-shell"><section className="game-card" aria-label="果汁杯融合遊戲">
    <header className="hud"><div className="score-main"><small>分數</small><strong>{score.toLocaleString()}</strong><em>最高 {best.toLocaleString()} ・零復活 {bestClean.toLocaleString()}</em></div><div className="orders"><small>訂單</small><b>{orders}</b><em>累積 {lifetimeOrders}</em></div><div className="queue"><CupPreview label="下一杯" level={queue[0]} theme={settings.theme}/><i>›</i><CupPreview label="再下一杯" level={queue[1]} theme={settings.theme}/></div><button onClick={()=>setSettingsOpen(true)} aria-label="開啟設定">⚙</button></header>
    <div className="playfield"><canvas ref={canvasRef} onPointerDown={e=>pointer(e,'down')} onPointerMove={e=>pointer(e,'move')} onPointerUp={e=>pointer(e,'up')} onPointerCancel={e=>pointer(e,'up')} aria-label="定位、瞄準並投擲杯子"/>
      <div className="field-badges"><span>已投 {shots}</span>{revives>0&&<span>復活 {revives}</span>}</div>{settings.angle&&<div className={`aim-state ${aimLocked?'locked':''}`}>{aimLocked?'角度已鎖定・向前滑動投擲':'拖動杯子定位並瞄準'}</div>}
      {powerPreview>0&&<div className="power-meter"><i style={{height:`${Math.max(8,powerPreview*100)}%`}}/><span>{settings.power?'力度':'有效'}</span></div>}
      {gameOver&&<div className="game-over"><small>杯子越過危險線</small><h2>{score.toLocaleString()}</h2><p>本局訂單 {orders} ・復活 {revives} 次</p><div><button onClick={revive}>復活</button><button className="secondary" onClick={reset}>結算重來</button></div></div>}
    </div>
    <section className="merge-strip"><div className="strip-label"><b>融合</b><small>{unlocked+1}/7</small></div>{LEVELS.map((l,i)=><div className={`mini-level ${i<=unlocked?'':'future'}`} key={l.name} title={l.name}><span style={{'--juice':l.color,'--dark':l.dark} as React.CSSProperties}>{themeIcon(settings.theme)}</span>{i<6&&<i>›</i>}</div>)}<div className="blast-mark" title="最高級爆炸">💥</div></section>
    {settingsOpen&&<SettingsSheet s={settings} close={()=>setSettingsOpen(false)} patch={patchSettings} preset={preset}/>} 
  </section></main>;
}

function CupPreview({label,level,theme}:{label:string;level:number;theme:Theme}){const l=LEVELS[level];return <div className="cup-preview"><small>{label}</small><span style={{'--juice':l.color,'--dark':l.dark} as React.CSSProperties}>{themeIcon(theme)}</span></div>}
function Toggle({title,note,value,onChange}:{title:string;note:string;value:boolean;onChange:(v:boolean)=>void}){return <label className="setting-row"><span><b>{title}</b><small>{note}</small></span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/><i/></label>}
function Slider({title,value,min,max,step=1,unit='',onChange}:{title:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(v:number)=>void}){return <label className="slider-row"><span><b>{title}</b><output>{Number.isInteger(value)?value:value.toFixed(2)}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
function SettingsSheet({s,close,patch,preset}:{s:Settings;close:()=>void;patch:(p:Partial<Settings>)=>void;preset:(k:'stable'|'balanced'|'bounce')=>void}){return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close()}}><section className="settings-sheet" role="dialog" aria-modal="true" aria-label="遊戲設定"><header><div><small>遊戲設定</small><h2>玩法與外觀</h2></div><button onClick={close} aria-label="關閉設定">×</button></header><div className="sheet-scroll">
    <div className="theme-picker"><button className={s.theme==='juice'?'active':''} onClick={()=>patch({theme:'juice'})}>🥤<span>果汁杯</span></button><button className={s.theme==='sundae'?'active':''} onClick={()=>patch({theme:'sundae'})}>🍨<span>聖代杯</span></button><button className={s.theme==='wine'?'active':''} onClick={()=>patch({theme:'wine'})}>🍷<span>高腳杯</span></button></div>
    <div className="setting-group"><Toggle title="角度瞄準" note="先定位瞄準，再向前滑動投擲" value={s.angle} onChange={v=>patch({angle:v})}/><Toggle title="力度控制" note="距離 70%＋平均速度 30%" value={s.power} onChange={v=>patch({power:v})}/><Toggle title="顯示杯子等級" note="在杯身顯示 1～7" value={s.levels} onChange={v=>patch({levels:v})}/><Toggle title="顯示反彈路徑" note="使用斜坡物理預測軌跡" value={s.bounces} onChange={v=>patch({bounces:v})}/><Toggle title="音效" note="融合、爆炸與投擲音效" value={s.sound} onChange={v=>patch({sound:v})}/><Toggle title="震動" note="預設關閉，可隨時開啟" value={s.vibration} onChange={v=>patch({vibration:v})}/><Slider title="瞄準線長度" value={s.aimLength} min={0} max={3000} step={100} onChange={v=>patch({aimLength:v})}/><Slider title="投擲有效距離" value={s.throwThreshold} min={30} max={100} step={5} unit="px" onChange={v=>patch({throwThreshold:v})}/></div>
    <details className="developer"><summary>開發者專區 <span>調整遊戲手感</span></summary><div className="presets"><button onClick={()=>preset('stable')}>穩定堆積</button><button onClick={()=>preset('balanced')}>平衡玩法</button><button onClick={()=>preset('bounce')}>高彈撞牆</button><button onClick={()=>patch(DEFAULTS)}>恢復預設</button></div><Slider title="最大角度" value={s.maxAngle} min={30} max={85} unit="°" onChange={v=>patch({maxAngle:v})}/><Slider title="固定力量" value={s.fixedSpeed} min={5.5} max={11} step={.1} onChange={v=>patch({fixedSpeed:v})}/><Slider title="左右牆反彈" value={s.wallRest} min={.1} max={.85} step={.01} onChange={v=>patch({wallRest:v})}/><Slider title="前方牆反彈" value={s.frontRest} min={0} max={.5} step={.01} onChange={v=>patch({frontRest:v})}/><Slider title="杯子互撞反彈" value={s.cupRest} min={0} max={.5} step={.01} onChange={v=>patch({cupRest:v})}/><Slider title="速度衰減" value={s.drag} min={.96} max={.995} step={.001} onChange={v=>patch({drag:v})}/><Slider title="斜坡重力" value={s.slope} min={0} max={.03} step={.001} onChange={v=>patch({slope:v})}/><Slider title="杯子尺寸" value={s.size} min={.8} max={1.25} step={.01} onChange={v=>patch({size:v})}/><Slider title="結束等待" value={s.gameOverMs} min={300} max={2500} step={100} unit="ms" onChange={v=>patch({gameOverMs:v})}/><Slider title="爆炸範圍" value={s.blastRadius} min={80} max={210} step={5} onChange={v=>patch({blastRadius:v})}/><Slider title="爆炸推力" value={s.blastForce} min={1} max={8} step={.2} onChange={v=>patch({blastForce:v})}/></details>
  </div><button className="done-button" onClick={close}>完成</button></section></div>}
