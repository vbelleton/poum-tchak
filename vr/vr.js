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
     busy:false,active:new Set(),checked:new Set(),btnPrev:new Map(),simQueue:[],keyH:null,ptrH:null,resizeH:null,canvas:renderer.domElement};
  scene.add(S.kit);
  buildWorld();
  if(preview){
    const cv=renderer.domElement;cv.id='vrPreview';
    Object.assign(cv.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'60',background:'#0B0E14',touchAction:'none'});
    document.body.appendChild(cv);
    const size=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};
    size();S.resizeH=size;addEventListener('resize',size);
    camera.position.set(0,1.5,0.45);camera.lookAt(0,0.95,-1.2);
    place(new THREE.Vector3(0,1.42,0),0,true);
    addSimStick();
    S.keyH=e=>{ /* pendant la partie, le clavier appartient au jeu de la page (touches B F D J K L) */
      if(api.gm.on)return;
      if(e.key==='Escape'){e.preventDefault();exit();}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();start();}
    };
    document.addEventListener('keydown',S.keyH);
    S.ptrH=e=>{ /* un clic sur un pad : une frappe */
      const r=cv.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      const hit=ray.intersectObjects(S.pads.map(p=>p.mesh),false)[0];
      if(hit)strike(S.pads.find(p=>p.mesh===hit.object),api.atPerf(e.timeStamp||performance.now()),1);
      else if(!api.gm.on)start();
    };
    cv.addEventListener('pointerdown',S.ptrH);
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
  const grid=new THREE.GridHelper(30,60,0x262D39,0x1A1F29);kit.add(grid);
  const stage=new THREE.Mesh(new THREE.CircleGeometry(1.25,64),new THREE.MeshStandardMaterial({color:0x151A24,roughness:0.9}));
  stage.rotation.x=-Math.PI/2;stage.position.y=0.002;kit.add(stage);
  const gem=new THREE.CylinderGeometry(0.07,0.07,0.028,28);
  const kickGem=new THREE.BoxGeometry(0.42,0.05,0.07);
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
    S.pads.push({P,g,mesh,padMat,rimMat,lab,lane,base:new THREE.Vector3(),dir:new THREE.Vector3(),color:c});
  }
  S.gem=gem;S.kickGem=kickGem;
  /* repères des temps sur les couloirs */
  const tickGeo=new THREE.BoxGeometry(1,0.004,0.012),tickMat=new THREE.MeshBasicMaterial({color:0x4A5466,transparent:true,opacity:0.7});
  for(let i=0;i<72;i++){const m=new THREE.Mesh(tickGeo,tickMat);m.visible=false;kit.add(m);S.ticks.push(m);}
  /* éclats de frappe et mots qui s'envolent */
  const ringGeo=new THREE.TorusGeometry(1,0.06,8,40);
  for(let i=0;i<10;i++){const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false}));m.visible=false;kit.add(m);S.rings.push(m);}
  const popGeo=new THREE.PlaneGeometry(0.28,0.07);
  for(let i=0;i<10;i++){const m=new THREE.Mesh(popGeo,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));m.visible=false;m.renderOrder=5;kit.add(m);S.pops.push(m);}
  /* score au-dessus de la batterie, menu devant */
  S.hud=panel(0.9,0.2);kit.add(S.hud.mesh);
  S.menu=panel(1.1,0.62);kit.add(S.menu.mesh);
}

/* Pose la batterie à la hauteur et dans la direction du joueur. head : position de la tête. */
function place(head,yaw,fixedFloor){
  const local=!fixedFloor&&S.renderer.xr.isPresenting&&head.y<0.5; /* repère sans sol : on suppose 1,60 m */
  S.floorY=local?head.y-1.6:0;
  S.padH=Math.max(0.45,Math.min(1.15,head.y-S.floorY-0.62));
  S.kit.position.set(head.x,S.floorY,head.z);S.kit.rotation.set(0,yaw,0);
  for(const p of S.pads){
    const P=p.P;
    if(P.kick){p.g.position.set(P.x,P.r+0.02,P.z);p.base.set(P.x,0.03,P.z+0.3);p.dir.set(0,0,-1);}
    else{
      p.g.position.set(P.x,S.padH+P.y,P.z);p.base.copy(p.g.position);
      p.dir.set(P.x*0.9,0.28,-1).normalize();
      const h=S.padH+P.y;P.stand.scale.y=h;P.stand.position.y=-h/2;
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
  S.menu.mesh.position.set(0,S.padH+0.66,-1.3);S.menu.mesh.rotation.x=-0.08;
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
  const holder=new THREE.Group();holder.rotation.x=-0.45;grip.add(holder); /* baguette un peu vers le bas */
  const wood=new THREE.MeshStandardMaterial({color:0xE9D6B0,roughness:0.5});
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.009,STICK,10),wood);
  stick.rotation.x=-Math.PI/2;stick.position.z=-STICK/2+0.05;holder.add(stick);
  const tipM=new THREE.Mesh(new THREE.SphereGeometry(0.012,10,8),wood);tipM.position.z=-STICK+0.05;holder.add(tipM);
  const st={grip,tip:tipM,src:null,prev:null,prevT:0,armed:new Map(),hand:''};
  grip.addEventListener('connected',e=>{st.src=e.data;st.hand=e.data.handedness||'';});
  grip.addEventListener('disconnected',()=>{st.src=null;st.prev=null;});
  S.sticks.push(st);
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
    if(down(0)){const p=S.pads[0];p.hitT=performance.now();strike(p,S.api.atPerf(t),1);pulse(st,0.8,35);}
    if(down(3))placeFromHead();
    if(down(4)&&!S.api.gm.on)start();
    if(down(5)){if(S.api.gm.on)S.api.stop();else exit();}
    S.btnPrev.set(st,now);
  }
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
  const {api,renderer,scene,camera}=S,gm=api.gm;
  if(!S.placed&&frame){
    const cam=renderer.xr.getCamera(),v=new THREE.Vector3();cam.getWorldPosition(v);
    if(v.lengthSq()>0.01)placeFromHead();
  }
  if(S.placed){sticks(t);if(frame)buttons(t);}  /* les coups d'abord, puis les notes ratées */
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
    const lines=[{t:sc.pts+' points'+(mult>1?'  ×'+mult:''),size:6,weight:800},{t:sc.streak>1?'Série de '+sc.streak:' ',size:3.6,color:'#97A1B2'}];
    if(now<gm.firstT-0.2)lines[1]={t:'Prépare-toi…',size:3.6,color:'#F2BB4A'};
    drawPanel(S.hud,lines,{bar:gm.loop||api.noFail()?null:gm.gauge});
  }
  /* menu, hors partie */
  S.menu.mesh.visible=!on;
  if(!on){
    const L=[{t:'Poum Tchak · VR',size:6.4,weight:800},{t:api.title(),size:3.8,color:'#97A1B2'}];
    const R=S.result;
    if(R&&!R.quit){
      L.push({t:R.fell?'Boum ! La jauge est vide.':'★'.repeat(R.stars)+'☆'.repeat(3-R.stars),size:R.fell?4:6,color:'#F2BB4A',weight:800});
      L.push({t:R.p+' % · '+R.pts+' points · série '+R.best,size:4.2});
    }else if(S.msg)L.push({t:S.msg,size:3.8,color:'#F2BB4A'});
    else L.push({t:' ',size:2});
    const nc=S.checked.size;
    L.push(nc>=S.pads.length?{t:'Tous les pads répondent ✓',size:3.6,color:'#7BE3A6'}:{t:'Vérifie tes pads : frappe chacun une fois ('+nc+'/'+S.pads.length+')',size:3.6,color:'#E8ECF2'});
    if(S.preview)L.push({t:'Entrée : jouer · Échap : quitter · B F D J K L ou clic : frapper',size:3.8,color:'#C9D1DC'});
    else{
      L.push({t:'A ou X : jouer · B ou Y : quitter la VR',size:4.2,color:'#C9D1DC'});
      L.push({t:'Baguettes : frappe les pads · Gâchette : grosse caisse',size:3.8,color:'#97A1B2'});
      L.push({t:'Stick enfoncé : replacer la batterie devant toi',size:3.8,color:'#97A1B2'});
    }
    L.push({t:api.midiText(),size:3.8,color:'#7BE3A6'});
    drawPanel(S.menu,L);
  }
}

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
  return {checked:[...S.checked],placed:S.placed,padH:S.padH,notes:S.notes.size,active:[...S.active],menu:S.menu.mesh.visible,hud:S.hud.mesh.visible,result:S.result,msg:S.msg,pads:S.pads.map(p=>p.P.id)};
}
