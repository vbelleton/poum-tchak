/* Poum Tchak en réalité virtuelle (casque Meta Quest, navigateur du casque).
   Le jeu reste celui de la page : mêmes partitions, même notation, même son, même jauge.
   Ce module ne fait que trois choses : dessiner la batterie et les couloirs en 3D,
   transformer les coups de baguette des manettes en frappes, et montrer le score.
   Une batterie MIDI branchée passe par le chemin habituel de la page (vraie pédale de grosse caisse).

   Repère de la batterie (groupe `kit`) : origine au sol sous la tête du joueur, -z devant lui,
   y vers le haut. Tout ce qui bouge (pads, notes, panneaux) est dans ce repère. */
import * as THREE from './three.module.min.js';

const COL={poum:'#8D9CFF',tchak:'#FF8A70',doum:'#46D2AB',toum:'#CA9CF5',tss:'#F2BB4A',tchaa:'#BCD64A',psch:'#FF84B8'};
const POP={ok:'#7BE3A6',warn:'#F2BB4A',bad:'#FF8A70'};
const BG=0x0B0E14;
const FONT='"Bricolage Grotesque",system-ui,sans-serif';
/* Les pads, un par couloir du jeu « vr » de la page (même ordre que GM_LANES.vr).
   x, z : position devant le joueur ; y : hauteur au-dessus de la caisse claire ; r : rayon.
   La grosse caisse (couloir 0) se joue à la gâchette ou à la pédale MIDI : c'est un fût debout. */
const PADS=[
  {lane:0,id:'poum',kick:true,x:0.0,y:0,z:-0.95,r:0.27},
  {lane:1,id:'tchak',x:-0.16,y:0,z:-0.40,r:0.15},
  {lane:2,id:'tss',x:-0.46,y:0.10,z:-0.36,r:0.15},
  {lane:3,id:'doum',x:-0.02,y:0.13,z:-0.60,r:0.12},
  {lane:4,id:'toum',x:0.32,y:-0.04,z:-0.42,r:0.15},
  {lane:5,id:'psch',x:0.42,y:0.30,z:-0.62,r:0.18}
];
const FAR=4.6;            /* distance d'où partent les notes, en mètres */
const STICK=0.40;         /* longueur de la baguette */
const MIN_VY=-0.35;       /* vitesse verticale minimale d'un coup (m/s) */

let S=null; /* l'état de la session en cours, null hors VR */
const TILT_KEY='poumtchak.vr.angle';
function loadTilt(){try{const v=+localStorage.getItem(TILT_KEY);if(v>=0.2&&v<=1.3)return v;}catch(e){}return 0.7;}
const H_KEY='poumtchak.vr.hauteur';
function loadHeight(){try{const v=+localStorage.getItem(H_KEY);if(Math.abs(v)<=0.3)return v;}catch(e){}return 0;}
function setHeight(v){
  S.hOff=Math.max(-0.3,Math.min(0.3,Math.round(v*100)/100));
  try{localStorage.setItem(H_KEY,String(S.hOff));}catch(e){}
  if(S.head)place(S.head,S.base?S.base.yaw:0,S.preview);
}
const D_KEY='poumtchak.vr.distance';
function loadDist(){try{const v=+localStorage.getItem(D_KEY);if(v>=-0.3&&v<=1.5)return v;}catch(e){}return 0;}
function setDist(v){
  S.dOff=Math.max(-0.3,Math.min(1.5,Math.round(v*10)/10));
  try{localStorage.setItem(D_KEY,String(S.dOff));}catch(e){}
  if(S.head)place(S.head,S.base?S.base.yaw:0,S.preview);
}
/* Dispositions : où sont les pads. Styles : à quoi ressemble la batterie. */
for(const P of PADS){P.bx=P.x;P.bz=P.z;P.br=P.r;}
const LAYOUTS={standard:'Standard',gaucher:'Gaucher',compacte:'Compacte',large:'Large'};
const STYLES={pads:'Pads',noir:'Noir',rouge:'Rouge',bleu:'Bleu',bois:'Bois'};
const FINISH={noir:0x1B1C21,rouge:0x9A1E26,bleu:0x1F4596,bois:0x8F5D2C};
const CYMBALS=new Set(['tss','psch']);
const L_KEY='poumtchak.vr.disposition',ST_KEY='poumtchak.vr.style';
function loadPick(key,set,def){try{const v=localStorage.getItem(key);if(set[v])return v;}catch(e){}return def;}
function applyLayout(){
  const L=S.layout,f=L==='large'?1.2:1;
  for(const p of S.pads){
    const P=p.P;let x=P.bx,z=P.bz;
    if(L==='compacte'){x*=0.8;z*=0.85;}
    else if(L==='large'){x*=1.18;z*=1.1;}
    if(L==='gaucher')x=-x;
    P.x=x;P.z=z;P.r=P.br*f;
    p.g.scale.setScalar(f);p.lane.scale.x=f;
  }
}
function applyStyle(){
  const ac=S.style!=='pads',fin=FINISH[S.style]||0;
  S.shellMat.color.set(fin);
  for(const p of S.pads){
    const id=p.P.id,m=p.padMat;
    if(p.shell)p.shell.visible=ac;
    if(p.P.kick)m.color.set(ac?fin:0x1D232E);
    else if(CYMBALS.has(id)){m.color.set(ac?0xC9A23A:0x1D232E);m.metalness=ac?0.8:0;m.roughness=ac?0.3:0.6;}
    else m.color.set(ac?0xE9E5DA:0x1D232E);
    m.needsUpdate=true;
  }
}
/* Les décors. Ils changent avec la partie :
   - Chapelle : les vitraux s'éclairent au fil du chant, une bougie s'allume tous les 4 coups justes de suite,
     la croix brille quand la série est longue, et des rayons de lumière entrent quand la jauge est pleine.
   - Colline : la nuit laisse place à l'aube au fil du chant, le soleil se lève derrière les trois croix,
     les étoiles s'effacent, et des colombes s'envolent pendant les longues séries.
   - Nuit : la scène sobre du début. */
const DECORS={chapelle:'Chapelle',colline:'Colline',nuit:'Nuit'};
const DC_KEY='poumtchak.vr.decor';
function box(w,h,d,mat,x,y,z,parent){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;}
function glassTexture(seed){
  const cv=document.createElement('canvas');cv.width=64;cv.height=160;const cx=cv.getContext('2d');
  const cols=['#2F5BD0','#C9302C','#F2BB4A','#3E9E5A','#8E44AD','#E8E2C8'];let r=seed*9301+49297;
  const rnd=()=>{r=(r*9301+49297)%233280;return r/233280;};
  cx.fillStyle='#14110E';cx.fillRect(0,0,64,160);
  for(let y=0;y<10;y++)for(let x=0;x<4;x++){cx.fillStyle=cols[Math.floor(rnd()*cols.length)];cx.fillRect(x*16+1.5,y*16+1.5,13,13);}
  /* une croix claire au milieu du vitrail */
  cx.fillStyle='#FFF4D0';cx.fillRect(28,30,8,90);cx.fillRect(14,55,36,8);
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function buildDecors(){
  const D={};S.decors=D;
  /* --- la chapelle --- */
  {
    const g=new THREE.Group();S.kit.add(g);D.chapelle={g};
    const stone=new THREE.MeshStandardMaterial({color:0x5E554A,roughness:0.95});
    const wood=new THREE.MeshStandardMaterial({color:0x3B2A1D,roughness:0.85});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,22),wood);floor.rotation.x=-Math.PI/2;floor.position.set(0,0.001,-5);g.add(floor);
    box(0.4,7,22,stone,-5,3.5,-5,g);box(0.4,7,22,stone,5,3.5,-5,g);box(10.4,7,0.4,stone,0,3.5,-14.5,g);box(10.4,7,0.4,stone,0,3.5,4,g);
    const ceil=box(10.4,0.3,22,new THREE.MeshStandardMaterial({color:0x2A221B,roughness:1}),0,7,-5,g);
    for(const x of [-3.8,3.8])for(let z=2;z>-14;z-=4){const c=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,7,12),stone);c.position.set(x,3.5,z);g.add(c);}
    /* les vitraux, de chaque côté */
    D.chapelle.glass=[];
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.8),new THREE.MeshBasicMaterial({map:glassTexture(i*2+(side>0)),color:0x333333}));
      m.position.set(side*4.78,3.6,0.5-i*4);m.rotation.y=-side*Math.PI/2;g.add(m);D.chapelle.glass.push(m);
    }
    /* l'autel, la croix et les bougies, au fond */
    box(3,1,0.8,new THREE.MeshStandardMaterial({color:0xE8E2D2,roughness:0.7}),0,0.5,-13.6,g);
    const gold=new THREE.MeshStandardMaterial({color:0xC9A23A,emissive:0xF2BB4A,emissiveIntensity:0.1,metalness:0.6,roughness:0.35});
    box(0.22,3.2,0.12,gold,0,3.9,-14.2,g);box(1.6,0.22,0.12,gold,0,4.6,-14.2,g);D.chapelle.cross=gold;
    D.chapelle.flames=[];
    const wax=new THREE.MeshStandardMaterial({color:0xF4EEDC}),flameM=new THREE.MeshBasicMaterial({color:0xFFC861});
    for(let i=0;i<12;i++){
      const x=-1.35+i*(2.7/11);
      const c=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.28,8),wax);c.position.set(x,1.14,-13.45);g.add(c);
      const f=new THREE.Mesh(new THREE.SphereGeometry(0.03,8,6),flameM);f.scale.y=1.8;f.position.set(x,1.33,-13.45);f.visible=false;g.add(f);
      D.chapelle.flames.push(f);
    }
    /* les rayons de lumière qui entrent par les vitraux */
    D.chapelle.beams=[];
    const beamM=new THREE.MeshBasicMaterial({color:0xFFF1C8,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const b=new THREE.Mesh(new THREE.CylinderGeometry(0.5,1.1,6,12,1,true),beamM);
      b.position.set(side*2.6,2.2,0.5-i*4);b.rotation.z=side*0.95;g.add(b);D.chapelle.beams.push(b);
    }
    D.chapelle.beamM=beamM;D.chapelle.bg=0x120D0A;
  }
  /* --- la colline à l'aube --- */
  {
    const g=new THREE.Group();S.kit.add(g);D.colline={g};
    const grass=new THREE.MeshStandardMaterial({color:0x22301C,roughness:1});
    const ground=new THREE.Mesh(new THREE.CircleGeometry(40,48),grass);ground.rotation.x=-Math.PI/2;ground.position.y=0.001;g.add(ground);
    const hill=new THREE.Mesh(new THREE.SphereGeometry(9,32,16,0,Math.PI*2,0,Math.PI/2),grass);hill.scale.y=0.45;hill.position.set(0,0,-26);g.add(hill);
    const dark=new THREE.MeshBasicMaterial({color:0x0E0B0A});
    for(const [x,h] of [[-2.6,2.6],[0,3.4],[2.6,2.6]]){box(0.22,h,0.22,dark,x,4+h/2-0.3,-26,g);box(h*0.5,0.2,0.22,dark,x,4+h*0.72,-26,g);}
    const sun=new THREE.Mesh(new THREE.SphereGeometry(2.2,24,16),new THREE.MeshBasicMaterial({color:0xFFD27A,fog:false}));sun.position.set(0,-1,-36);g.add(sun);D.colline.sun=sun;
    const sp=[];for(let i=0;i<300;i++){const a=Math.random()*Math.PI*2,e=0.15+Math.random()*1.2,r=30;sp.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r);}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
    const starM=new THREE.PointsMaterial({color:0xffffff,size:0.12,transparent:true,fog:false});
    g.add(new THREE.Points(sg,starM));D.colline.starM=starM;
    /* les colombes : de petites ailes blanches qui tournent au-dessus */
    D.colline.doves=[];
    const wingG=new THREE.BufferGeometry();wingG.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0.12,-0.3,0.04,-0.05,0,0,-0.12, 0,0,0.12,0.3,0.04,-0.05,0,0,-0.12],3));
    const doveM=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
    for(let i=0;i<5;i++){const d=new THREE.Mesh(wingG,doveM);d.visible=false;g.add(d);D.colline.doves.push(d);}
    D.colline.night=new THREE.Color(0x0A0D1A);D.colline.dawn=new THREE.Color(0xE8A066);
  }
  S.decorK={prog:0.3,gauge:1,streak:0};
}
function applyDecor(){
  for(const k of Object.keys(S.decors))S.decors[k].g.visible=k===S.decor;
  S.grid.visible=S.decor==='nuit';S.stage.visible=S.decor==='nuit';
  if(S.decor==='nuit'){S.scene.background.set(BG);S.scene.fog.color.set(BG);S.scene.fog.near=3.5;S.scene.fog.far=9;}
  else{S.scene.fog.near=8;S.scene.fog.far=S.decor==='colline'?60:30;}
  S.renderer.setClearColor(S.scene.background,1);
}
function setDecor(v){
  if(!DECORS[v])return;
  S.decor=v;try{localStorage.setItem(DC_KEY,v);}catch(e){}
  applyDecor();
}
/* À chaque image : les indicateurs du jeu (avancée du chant, jauge, série) font vivre le décor. */
function updateDecor(t){
  if(S.decor==='nuit')return;
  const gm=S.api.gm,K=S.decorK,R=S.result;
  const dur=gm.on&&gm.chart?gm.chart.dur:0;
  const prog=gm.on&&dur?Math.max(0,Math.min(1,S.api.now()/dur)):R&&!R.quit&&!R.fell?1:0.3;
  const gauge=gm.on?Math.max(0,Math.min(1,gm.gauge==null?1:gm.gauge)):R&&R.fell?0.2:1;
  const streak=gm.on&&gm.sc?gm.sc.streak:0;
  K.prog+=(prog-K.prog)*0.03;K.gauge+=(gauge-K.gauge)*0.05;K.streak=streak;
  if(S.decor==='chapelle'){
    const D=S.decors.chapelle,lit=0.2+0.8*K.prog*(0.4+0.6*K.gauge);
    for(const m of D.glass)m.material.color.setScalar(lit);
    const n=Math.min(12,Math.floor(K.streak/4))+(gm.on?0:4);
    D.flames.forEach((f,i)=>{f.visible=i<n;if(f.visible)f.scale.y=1.6+0.3*Math.sin(t/90+i*1.7);});
    D.cross.emissiveIntensity=0.1+Math.min(1,K.streak/32)*1.2;
    D.beamM.opacity=Math.max(0,(K.gauge-0.6)/0.4)*K.prog*0.16;
    const c=new THREE.Color(D.bg).lerp(new THREE.Color(0x3A2C20),K.prog*K.gauge);
    S.scene.background.copy(c);S.scene.fog.color.copy(c);
  }else if(S.decor==='colline'){
    const D=S.decors.colline,a=K.prog*(0.5+0.5*K.gauge);
    const c=D.night.clone().lerp(D.dawn,a);
    S.scene.background.copy(c);S.scene.fog.color.copy(c);
    D.sun.position.y=-2.5+a*9;D.starM.opacity=Math.max(0,1-a*1.6);
    const fly=K.streak>=12,nd=Math.min(D.doves.length,Math.floor(K.streak/8));
    D.doves.forEach((d,i)=>{
      d.visible=fly&&i<nd;if(!d.visible)return;
      const w=t/1000*0.5+i*1.26,r=4+i*0.7;
      d.position.set(Math.cos(w)*r,4.5+i*0.4+0.2*Math.sin(t/300+i),-8+Math.sin(w)*r);
      d.rotation.set(0,-w,0.5*Math.sin(t/120+i));
    });
  }
  S.renderer.setClearColor(S.scene.background,1);
}
function setLayout(v){
  if(!LAYOUTS[v])return;
  S.layout=v;try{localStorage.setItem(L_KEY,v);}catch(e){}
  applyLayout();if(S.head)place(S.head,S.base?S.base.yaw:0,S.preview);
}
function setStyle(v){
  if(!STYLES[v])return;
  S.style=v;try{localStorage.setItem(ST_KEY,v);}catch(e){}
  applyStyle();
}
/* Se déplacer : le stick gauche fait glisser le joueur (en vrai, c'est le monde qui glisse), le stick droit le fait
   tourner par crans quand le menu n'est pas là. S.head est l'ancre de la batterie : elle bouge avec le monde. */
const MOVE_SPEED=1.2,TURN=Math.PI/6;
/* La pose de la batterie : S.base (position au sol et direction), puis l'inclinaison S.pitch, qui fait
   pivoter toute la scène autour de la tête, vers le haut, pour jouer couché ou allongé. */
const PITCH_KEY='poumtchak.vr.inclinaison',PITCH_MAX=Math.PI/2;
function loadPitch(){try{const v=+localStorage.getItem(PITCH_KEY);if(v>=0&&v<=PITCH_MAX)return v;}catch(e){}return 0;}
function setPitch(v,save=true){
  S.pitch=Math.max(0,Math.min(PITCH_MAX,v));
  if(save)try{localStorage.setItem(PITCH_KEY,S.pitch.toFixed(3));}catch(e){}
  pose();
}
const ROLL_KEY='poumtchak.vr.roulis';
function loadRoll(){try{const v=+localStorage.getItem(ROLL_KEY);if(Math.abs(v)<=PITCH_MAX)return v;}catch(e){}return 0;}
/* Rotation sur le côté : la scène pivote autour de l'axe avant-arrière, comme si on jouait couché sur le flanc. */
function setRoll(v,save=true){
  S.roll=Math.max(-PITCH_MAX,Math.min(PITCH_MAX,v));
  if(save)try{localStorage.setItem(ROLL_KEY,S.roll.toFixed(3));}catch(e){}
  pose();
}
function pose(){
  const b=S.base,k=S.kit;if(!b)return;
  k.rotation.set(S.pitch,b.yaw,S.roll,'YXZ');
  k.position.set(b.x,b.y,b.z);
  if((S.pitch||S.roll)&&S.head){
    /* le pivot : la tête ; elle garde sa place dans la batterie quand on incline */
    const H=S.head,l=new THREE.Vector3(H.x-b.x,H.y-b.y,H.z-b.z).applyAxisAngle(new THREE.Vector3(0,1,0),-b.yaw);
    k.position.copy(H).sub(l.applyQuaternion(k.quaternion));
  }
}
function moveBy(dx,dz){
  const yaw=S.base?S.base.yaw:0,cam=new THREE.Vector3();
  /* avant = où regarde la tête, à plat */
  let fx=-Math.sin(yaw),fz=-Math.cos(yaw);
  if(S.renderer.xr.isPresenting){
    const q=new THREE.Quaternion();S.renderer.xr.getCamera().getWorldQuaternion(q);
    const f=new THREE.Vector3(0,0,-1).applyQuaternion(q);f.y=0;
    if(f.lengthSq()>1e-4){f.normalize();fx=f.x;fz=f.z;}
  }
  const wx=fx*dz-fz*dx,wz=fz*dz+fx*dx; /* dz : vers l'avant, dx : vers la droite */
  if(S.base){S.base.x-=wx;S.base.z-=wz;}
  if(S.head){S.head.x-=wx;S.head.z-=wz;}
  pose();
  S.moved=(S.moved||0)+Math.hypot(wx,wz);
}
function turnBy(a){
  const c=new THREE.Vector3();
  if(S.renderer.xr.isPresenting)S.renderer.xr.getCamera().getWorldPosition(c);else c.copy(S.camera.position);
  const rot=v=>{const x=v.x-c.x,z=v.z-c.z,co=Math.cos(a),si=Math.sin(a);v.x=c.x+x*co+z*si;v.z=c.z-x*si+z*co;};
  if(S.base){rot(S.base);S.base.yaw+=a;}if(S.head)rot(S.head);
  pose();S.turns=(S.turns||0)+1;
}
function setTilt(v){
  S.tilt=Math.max(0.2,Math.min(1.3,v));
  for(const st of S.sticks)if(st.holder)st.holder.rotation.x=-S.tilt;
  try{localStorage.setItem(TILT_KEY,String(S.tilt));}catch(e){}
}

/* Un panneau de texte : un plan dont la texture est un canvas redessiné seulement quand le texte change. */
function panel(w,h,ppm=520){
  const cv=document.createElement('canvas');cv.width=Math.round(w*ppm);cv.height=Math.round(h*ppm);
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
  return {cv,cx:cv.getContext('2d'),tex,mesh,key:null,ppm};
}
/* lines : [{t, size (en cm), color, weight}] ; fond arrondi sombre si bg. */
function drawPanel(p,lines,opt={}){
  const key=JSON.stringify([lines,opt]);if(key===p.key)return;p.key=key;
  const {cx,cv}=p,W=cv.width,H=cv.height,k=p.ppm/100;
  cx.clearRect(0,0,W,H);
  if(opt.bg!==false){
    cx.fillStyle=opt.bg||'rgba(11,14,20,0.86)';cx.beginPath();
    if(cx.roundRect)cx.roundRect(2,2,W-4,H-4,Math.min(W,H)*0.12);else cx.rect(2,2,W-4,H-4);
    cx.fill();cx.strokeStyle=opt.line||'#39414F';cx.lineWidth=3;cx.stroke();
  }
  cx.textAlign='center';cx.textBaseline='middle';
  const tot=lines.reduce((s,l)=>s+l.size*1.3,0)*k;let y=(H-tot)/2;
  for(const l of lines){
    const px=l.size*k;y+=px*0.65;
    cx.font=(l.weight||600)+' '+px+'px '+FONT;cx.fillStyle=l.color||'#E8ECF2';
    cx.fillText(l.t,W/2,y,W*0.94);y+=px*0.65;
  }
  if(opt.bar!=null){ /* jauge d'erreurs en bas du panneau */
    const bw=W*0.8,bh=H*0.07,bx=(W-bw)/2,by=H-bh*2.2,v=Math.max(0,Math.min(1,opt.bar));
    cx.fillStyle='#262D39';cx.fillRect(bx,by,bw,bh);
    cx.fillStyle=v>0.5?'#7BE3A6':v>0.25?'#F2BB4A':'#FF8A70';cx.fillRect(bx,by,bw*v,bh);
  }
  p.tex.needsUpdate=true;
}
/* Les petits mots qui s'envolent (Parfait, Raté…) : une texture par mot, gardée. */
const popTex=new Map();
function popTexture(txt,kind){
  const key=txt+'|'+kind;if(popTex.has(key))return popTex.get(key);
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const cx=cv.getContext('2d');
  cx.font='800 76px '+FONT;cx.textAlign='center';cx.textBaseline='middle';
  cx.lineWidth=12;cx.strokeStyle='rgba(11,14,20,0.9)';cx.strokeText(txt,256,66,500);
  cx.fillStyle=POP[kind]||'#fff';cx.fillText(txt,256,66,500);
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;popTex.set(key,tex);return tex;
}

export function supported(){return !!(navigator.xr&&navigator.xr.isSessionSupported);}
export function active(){return !!S;}

/* Entrer en VR. En aperçu (sans casque), la scène s'affiche sur l'écran, vue de la place du batteur :
   on y joue au clavier ou à la souris, et les tests y simulent des coups de baguette. */
export async function enter(api,{preview=false}={}){
  if(S)return;
  /* la demande de session doit partir tout de suite, dans le geste de l'utilisateur */
  const session=preview?null:await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','bounded-floor','hand-tracking']});
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.setClearColor(BG,1);
  const scene=new THREE.Scene();scene.background=new THREE.Color(BG);
  scene.fog=new THREE.Fog(BG,3.5,9);
  const camera=new THREE.PerspectiveCamera(70,1,0.03,40);
  S={api,renderer,scene,camera,session,preview,kit:new THREE.Group(),sticks:[],srcs:[],pads:[],notes:new Map(),
     pool:[],ticks:[],rings:[],pops:[],placed:false,padH:0.78,floorY:0,lastT:0,wasOn:false,result:null,msg:'',
     busy:false,active:new Set(),checked:new Set(),tilt:loadTilt(),hOff:loadHeight(),dOff:loadDist(),pitch:loadPitch(),roll:loadRoll(),layout:loadPick(L_KEY,LAYOUTS,'standard'),decor:loadPick(DC_KEY,DECORS,'chapelle'),style:loadPick(ST_KEY,STYLES,'pads'),sub:false,head:null,paused:false,mini:false,focus:'play',btnPrev:new Map(),simQueue:[],keyH:null,ptrH:null,resizeH:null,canvas:renderer.domElement};
  scene.add(S.kit);
  buildWorld();buildDecors();applyLayout();applyStyle();applyDecor();
  if(preview){
    const cv=renderer.domElement;cv.id='vrPreview';
    Object.assign(cv.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'60',background:'#0B0E14',touchAction:'none'});
    document.body.appendChild(cv);
    const size=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};
    size();S.resizeH=size;addEventListener('resize',size);
    camera.position.set(0,1.55,0.5);camera.lookAt(0,1.12,-1.2);
    place(new THREE.Vector3(0,1.42,0),0,true);
    addSimStick();
    S.keyH=e=>{ /* pendant la partie, le clavier appartient au jeu de la page (touches B F D J K L, P ou Échap : pause) */
      const mode=menuMode();
      if(!mode)return;
      const mv={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];
      if(mv){e.preventDefault();menuMove(mv[0],mv[1]);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();menuDo(S.focus);}
      else if(e.key==='Escape'){e.preventDefault();if(mode==='pause')pause(false);else if(S.mini)S.mini=false;else if(S.sub){S.sub=false;S.focus='kitmenu';}else exit();}
    };
    document.addEventListener('keydown',S.keyH);
    S.ptrH=e=>{ /* un clic sur un pad : une frappe */
      const r=cv.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      const m=menuAt(ray.ray.origin,ray.ray.direction);
      if(m&&m.hit){menuDo(m.id);return;}
      const hit=ray.intersectObjects(S.pads.map(p=>p.mesh),false)[0];
      if(hit)strike(S.pads.find(p=>p.mesh===hit.object),api.atPerf(e.timeStamp||performance.now()),1);
    };
    cv.addEventListener('pointerdown',S.ptrH);
    cv.addEventListener('pointermove',e=>{
      if(!S)return;
      const r=cv.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      const m=menuAt(ray.ray.origin,ray.ray.direction);S.hover.set('souris',m&&m.id||null);
      cv.style.cursor=m&&m.id?'pointer':'default';
    });
  }else{
    renderer.xr.enabled=true;
    renderer.xr.setReferenceSpaceType('local-floor');
    try{renderer.xr.setFoveation(1);}catch(e){}
    await renderer.xr.setSession(session);
    for(let i=0;i<2;i++)addController(i);
    session.addEventListener('end',()=>cleanup());
  }
  api.setVR(true);
  renderer.setAnimationLoop(loop);
  return true;
}
export function exit(){
  if(!S)return;
  if(S.session){S.session.end().catch(()=>cleanup());}else cleanup();
}
function cleanup(){
  if(!S)return;
  const s=S;S=null;
  s.renderer.setAnimationLoop(null);
  if(s.api.gm.on)s.api.stop();
  s.api.setVR(false);
  if(s.afterExit)setTimeout(s.afterExit,0);
  if(s.keyH)document.removeEventListener('keydown',s.keyH);
  if(s.resizeH)removeEventListener('resize',s.resizeH);
  if(s.preview&&s.canvas.parentNode)s.canvas.parentNode.removeChild(s.canvas);
  s.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){[].concat(o.material).forEach(m=>{if(m.map)m.map.dispose();m.dispose();});}});
  s.renderer.dispose();
}

/* Le décor, la batterie, les couloirs et les panneaux. Les hauteurs sont posées par place(). */
function buildWorld(){
  const {scene,kit}=S;
  scene.add(new THREE.HemisphereLight(0xBFD0FF,0x202430,1.6));
  const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(1,3,1.5);scene.add(sun);
  /* le sol : une grille discrète, et une scène ronde sous la batterie */
  const grid=new THREE.GridHelper(30,60,0x262D39,0x1A1F29);kit.add(grid);S.grid=grid;
  const stage=new THREE.Mesh(new THREE.CircleGeometry(1.25,64),new THREE.MeshStandardMaterial({color:0x151A24,roughness:0.9}));
  stage.rotation.x=-Math.PI/2;stage.position.y=0.002;kit.add(stage);S.stage=stage;
  const gem=new THREE.CylinderGeometry(0.07,0.07,0.028,28);
  const kickGem=new THREE.BoxGeometry(0.42,0.05,0.07);
  S.shellMat=new THREE.MeshStandardMaterial({color:0x1B1C21,roughness:0.35,metalness:0.2,side:THREE.DoubleSide});
  S.mats={};S.missMat=new THREE.MeshStandardMaterial({color:0x6F7A8C,transparent:true,opacity:0.35});
  for(const P of PADS){
    const c=new THREE.Color(COL[P.id]);
    S.mats[P.id]=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:0.55,roughness:0.4});
    const g=new THREE.Group();kit.add(g);
    const padMat=new THREE.MeshStandardMaterial({color:0x1D232E,emissive:c,emissiveIntensity:0.12,roughness:0.6});
    let mesh,rimMat=null;
    if(P.kick){
      /* la grosse caisse est translucide : ses notes arrivent par le sol, à travers elle */
      padMat.transparent=true;padMat.opacity=0.5;padMat.depthWrite=false;
      mesh=new THREE.Mesh(new THREE.CylinderGeometry(P.r,P.r,0.36,40),padMat);mesh.rotation.x=Math.PI/2;
      const face=new THREE.Mesh(new THREE.TorusGeometry(P.r,0.016,10,48),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:0.6}));
      face.position.z=0.185;g.add(face);
    }else{
      mesh=new THREE.Mesh(new THREE.CylinderGeometry(P.r,P.r*0.96,0.035,40),padMat);
      rimMat=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:0.6,transparent:true});
      const rim=new THREE.Mesh(new THREE.TorusGeometry(P.r,0.012,8,48),rimMat);
      rim.rotation.x=Math.PI/2;rim.position.y=0.018;g.add(rim);
      if(!CYMBALS.has(P.id)){ /* le fût, visible dans les styles « acoustiques » */
        const depth=P.id==='tchak'?0.13:P.id==='doum'?0.2:0.28;
        const shell=new THREE.Mesh(new THREE.CylinderGeometry(P.r,P.r,depth,40,1,true),S.shellMat);
        shell.position.y=-depth/2-0.017;g.add(shell);P._shell=shell;
      }
      const stand=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,1,8),new THREE.MeshStandardMaterial({color:0x39414F}));
      g.add(stand);P.stand=stand;
    }
    g.add(mesh);
    /* le mot du pad (poum, tchak…), posé derrière lui, tourné vers le joueur */
    const lab=panel(0.26,0.08,600);
    drawPanel(lab,[{t:S.api.word(P.id),size:4.6,color:COL[P.id],weight:800}],{bg:false});
    lab.mesh.position.set(0,P.kick?P.r+0.07:0.07,P.kick?0.19:-P.r-0.02);
    if(!P.kick)lab.mesh.rotation.x=-0.5;
    g.add(lab.mesh);
    /* le couloir : une bande qui part du pad vers le lointain */
    const lane=new THREE.Mesh(new THREE.PlaneGeometry(P.kick?0.5:P.r*1.4,FAR),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:0.1,depthWrite:false,side:THREE.DoubleSide}));
    kit.add(lane);
    S.pads.push({P,g,mesh,padMat,rimMat,lab,lane,shell:P._shell||null,base:new THREE.Vector3(),dir:new THREE.Vector3(),color:c});
  }
  S.gem=gem;S.kickGem=kickGem;
  /* repères des temps sur les couloirs */
  const tickGeo=new THREE.BoxGeometry(1,0.004,0.012),tickMat=new THREE.MeshBasicMaterial({color:0x4A5466,transparent:true,opacity:0.7});
  for(let i=0;i<72;i++){const m=new THREE.Mesh(tickGeo,tickMat);m.visible=false;kit.add(m);S.ticks.push(m);}
  /* éclats de frappe et mots qui s'envolent */
  const ringGeo=new THREE.TorusGeometry(1,0.06,8,40);
  for(let i=0;i<10;i++){const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false}));m.visible=false;kit.add(m);S.rings.push(m);}
  const popGeo=new THREE.PlaneGeometry(0.28,0.07);
  for(let i=0;i<10;i++){const m=new THREE.Mesh(popGeo,new THREE.MeshBasicMaterial({map:popTexture('Bien','ok'),transparent:true,depthWrite:false}));m.visible=false;m.renderOrder=5;kit.add(m);S.pops.push(m);}
  /* score au-dessus de la batterie, menu devant */
  S.hud=panel(0.9,0.2);kit.add(S.hud.mesh);
  S.menu=panel(MW/100,MH/100,700);kit.add(S.menu.mesh);S.items=[];S.hover=new Map();
}

/* Pose la batterie à la hauteur et dans la direction du joueur. head : position de la tête. */
function place(head,yaw,fixedFloor){
  const local=!fixedFloor&&S.renderer.xr.isPresenting&&head.y<0.5; /* repère sans sol : on suppose 1,60 m */
  S.floorY=local?head.y-1.6:0;
  S.head=head.clone();
  S.padH=Math.max(0.4,Math.min(1.3,head.y-S.floorY-0.62+S.hOff));
  S.base={x:head.x-Math.sin(yaw)*S.dOff,y:S.floorY,z:head.z-Math.cos(yaw)*S.dOff,yaw}; /* dOff : on recule la batterie, pour la voir plus petite */pose();
  for(const p of S.pads){
    const P=p.P;
    if(P.kick){p.g.position.set(P.x,P.r+0.02,P.z);p.base.set(P.x,0.03,P.z+0.3);p.dir.set(0,0,-1);}
    else{
      p.g.position.set(P.x,S.padH+P.y,P.z);p.base.copy(p.g.position);
      p.dir.set(P.x*0.9,0.28,-1).normalize();
      const h=S.padH+P.y,f=p.g.scale.y;P.stand.scale.y=h/f;P.stand.position.y=-h/2/f;
    }
    /* la bande du couloir, à plat le long de la direction des notes */
    const mid=p.base.clone().addScaledVector(p.dir,FAR/2);
    p.lane.position.copy(mid);
    const side=new THREE.Vector3().crossVectors(p.dir,new THREE.Vector3(0,1,0)).normalize();
    const nrm=new THREE.Vector3().crossVectors(side,p.dir);
    p.lane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,p.dir,nrm));
    p.lane.position.y-=P.kick?0:0.02;
  }
  S.hud.mesh.position.set(0,S.padH+0.78,-1.45);
  S.menu.mesh.position.set(0,S.padH+0.72,-1.25);S.menu.mesh.rotation.x=-0.12;
  S.placed=true;
}
function placeFromHead(){
  const cam=S.renderer.xr.getCamera(),pos=new THREE.Vector3(),q=new THREE.Quaternion();
  cam.getWorldPosition(pos);cam.getWorldQuaternion(q);
  const f=new THREE.Vector3(0,0,-1).applyQuaternion(q);f.y=0;
  if(f.lengthSq()<1e-4)f.set(0,0,-1);
  /* la batterie recule un peu : la tête est au-dessus du tabouret, pas au-dessus des pads */
  place(pos,Math.atan2(-f.x,-f.z));
}

/* Les manettes : une baguette dans chaque main, la gâchette pour la grosse caisse. */
function addController(i){
  const grip=S.renderer.xr.getControllerGrip(i);S.scene.add(grip);
  /* la poignée de la manette est inclinée de 45° par rapport à son axe de visée : la baguette
     part vers l'avant, un peu vers le bas, dans le prolongement du poing */
  const holder=new THREE.Group();holder.rotation.x=-S.tilt;grip.add(holder);
  const wood=new THREE.MeshStandardMaterial({color:0xE9D6B0,roughness:0.5});
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.009,STICK,10),wood);
  stick.rotation.x=-Math.PI/2;stick.position.z=-STICK/2+0.05;holder.add(stick);
  const tipM=new THREE.Mesh(new THREE.SphereGeometry(0.012,10,8),wood);tipM.position.z=-STICK+0.05;holder.add(tipM);
  const st={grip,holder,tip:tipM,src:null,prev:null,prevT:0,armed:new Map(),hand:''};
  grip.addEventListener('connected',e=>{st.src=e.data;st.hand=e.data.handedness||'';});
  grip.addEventListener('disconnected',()=>{st.src=null;st.prev=null;});
  S.sticks.push(st);addRay(st,i);
}
/* Aperçu et tests : une baguette sans manette, déplacée par une liste de positions. */
function addSimStick(){
  const tip=new THREE.Object3D();S.kit.add(tip);
  S.sticks.push({tip,sim:true,src:null,prev:null,prevT:0,armed:new Map(),hand:'sim'});
}
function pulse(st,v,ms){
  const h=st.src&&st.src.gamepad&&st.src.gamepad.hapticActuators&&st.src.gamepad.hapticActuators[0];
  if(h&&h.pulse)try{h.pulse(Math.max(0.1,Math.min(1,v)),ms);}catch(e){}
}

/* Une frappe sur un pad : notée si son couloir a des notes dans la partie, sinon juste le son. */
function strike(p,at,force){
  if(!p)return;
  p.hitT=performance.now();
  const {api}=S;
  if(!api.gm.on)check(p);
  if(api.gm.on&&S.active.has(p.P.lane))api.hit(p.P.lane,at);
  else api.play(p.P.id,Math.max(0.3,Math.min(1.2,force)));
}

/* Vérification des pads (comme au début de Louange Drums) : hors partie, chaque pad touché,
   à la baguette ou sur la batterie MIDI, reçoit sa coche. */
function check(p){
  if(S.checked.has(p.P.lane))return;
  S.checked.add(p.P.lane);
  drawPanel(p.lab,[{t:S.api.word(p.P.id)+' ✓',size:4.6,color:COL[p.P.id],weight:800}],{bg:false});
}
/* Un coup de la batterie MIDI hors partie : le pad s'allume et se coche (la batterie fait son propre son). */
export function midiIdle(id){
  if(!S)return;
  const p=S.pads.find(x=>x.P.id===id)||(id==='tchaa'?S.pads[2]:null);
  if(!p)return;
  p.hitT=performance.now();check(p);
}

/* Détection des coups : la pointe de la baguette traverse le dessus d'un pad en descendant.
   L'instant exact est interpolé entre deux images (72 images/s sur Quest 2 : 14 ms d'écart). */
const _w=new THREE.Vector3();
function sticks(t){
  const t0=t;
  for(const st of S.sticks){
    t=t0;
    if(st.sim){
      /* plusieurs positions par image : chacune porte son instant */
      while(S.simQueue.length){const q=S.simQueue.shift();_w.set(q[0],q[1],q[2]);sticksAt(st,q[3]);}
      continue;
    }else{
      if(!st.src){st.prev=null;continue;}
      st.tip.getWorldPosition(_w);S.kit.worldToLocal(_w);
    }
    sticksAt(st,t);
  }
}
function sticksAt(st,t){
  /* un instant qui recule (deux horloges d'images, comme dans un simulateur) ferait perdre le coup :
     on garde des instants croissants */
  if(st.prev&&t<=st.prevT)t=st.prevT+1;
  {
    const cur=_w.clone();
    if(st.prev){
      const dt=(t-st.prevT)/1000;
      for(const p of S.pads){
        if(p.P.kick)continue;
        const top=p.g.position.y+0.02,P=p.P;
        const armed=st.armed.get(p)!==false;
        if(!armed){
          if(cur.y>top+0.025||Math.hypot(cur.x-p.g.position.x,cur.z-p.g.position.z)>P.r*1.6)st.armed.set(p,true);
          continue;
        }
        const near=Math.hypot(st.prev.x-p.g.position.x,st.prev.z-p.g.position.z)<=P.r*1.3;
        const vyNow=dt>0?(cur.y-st.prev.y)/dt:0;
        /* coup rapide qui remonte avant de traverser (entre deux images) : la pointe descendait vite,
           elle remonte maintenant, et son point le plus bas est tout près de la surface */
        if(near&&st.prev.y>top&&st.prev.y<top+0.03&&(st.vy||0)<MIN_VY*1.5&&vyNow>=0){
          st.armed.set(p,false);
          strike(p,S.api.atPerf(st.prevT),-(st.vy)/2.5);
          pulse(st,0.35-st.vy/6,22);
          continue;
        }
        if(st.prev.y>top&&cur.y<=top){
          const f=(st.prev.y-top)/Math.max(1e-6,st.prev.y-cur.y);
          const x=st.prev.x+(cur.x-st.prev.x)*f,z=st.prev.z+(cur.z-st.prev.z)*f;
          if(Math.hypot(x-p.g.position.x,z-p.g.position.z)>P.r*1.3)continue;
          const vy=dt>0?(cur.y-st.prev.y)/dt:-1;
          if(vy>MIN_VY)continue;
          st.armed.set(p,false);
          const atMs=st.prevT+(t-st.prevT)*f;
          strike(p,S.api.atPerf(atMs),-vy/2.5);
          pulse(st,0.35-vy/6,22);
        }
      }
    }
    if(st.prev){const dt=(t-st.prevT)/1000;st.vy=dt>0?(cur.y-st.prev.y)/dt:0;}
    st.prev=cur;st.prevT=t;
  }
}

/* Les boutons : gâchette = grosse caisse ; A/X = jouer ; B/Y = arrêter, ou quitter la VR ;
   stick enfoncé = replacer la batterie devant soi. */
function buttons(t){
  for(const st of S.sticks){
    const gp=st.src&&st.src.gamepad;if(!gp)continue;
    const prev=S.btnPrev.get(st)||[];
    const now=gp.buttons.map(b=>b.pressed);
    const down=i=>now[i]&&!prev[i];
    S.btnPrev.set(st,now);
    const mode=menuMode();
    /* un bouton est lu une fois par image : on date le coup de maintenant, pas de l'instant
       d'affichage prévu de l'image (qui peut être un peu dans le futur) */
    if(down(0)&&mode&&S.hover.get(st)){pulse(st,0.3,15);menuDo(S.hover.get(st));if(!S)return;}
    else if(down(0)){const p=S.pads[0];p.hitT=performance.now();strike(p,S.api.atPerf(Math.min(t,performance.now())),1);pulse(st,0.8,35);}
    if(down(3))placeFromHead();
    if(down(4)){if(mode){menuDo(S.focus);if(!S)return;}}
    const ax=gp.axes&&gp.axes.length>2?gp.axes[2]:0,ay=gp.axes&&gp.axes.length>3?gp.axes[3]:0;
    /* stick gauche : se déplacer, à la vitesse de la marche */
    if(st.hand==='left'){
      const dt=Math.min(0.05,Math.max(0,(t-(st.moveT||t))/1000));st.moveT=t;
      const dz=Math.abs(ay)>0.2?-ay:0,dx=Math.abs(ax)>0.2?ax:0;
      /* poignée gauche serrée : le stick gauche incline la scène, vers l'avant (haut/bas) ou sur le côté (gauche/droite) */
      if(now[1]){
        if(dz){setPitch(S.pitch+dz*0.9*dt,false);st.pitched=true;}
        if(dx){setRoll(S.roll+dx*0.9*dt,false);st.pitched=true;}
      }else{
        if(st.pitched){st.pitched=false;setPitch(S.pitch);setRoll(S.roll);}
        if(dx||dz)moveBy(dx*MOVE_SPEED*dt,dz*MOVE_SPEED*dt);
      }
      continue_buttons(st,down,mode);if(!S)return;
      continue;
    }
    /* stick droit, sans menu à l'écran : tourner par crans */
    if(!mode||mode==='mini'){
      if(Math.abs(ax)>0.7&&!st.turned){st.turned=true;turnBy(ax>0?-TURN:TURN);}
      else if(Math.abs(ax)<0.3)st.turned=false;
    }
    /* le stick droit déplace le bouton choisi dans le menu */
    if(mode&&mode!=='mini'&&(Math.abs(ax)>0.6||Math.abs(ay)>0.6)){
      /* un pas tout de suite, puis d'autres si on garde le stick poussé */
      if(!st.navT||t-st.navT>(st.navN?170:400)){st.navN=st.navT?(st.navN||0)+1:0;st.navT=t;if(Math.abs(ay)>Math.abs(ax))menuMove(0,ay>0?1:-1);else menuMove(ax>0?1:-1,0);}
    }else if(Math.abs(ax)<0.3&&Math.abs(ay)<0.3){st.navT=0;st.navN=0;}
    continue_buttons(st,down,mode);if(!S)return;
  }
}
/* B/Y : pause en partie, rouvrir le menu masqué, revenir du sous-menu, sinon quitter */
function continue_buttons(st,down,mode){
  if(!down(5))return;
  if(S.api.gm.on)pause(!S.paused);
  else if(S.mini)S.mini=false;
  else if(S.sub){S.sub=false;S.focus='kitmenu';}
  else exit();
}

/* « Hoche la tête » : la grosse caisse part quand la tête, qui descendait vite, remonte
   après une descente d'au moins 2,5 cm. L'instant est celui du point le plus bas. */
const _h=new THREE.Vector3();
function headKick(t,frame){
  if(S.api.opts().kick!=='tete'){S.hd=null;return;}
  /* la pose de la tête pour cette image (la caméra de three.js n'est mise à jour qu'au dessin) */
  const ref=S.renderer.xr.getReferenceSpace(),vp=ref&&frame.getViewerPose(ref);
  if(!vp)return;
  _h.set(vp.transform.position.x,vp.transform.position.y,vp.transform.position.z);
  const h=S.hd||(S.hd={y:_h.y,t,dir:0,top:_h.y,topT:t,lastKick:0});
  if(t<=h.t)return;
  const dy=_h.y-h.y;
  if(dy<-0.001){ /* la tête descend */
    if(h.dir>=0){h.top=h.y;h.topT=h.t;}
    h.dir=-1;h.botT=t;
  }else if(dy>0.001){ /* elle remonte : le point le plus bas était l'image d'avant */
    if(h.dir<0){
      const drop=h.top-h.y,dur=Math.max(0.001,(h.botT-h.topT)/1000);
      /* vitesse moyenne de la descente, indépendante du nombre d'images par seconde :
         un vrai coup de tête dépasse 0,15 m/s, se pencher pour regarder reste en dessous */
      if(drop>0.025&&drop/dur>0.15&&t-h.lastKick>180){
        h.lastKick=t;S.headKicks=(S.headKicks||0)+1;
        const p=S.pads[0];p.hitT=performance.now();strike(p,S.api.atPerf(Math.min(h.botT,performance.now())),1);
      }
    }
    h.dir=1;
  }
  h.y=_h.y;h.t=t;
}
async function start(){
  if(S.busy||S.api.gm.on)return;
  S.busy=true;S.msg='Chargement…';S.result=null;
  try{S.msg=await S.api.launch()||'';}catch(e){S.msg='Impossible de lancer la partie.';}
  if(!S)return;
  S.busy=false;
  if(S.api.gm.on){
    S.active=new Set(S.api.gm.chart.notes.map(n=>n.lane));
    for(const n of S.notes.values()){n.visible=false;S.pool.push(n);}S.notes.clear();
  }
}

/* Une note à l'écran : prise dans la réserve, ou créée. */
function gemFor(nt,p){
  let m=S.notes.get(nt);if(m)return m;
  const kick=p.P.kick;
  m=S.pool.find(x=>x.userData.kick===kick);
  if(m)S.pool.splice(S.pool.indexOf(m),1);
  else{m=new THREE.Mesh(kick?S.kickGem:S.gem,S.mats[nt.id]);m.userData.kick=kick;S.kit.add(m);}
  m.visible=true;S.notes.set(nt,m);return m;
}

function loop(t,frame){
  if(!S)return;
  S.frames=(S.frames||0)+1;
  if(S.lastT)S.dt=(S.dt||16)*0.9+(t-S.lastT)*0.1;S.lastT=t;
  const {api,renderer,scene,camera}=S,gm=api.gm;
  if(!S.placed&&frame){
    const cam=renderer.xr.getCamera(),v=new THREE.Vector3();cam.getWorldPosition(v);
    if(v.lengthSq()>0.01)placeFromHead();
  }
  updateDecor(t);
  if(S.placed){sticks(t);if(frame){rays();buttons(t);if(S)headKick(t,frame);}}
  /* casque retiré ou menu du système ouvert : pause */
  if(S&&S.session&&gm.on&&!S.paused&&S.session.visibilityState&&S.session.visibilityState!=='visible')pause(true);
  if(!S)return;  /* les coups d'abord, puis les notes ratées */
  if(gm.on)api.step();          /* le jeu avance au rythme du casque */
  if(S.wasOn&&!gm.on)finished();
  S.wasOn=gm.on;
  draw(t);
  renderer.render(scene,camera);
}

function finished(){
  const gm=S.api.gm,sc=gm.sc;
  if(!sc)return;
  const p=S.api.pct(),fell=gm.gauge<=0;
  S.result={p,stars:fell?0:S.api.stars(p),pts:sc.pts,fell,best:sc.best,n:sc.perfect+sc.good+sc.approx,miss:sc.miss,extra:sc.extra,quit:!fell&&!gm.ended};
  for(const n of S.notes.values()){n.visible=false;S.pool.push(n);}S.notes.clear();
}

function draw(t){
  const {api,pads}=S,gm=api.gm,on=gm.on&&gm.chart;
  const now=on?api.now():0,lead=on?Math.max(1.5,3.2*60/gm.curBpm):2;
  /* les pads s'allument quand on les frappe */
  for(const p of pads){
    let a=(performance.now()-(p.hitT||-1e9))/1000;
    if(on&&gm.flash[p.P.lane]!=null)a=Math.min(a,now-gm.flash[p.P.lane]);
    const used=!on||S.active.has(p.P.lane);
    p.padMat.emissiveIntensity=(used?0.14:0.04)+(a<0.15?0.9*(1-a/0.15):0);
    p.lane.visible=!!on&&used;
    p.lab.mesh.material.opacity=used?1:0.35;
    if(p.rimMat)p.rimMat.opacity=used?1:0.3;
  }
  /* les notes */
  const seen=new Set();
  if(on){
    for(const nt of gm.chart.notes){
      const dt=nt.t-now;
      if(dt>lead)break;
      if(dt<-0.3)continue;
      if(nt.done&&nt.res!=='miss')continue;
      const p=pads[nt.lane];if(!p)continue;
      const m=gemFor(nt,p);seen.add(nt);
      const d=Math.max(-0.25,dt/lead)*FAR;
      m.position.copy(p.base).addScaledVector(p.dir,d);
      if(p.P.kick)m.position.y=0.06;
      m.material=nt.res==='miss'?S.missMat:S.mats[nt.id]||S.mats.tss;
      m.scale.setScalar(dt<0?1:1+0.25*(1-Math.min(1,dt/0.2)));
    }
  }
  for(const [nt,m] of S.notes){if(!seen.has(nt)){m.visible=false;S.notes.delete(nt);S.pool.push(m);}}
  /* les temps, en fines barres sur chaque couloir utilisé */
  let k=0;
  if(on){
    for(const b of gm.count.concat(gm.chart.beats)){
      const dt=b.t-now;if(dt<0||dt>lead)continue;
      for(const p of pads){
        if(!S.active.has(p.P.lane)||k>=S.ticks.length)continue;
        const m=S.ticks[k++];m.visible=true;
        m.position.copy(p.base).addScaledVector(p.dir,dt/lead*FAR);
        if(p.P.kick)m.position.y=0.01;
        m.scale.set(p.P.kick?0.5:p.P.r*1.4,b.accent?2.5:1,1);
        m.quaternion.copy(p.lane.quaternion);
      }
    }
  }
  for(;k<S.ticks.length;k++)S.ticks[k].visible=false;
  /* éclats : un anneau qui grandit autour du pad touché */
  const bursts=on?gm.bursts.filter(b=>now-b.t>=0&&now-b.t<0.3):[];
  S.rings.forEach((r,i)=>{
    const b=bursts[i];r.visible=!!b;if(!b)return;
    const p=pads[b.lane],a=(now-b.t)/0.3;
    r.position.copy(p.g.position);
    if(p.P.kick){r.position.z+=0.2;r.rotation.set(0,0,0);}else{r.position.y+=0.03;r.rotation.set(Math.PI/2,0,0);}
    r.scale.setScalar(p.P.r*(1+0.6*a));r.material.color.set(COL[b.id]||'#fff');r.material.opacity=1-a;
  });
  /* mots : Parfait, Bien, Raté… au-dessus du pad */
  const pops=on?gm.pops.filter(x=>now-x.t>=0&&now-x.t<0.7&&pads[x.lane]):[];
  S.pops.forEach((m,i)=>{
    const x=pops[pops.length-1-i];m.visible=!!x;if(!x)return;
    const p=pads[x.lane],a=(now-x.t)/0.7;
    m.material.map=popTexture(x.txt,x.kind);m.material.opacity=1-a*a;
    m.position.copy(p.g.position);m.position.y+=(p.P.kick?p.P.r+0.12:0.16)+0.08*a;
    if(p.P.kick)m.position.z+=0.2;
  });
  /* score et jauge */
  S.hud.mesh.visible=!!on;
  if(on){
    const sc=gm.sc,mult=Math.min(4,1+Math.floor(sc.streak/8));
    const lines=[{t:sc.pts+' points'+(mult>1?'  ×'+mult:''),size:6,weight:800},{t:sc.streak>1?'Série de '+sc.streak:(S.preview?'P : pause':'B/Y : pause'),size:3.6,color:'#97A1B2'}];
    if(now<gm.firstT-0.2)lines[1]={t:'Prépare-toi…',size:3.6,color:'#F2BB4A'};
    drawPanel(S.hud,lines,{bar:gm.loop||api.noFail()?null:gm.gauge});
  }
  /* menu : hors partie, ou en pause */
  const mode=menuMode();
  S.menu.mesh.visible=!!mode;
  if(mode){
    drawMenu(mode);
    /* en pause, le menu vient devant les couloirs ; masqué, il descend au bas du champ */
    S.menu.mesh.position.z=mode==='pause'?-0.9:-1.25;
  }
}

/* Le menu dans le casque, en trois formes :
   - « main » (hors partie) : chant, nombre de notes, tolérance, tempo, grosse caisse, ralentir,
     angle des baguettes, hauteur de la batterie, puis Jouer, Masquer, Quitter ;
   - « mini » : le menu masqué, réduit à un bouton, pour jouer librement sur la batterie ;
   - « pause » (en partie, après B/Y) : Reprendre, Recommencer, Menu.
   On vise avec la manette et on appuie sur la gâchette, ou on se déplace au stick et on valide avec A/X ;
   en aperçu, souris ou clavier. Tout est dessiné sur un canvas : chaque bouton garde son rectangle (en cm). */
const MW=124,MH=108;
const KICKS={gachette:'Gâchette',auto:'Automatique',tete:'Hoche la tête'};
const KICK_HINT={gachette:'Gâchette d\'une main (ou la pédale MIDI)',auto:'La grosse caisse joue toute seule : tu fais les mains',tete:'Un petit coup de tête vers le bas = grosse caisse'};
function menuMode(){const gm=S.api.gm;return gm.on?(S.paused?'pause':null):S.mini?'mini':S.sub?'kit':'main';}
function menuItems(mode){
  const {api}=S,it=[];
  if(mode==='mini'){it.push({id:'open',x:MW/2-16,y:MH-14,w:32,h:10,txt:'☰ Menu',big:true});return it;}
  if(mode==='pause'){
    it.push({id:'resume',x:20,y:34,w:MW-40,h:13,txt:'Reprendre',big:true});
    it.push({id:'restart',x:20,y:51,w:(MW-44)/2,h:10,txt:'Recommencer'});
    it.push({id:'menu',x:24+(MW-44)/2,y:51,w:(MW-44)/2,h:10,txt:'Arrêter (menu)'});
    return it;
  }
  const o=api.opts(),src=api.sources(),i=Math.max(0,src.findIndex(x=>x.id===o.rh));
  const cur=src[i]||{label:'—'};
  const H=6.6;
  const row=(y,lab)=>it.push({t:'lab',x:5,y,w:24,h:H,txt:lab});
  const seg=(y,key,opts,val)=>{const ks=Object.keys(opts),w=(MW-35)/ks.length;ks.forEach((k,j)=>it.push({id:key+':'+k,x:30+j*w,y,w:w-1.5,h:H,txt:opts[k],on:k===val}));};
  const pm=(y,x,w,key,val)=>{it.push({id:key+'-',x,y,w:9,h:H,txt:'−'});it.push({t:'val',x:x+9.5,y,w:w-19,h:H,txt:val});it.push({id:key+'+',x:x+w-9,y,w:9,h:H,txt:'+'});};
  if(mode==='kit'){
    row(20,'Sons');seg(20,'sound',o.sounds,o.sound);
    row(28,'Style');seg(28,'style',STYLES,S.style);
    row(36,'Disposition');seg(36,'lay',LAYOUTS,S.layout);
    row(44,'Baguettes');pm(44,30,MW-35,'tilt','angle '+Math.round(S.tilt*180/Math.PI)+'°');
    row(52,'Hauteur, recul');
    pm(52,30,(MW-37)/2,'haut',(S.hOff>0?'+':'')+Math.round(S.hOff*100)+' cm');
    pm(52,32+(MW-37)/2,(MW-37)/2,'dist',(S.dOff>0?'+':'')+Math.round(S.dOff*100)+' cm');
    row(60,'Incliner');
    pm(60,30,(MW-37)/2,'pitch','avant '+Math.round(S.pitch*180/Math.PI)+'°');
    pm(60,32+(MW-37)/2,(MW-37)/2,'roll','côté '+(S.roll>0.005?'+':'')+Math.round(S.roll*180/Math.PI)+'°');
    row(68,'Décor');seg(68,'decor',DECORS,S.decor);
    it.push({id:'back',x:30,y:77,w:MW-60,h:10,txt:'‹ Retour',big:true});
    return it;
  }
  row(19,'Chant');
  it.push({id:'src-',x:30,y:19,w:8,h:H,txt:'◀'});
  it.push({t:'val',x:39.5,y:19,w:MW-56,h:H,txt:cur.label+'  ('+(i+1)+'/'+src.length+')'});
  it.push({id:'src+',x:MW-14,y:19,w:8,h:H,txt:'▶'});
  row(27,'Notes');seg(27,'lvl',o.levels,o.lvl);
  row(35,'Tolérance');seg(35,'tol',o.tols,o.tol);
  row(43,'Tempo');
  if(o.songBpm)it.push({t:'val',x:30,y:43,w:MW-35,h:H,txt:'Tempo du chant : '+o.songBpm+' BPM'});
  else pm(43,30,MW-35,'bpm',o.bpm+' BPM');
  row(51,'Grosse caisse');seg(51,'kick',KICKS,o.kick);
  row(59,'Ralentir');
  it.push({id:'slow',x:30,y:59,w:MW-35,h:H,txt:o.slow?'Oui : ralentit quand ça coince':'Non',on:o.slow});
  row(67,'Batterie');
  it.push({id:'kitmenu',x:30,y:67,w:55,h:H,txt:'Sons, style, décor ›'});
  it.push({id:'import',x:87,y:67,w:MW-92,h:H,txt:'+ Mes chants'});
  it.push({id:'play',x:30,y:76,w:MW-80,h:10,txt:S.busy?'Chargement…':'Jouer',big:true});
  it.push({id:'mini',x:MW-49,y:76,w:21,h:10,txt:'Masquer'});
  it.push({id:'quit',x:MW-27,y:76,w:21,h:10,txt:'Quitter'});
  return it;
}
const FOCUS0={main:'play',pause:'resume',mini:'open',kit:'back'};
function drawMenu(mode){
  const {api}=S,p=S.menu;
  S.items=menuItems(mode);
  if(!S.items.some(b=>b.id===S.focus))S.focus=FOCUS0[mode];
  const hov=[...S.hover.values()].filter(Boolean);
  const R=S.result,nc=S.checked.size;
  let title='Poum Tchak · VR',status=null,foot=[];
  if(mode==='pause'){title='Pause';status={t:api.title(),c:'#97A1B2'};foot=[{t:'B/Y ou A/X : reprendre · vise un bouton, gâchette pour choisir',c:'#C9D1DC'}];}
  else if(mode==='main'||mode==='kit'){
    if(mode==='kit')title='Ma batterie';
    if(mode==='kit')status=S.msg?{t:S.msg,c:'#F2BB4A'}:{t:'Frappe un pad pour entendre le son choisi',c:'#97A1B2'};
    else if(R&&!R.quit)status={t:(R.fell?'Boum ! La jauge est vide · ':'★'.repeat(R.stars)+'☆'.repeat(3-R.stars)+'  ')+R.p+' % · '+R.pts+' points · série '+R.best,c:'#F2BB4A'};
    else if(S.msg)status={t:S.msg,c:'#F2BB4A'};
    else status={t:KICK_HINT[api.opts().kick],c:'#97A1B2'};
    foot=[
      nc>=S.pads.length?{t:'Tous les pads répondent ✓',c:'#7BE3A6'}:{t:'Vérifie tes pads : frappe chacun une fois ('+nc+'/'+S.pads.length+')',c:'#E8ECF2'},
      S.preview?{t:'Souris, ou flèches + Entrée · Échap : quitter · P : pause · B F D J K L : frapper',c:'#C9D1DC'}:
        {t:'Vise + gâchette, ou stick droit + A · stick gauche : se déplacer (poignée serrée : incliner) · B/Y : quitter',c:'#C9D1DC'},
      {t:api.midiText(),c:'#7BE3A6'}
    ];
  }
  const key=JSON.stringify([mode,S.items.map(x=>[x.txt,x.on]),hov,S.focus,status,foot]);
  if(key===p.key)return;p.key=key;
  const {cx,cv}=p,k=cv.width/MW;
  cx.clearRect(0,0,cv.width,cv.height);
  const box=(x,y,w,h,r)=>{cx.beginPath();if(cx.roundRect)cx.roundRect(x*k,y*k,w*k,h*k,r*k);else cx.rect(x*k,y*k,w*k,h*k);};
  if(mode!=='mini'){
    const h=mode==='pause'?70:MH-1;
    cx.fillStyle='rgba(11,14,20,0.92)';box(0.5,0.5,MW-1,h,5);cx.fill();cx.strokeStyle='#39414F';cx.lineWidth=3;cx.stroke();
  }
  cx.textAlign='center';cx.textBaseline='middle';
  const text=(t,x,y,size,color,weight,maxW)=>{cx.font=(weight||600)+' '+size*k+'px '+FONT;cx.fillStyle=color;cx.fillText(t,x*k,y*k,maxW?maxW*k:undefined);};
  if(mode!=='mini'){text(title,MW/2,mode==='pause'?12:7,mode==='pause'?8:5.6,'#E8ECF2',800);if(status)text(status.t,MW/2,mode==='pause'?22:13.5,3.2,status.c,700,MW-8);}
  for(const b of S.items){
    const cxm=(b.x+b.w/2),cym=b.y+b.h/2;
    if(b.t==='lab'){cx.textAlign='left';text(b.txt,b.x,cym,3.2,'#97A1B2',700,b.w);cx.textAlign='center';continue;}
    if(b.t==='val'){text(b.txt,cxm,cym,3.2,'#E8ECF2',700,b.w-1);continue;}
    const h=hov.includes(b.id),f=S.focus===b.id;
    cx.fillStyle=b.big?(h||f?'#9BF0BF':'#7BE3A6'):b.on?'#2F4BD0':h?'#39414F':'#1D232E';
    box(b.x,b.y,b.w,b.h,1.6);cx.fill();
    cx.strokeStyle=h||f?'#FFFFFF':b.on?'#8D9CFF':'#39414F';cx.lineWidth=h||f?5:2;cx.stroke();
    text(b.txt,cxm,cym+0.2,b.big?4.6:3.1,b.big?'#0B0E14':'#E8ECF2',b.big?800:700,b.w-1);
  }
  foot.forEach((f,j)=>text(f.t,MW/2,91+j*5.5,2.8,f.c,600,MW-6));
  p.tex.needsUpdate=true;
}
/* Le stick (ou les flèches) déplace le bouton choisi : haut/bas d'une ligne, gauche/droite dans la ligne. */
function menuMove(dx,dy){
  const L=S.items.filter(b=>b.id);if(!L.length)return;
  let cur=L.find(b=>b.id===S.focus)||L[0];
  const cxOf=b=>b.x+b.w/2;
  if(dx){
    const rowI=L.filter(b=>Math.abs(b.y-cur.y)<1).sort((a,b)=>a.x-b.x),i=rowI.indexOf(cur);
    cur=rowI[(i+dx+rowI.length)%rowI.length];
  }else if(dy){
    const ys=[...new Set(L.map(b=>b.y))].sort((a,b)=>a-b),i=ys.indexOf(cur.y),y=ys[(i+dy+ys.length)%ys.length];
    const rowI=L.filter(b=>b.y===y);
    cur=rowI.reduce((a,b)=>Math.abs(cxOf(b)-cxOf(cur))<Math.abs(cxOf(a)-cxOf(cur))?b:a);
  }
  S.focus=cur.id;
}
/* Le bouton du menu sous un rayon (origine, direction dans le monde), ou null. */
const _ray=new THREE.Raycaster();
function menuAt(origin,dir){
  if(!S.menu.mesh.visible)return null;
  _ray.set(origin,dir);
  const h=_ray.intersectObject(S.menu.mesh,false)[0];
  if(!h||!h.uv)return {hit:null};
  const x=h.uv.x*MW,y=(1-h.uv.y)*MH;
  const b=S.items.find(b=>b.id&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
  return {hit:h,id:b?b.id:null};
}
function menuDo(id){
  const {api}=S,o=api.opts();
  if(!id||S.busy)return;
  S.focus=id;
  if(id==='resume'){pause(false);return;}
  if(id==='restart'){pause(false);api.stop();S.result=null;start();return;}
  if(id==='menu'){pause(false);api.stop();return;}
  if(id==='open'){S.mini=false;return;}
  S.result=null;S.msg='';
  if(id==='play'){start();return;}
  if(id==='mini'){S.mini=true;return;}
  if(id==='import'){S.afterExit=()=>s_importPrompt(api);exit();return;}
  if(id==='kitmenu'){S.sub=true;S.focus='back';return;}
  if(id==='back'){S.sub=false;S.focus='kitmenu';return;}
  if(id==='quit'){exit();return;}
  if(id==='src-'||id==='src+'){const L=api.sources();let i=L.findIndex(x=>x.id===o.rh);i=(i+(id==='src+'?1:L.length-1))%L.length;api.set('rh',L[i<0?0:i].id);}
  else if(id==='bpm-'||id==='bpm+')api.set('bpm',o.bpm+(id==='bpm+'?5:-5));
  else if(id==='tilt-'||id==='tilt+'){setTilt(S.tilt+(id==='tilt+'?0.05:-0.05));S.msg='';}
  else if(id==='roll-'||id==='roll+'){setRoll(Math.round((S.roll+(id==='roll+'?1:-1)*Math.PI/12)/(Math.PI/12))*(Math.PI/12));S.msg='';}
  else if(id==='pitch-'||id==='pitch+'){setPitch(Math.round((S.pitch+(id==='pitch+'?1:-1)*Math.PI/12)/(Math.PI/12))*(Math.PI/12));S.msg='';}
  else if(id==='dist-'||id==='dist+'){setDist(S.dOff+(id==='dist+'?0.1:-0.1));S.msg='';}
  else if(id==='haut-'||id==='haut+'){setHeight(S.hOff+(id==='haut+'?0.02:-0.02));S.msg='';}
  else if(id==='slow')api.set('slow',!o.slow);
  else{
    const [k,v]=id.split(':');
    if(k==='style')setStyle(v);
    else if(k==='decor')setDecor(v);
    else if(k==='lay')setLayout(v);
    else{api.set(k,v);if(k==='sound')api.play('tchak',1);}
  }
}
/* Choisir un fichier est impossible dans le casque : on revient à la page, sur le bouton d'import. */
function s_importPrompt(api){if(api.importPrompt)api.importPrompt();}
/* Pause : le son s'arrête et la partie se fige (l'horloge du son ne bouge plus). */
function pause(on){
  if(on===S.paused)return;
  if(on&&!S.api.gm.on)return;
  S.paused=on;S.api.pause(on);
  if(on)S.focus='resume';
}
/* Les rayons des manettes, visibles quand le menu est là. */
function addRay(st,i){
  const ctl=S.renderer.xr.getController(i);S.scene.add(ctl);
  const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1)]);
  const line=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x7BE3A6,transparent:true,opacity:0.8}));
  line.scale.z=2.5;ctl.add(line);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(0.008,8,6),new THREE.MeshBasicMaterial({color:0xffffff}));S.scene.add(dot);
  st.ray=ctl;st.line=line;st.dot=dot;
}
const _o=new THREE.Vector3(),_d=new THREE.Vector3(),_q=new THREE.Quaternion();
function rays(){
  for(const st of S.sticks){
    if(!st.ray)continue;
    const show=S.menu.mesh.visible&&!!st.src;
    st.line.visible=show;st.dot.visible=false;
    if(!show){S.hover.delete(st);continue;}
    st.ray.getWorldPosition(_o);st.ray.getWorldQuaternion(_q);_d.set(0,0,-1).applyQuaternion(_q);
    const m=menuAt(_o,_d);
    S.hover.set(st,m&&m.id||null);
    if(m&&m.hit){st.line.scale.z=m.hit.distance;st.dot.position.copy(m.hit.point);st.dot.visible=true;}else st.line.scale.z=2.5;
  }
}
/* Tests : un bouton du menu, comme si on l'avait visé. */
export function simMove(dx,dz){if(S)moveBy(dx,dz);}
export function simRoll(deg){if(S)setRoll(deg*Math.PI/180);}
export function simPitch(deg){if(S)setPitch(deg*Math.PI/180);}
export function simTurn(dir){if(S)turnBy(dir>0?-TURN:TURN);}
export function menuPress(id){if(S&&S.menu.mesh.visible)menuDo(id);}
export function menuIds(){return S?S.items.filter(b=>b.id).map(b=>b.id):[];}

/* Tests automatiques et aperçu : un coup de baguette simulé sur le pad d'un couloir,
   au-dessus puis en dessous de sa surface, deux images de suite. */
export function simStrike(lane){
  if(!S)return false;
  const p=S.pads[lane];if(!p)return false;
  if(p.P.kick){strike(p,S.api.atPerf(performance.now()),1);return true;}
  const c=p.g.position,t=performance.now(),top=c.y+0.02;
  /* la pointe descend à 3 m/s et passe la surface du pad maintenant */
  S.simQueue.push([c.x,top+0.03,c.z,t-10],[c.x,top-0.03,c.z,t+10],[c.x,top+0.2,c.z,t+60]);
  return true;
}
export function debug(){
  if(!S)return null;
  const w=v=>[+v.x.toFixed(3),+v.y.toFixed(3),+v.z.toFixed(3)];
  return {headKicks:S.headKicks||0,frames:S.frames||0,frameMs:+(S.dt||0).toFixed(1),calls:S.renderer.info.render.calls,tris:S.renderer.info.render.triangles,tilt:S.tilt,xr:!!S.session,yaw:+(S.base?S.base.yaw:0).toFixed(3),pitch:+(S.pitch||0).toFixed(3),roll:+(S.roll||0).toFixed(3),kitPos:w(S.kit.position),
    padsWorld:S.pads.map(p=>w(p.g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,p.P.kick?0:0.02,0)))),
    tips:S.sticks.filter(s=>!s.sim).map(s=>s.src?{hand:s.hand,pos:w(s.tip.getWorldPosition(new THREE.Vector3()))}:null),
    checked:[...S.checked],placed:S.placed,padH:S.padH,notes:S.notes.size,active:[...S.active],menu:S.menu.mesh.visible,hud:S.hud.mesh.visible,result:S.result,msg:S.msg,pads:S.pads.map(p=>p.P.id),layout:S.layout,style:S.style,decor:S.decor,bg:S.scene.background.getHexString(),flames:S.decors.chapelle.flames.filter(f=>f.visible).length,moved:+(S.moved||0).toFixed(3),turns:S.turns||0,padR:S.pads.map(p=>+p.P.r.toFixed(3)),shells:S.pads.filter(p=>p.shell&&p.shell.visible).length};
}
/* Tests : le nombre d'images dessinées depuis l'entrée en VR. */
export function frames(){return S?S.frames||0:0;}
/* La page : P ou Échap pendant une partie en VR met en pause (ou reprend). */
export function togglePause(){if(S&&S.api.gm.on)pause(!S.paused);}
export function state(){return S?{mode:menuMode(),focus:S.focus,paused:S.paused,mini:S.mini}:null;}
