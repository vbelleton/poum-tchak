/* Drumstick Spin. Étape 1 : suivi des mains WebXR, pince pouce + index, baguette virtuelle tenue entre les doigts.
   Étape 2 (MVP) : un seul trick, Thumb Around. La baguette tourne autour du pouce (pivot), le détecteur
   vérifie le pivot, la rotation complète et le rattrapage par la pince (pas seulement un tour de 360°).
   Ce module ne touche ni à la batterie ni au menu : vr.js l'allume, lui donne la scène et la session,
   et appelle update() à chaque image. Le pincement vient du suivi de core three.js (hand.inputState). */
import * as THREE from './three.module.min.js';
import { XRHandModelFactory } from './addons/webxr/XRHandModelFactory.js';
import { GLTFLoader } from './addons/loaders/GLTFLoader.js';

/* La main réaliste : le modèle de main standard WebXR (generic-hand, peau et doigts articulés),
   gardé dans vr/hands/ pour marcher hors ligne. Tant qu'il n'est pas chargé, la main est dessinée en os. */
let handFactory=null;

const STICK=0.40;            /* longueur de la baguette virtuelle (m), comme dans vr.js */
const HOLD_EXIT_MS=2000;     /* les deux pinces tenues ce temps = retour à la batterie */
const UP=new THREE.Vector3(0,1,0);
/* main fantôme : place par rapport au panneau (m), orientation (rad), et pliage des doigts (rad) */
const GHOST={x:0.42,y:-0.08,z:-0.4,rx:Math.PI/2,ry:0,rz:0,curl:1.2,scale:1.4};

/* Thumb Around : seuils, à calibrer sur le casque */
const TA={
  full:Math.PI*5/3,          /* 300° : la rotation est complète */
  pivotMax:0.02,             /* le pouce ne doit pas bouger de plus de 2 cm pendant le tour */
  minSpan:0.06,              /* la baguette doit être bien dépliée pour compter */
  timeout:3000               /* ms : sans rattrapage au bout de 3 s, on recommence */
};
const COACH={
  pivot:'Garde ton pouce comme pivot.',
  incomplete:'La rotation est incomplète.',
  catch:'Anticipe le rattrapage.',
  ok:'Bravo, tu as réussi !',
  sens:'Dans l\'autre sens !'
};

const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_m=new THREE.Matrix4(),_p=new THREE.Vector3();
const _u=new THREE.Vector3(),_v=new THREE.Vector3(),_vp=new THREE.Vector3(),_e1=new THREE.Vector3(),_e2=new THREE.Vector3();

/* Ma prise : on enregistre la vraie main du joueur (suivi des mains) qui tient une baguette, pour que les mains
   dessinées pendant le jeu reprennent exactement cette prise. Les articulations sont rangées dans le repère
   du support de la baguette de vr.js : la baguette part vers -z, le pouce vers +y, l'origine au milieu des doigts.
   get(nom) rend {p,q} (position et rotation de l'articulation) ou null. */
export const PRISE_KEY='poumtchak.vr.prise';
export const JOINTS=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
  ...['index-finger','middle-finger','ring-finger','pinky-finger'].flatMap(f=>['metacarpal','phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'].map(j=>f+'-'+j))];
export function gripFromJoints(get){
  const P=n=>{const j=get(n);return j?j.p:null;};
  for(const n of JOINTS)if(!get(n))return null;
  /* la baguette : du talon de la main (entre le poignet et la base de l'auriculaire) jusqu'au point d'appui
     (entre le bout du pouce et le milieu de l'index) */
  const F=P('thumb-tip').clone().add(P('index-finger-phalanx-intermediate')).multiplyScalar(0.5);
  const H=P('wrist').clone().add(P('pinky-finger-phalanx-proximal')).multiplyScalar(0.5);
  const D=F.clone().sub(H);if(D.lengthSq()<1e-6)return null;D.normalize();
  const Z=D.clone().negate();
  const Y=P('index-finger-metacarpal').clone().sub(P('pinky-finger-metacarpal'));Y.addScaledVector(D,-Y.dot(D));
  if(Y.lengthSq()<1e-8)return null;Y.normalize();
  const X=new THREE.Vector3().crossVectors(Y,Z);
  const C=new THREE.Vector3();for(const f of ['index','middle','ring','pinky'])C.add(P(f+'-finger-phalanx-proximal'));C.multiplyScalar(0.25);
  const O=F.clone().addScaledVector(D,C.clone().sub(F).dot(D));
  const M=new THREE.Matrix4().makeBasis(X,Y,Z).setPosition(O),inv=M.clone().invert();
  const mq=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,Z)).invert();
  const out={};
  for(const n of JOINTS){const j=get(n),p=j.p.clone().applyMatrix4(inv),q=mq.clone().multiply(j.q);
    out[n]=[p.x,p.y,p.z,q.x,q.y,q.z,q.w].map(v=>+v.toFixed(5));}
  return out;
}
export function loadPrise(){try{const v=JSON.parse(localStorage.getItem(PRISE_KEY)||'null');return v&&v.left&&v.right?v:null;}catch(e){return null;}}

/* Détecteur de Thumb Around, pur (pas de rendu) : on lui donne, à chaque image, la pince, le pouce,
   l'index et le majeur. Il répond par null, ou par un résultat : { ok, msg }.
   Déroulé : la pince tient la baguette, la rotation autour du pouce démarre ; la pince s'ouvre
   (la baguette tourne librement) ; la pince se referme (rattrapage) : on compte le tour fait. */
export class ThumbAroundDetector{
  /* dir : 0 = un sens ou l'autre, 1 = Thumb Around, -1 = Reverse Thumb Around */
  constructor(dir=0){this.dir=dir;this.reset();}
  reset(){
    this.phase='idle';     /* idle → roll (tourne sans pince) → caught */
    this.total=0;this.prev=null;this.thumb0=null;this.e1=null;this.e2=null;
    this.t0=0;this.lastT=0;this.free=false;this.pinchPrev=false;
  }
  /* s : { t (ms), pinch, thumb, index, middle } (les positions sont des Vector3) */
  step(s){
    const {t,pinch}=s;
    _u.copy(s.index).sub(s.thumb);
    if(_u.lengthSq()<1e-8){this.pinchPrev=pinch;return null;}
    _u.normalize();
    _v.copy(s.middle).sub(s.thumb);
    _vp.copy(_v).addScaledVector(_u,-_v.dot(_u));   /* la baguette, dans le plan du tour */
    const span=_vp.length();
    let res=null;

    if(this.phase==='idle'){
      /* départ : la pince tient la baguette et elle est bien dépliée */
      if(pinch&&span>TA.minSpan){
        this.phase='roll';this.t0=t;this.thumb0=s.thumb.clone();
        this.e1=_vp.clone().normalize();
        this.e2=new THREE.Vector3().crossVectors(_u,this.e1).normalize();
        this.prev=Math.atan2(_vp.dot(this.e2),_vp.dot(this.e1));
        this.total=0;this.free=false;
      }
    }else if(this.phase==='roll'){
      /* le pouce doit rester le pivot */
      if(s.thumb.distanceTo(this.thumb0)>TA.pivotMax){res={ok:false,msg:COACH.pivot};}
      else if(span>TA.minSpan){
        const a=Math.atan2(_vp.dot(this.e2),_vp.dot(this.e1));
        let d=a-this.prev;
        if(d>Math.PI)d-=2*Math.PI;else if(d<-Math.PI)d+=2*Math.PI;
        this.total+=d;this.prev=a;
      }
      if(!res&&!pinch&&this.pinchPrev)this.free=true;       /* la pince s'ouvre : la baguette tourne librement */
      if(!res&&pinch&&!this.pinchPrev&&this.free){            /* rattrapage */
        const turned=Math.abs(this.total);
        if(this.dir&&Math.sign(this.total)!==this.dir&&turned>Math.PI/2)res={ok:false,msg:COACH.sens};
        else res=turned>=TA.full?{ok:true,msg:COACH.ok}:{ok:false,msg:COACH.incomplete};
      }
      if(!res&&t-this.t0>TA.timeout)res={ok:false,msg:COACH.catch};
      if(res)this.reset();
    }
    this.pinchPrev=pinch;
    return res;
  }
  /* pour l'affichage : la baguette, du pouce vers le majeur, dans le plan du tour */
  stickDir(s,out){return out.copy(s.middle).sub(s.thumb);}
}

/* La main, dessinée en os (des segments entre les articulations) avec les bouts des doigts en boules :
   plus lisible que les points d'une articulation chacune. Les chaînes suivent la structure WebXR. */
const CHAINS=[
  ['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'],
  ['index-finger-metacarpal','index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip'],
  ['middle-finger-metacarpal','middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip'],
  ['ring-finger-metacarpal','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip'],
  ['pinky-finger-metacarpal','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip']
];
const TIPS=CHAINS.map(c=>c[c.length-1]);
const MAX_BONES=2*30,MAX_TIPS=2*5,MAX_KNUCKLES=2*25;
const BONE_R=0.0085,TIP_R=0.011;
const PALM=['wrist','thumb-phalanx-proximal','index-finger-phalanx-proximal','middle-finger-phalanx-proximal','ring-finger-phalanx-proximal','pinky-finger-phalanx-proximal'];

/* renderer, scene, session : la session WebXR en cours. panel, drawPanel : les panneaux de vr.js.
   play(id, force) : le son de vr.js. trick : null (libre) ou 'thumb' (Thumb Around). */
export function create({renderer,scene,session,panel,drawPanel,play,trick=null,store=null,srcs=[]}){
  const hands=[0,1].map(i=>{
    const g=renderer.xr.getHand(i);scene.add(g);
    if(!g.userData.sideH){g.userData.sideH=true;g.addEventListener('connected',e=>{g.userData.side=e.data&&e.data.handedness;});if(srcs[i]&&srcs[i].hand)g.userData.side=srcs[i].handedness;}
    return {g,held:false,mid:new THREE.Vector3(),dir:new THREE.Vector3(0,1,0),seen:false,det:new ThumbAroundDetector(trick==='reverse'?-1:1),pp:false,
      ph:{mode:'none',pos:new THREE.Vector3(),dir:new THREE.Vector3(0,1,0),v:new THREE.Vector3(),w:new THREE.Vector3(),a:0,t0:0,p0:new THREE.Vector3(),lt:0,lm:new THREE.Vector3(),ld:new THREE.Vector3(0,1,0)}};
  });

  handFactory=handFactory||new XRHandModelFactory().setPath('./vr/hands/');
  hands.forEach((h,i)=>{
    /* un modèle par main, gardé d'une session du mode à l'autre */
    if(!h.g.userData.model){h.g.userData.model=handFactory.createHandModel(h.g,'mesh');h.g.add(h.g.userData.model);}
    h.model=h.g.userData.model;
    /* la main était déjà là avant le mode : on lui redonne l'événement de connexion */
    const src=srcs[i];
    if(src&&src.hand&&!h.model.motionController)h.g.dispatchEvent({type:'connected',data:src});
  });
  const meshOn=h=>!!(h.model&&h.model.motionController&&h.model.motionController.bones&&h.model.motionController.bones.length);

  /* une baguette par main, cachée tant que la pince ne la tient pas */
  const wood=new THREE.MeshStandardMaterial({color:0xE9D6B0,roughness:0.5});
  const stickGeo=new THREE.CylinderGeometry(0.006,0.009,STICK,10);
  for(const h of hands){h.stick=new THREE.Mesh(stickGeo,wood);h.stick.visible=false;scene.add(h.stick);}

  /* la main : os (cylindres) et bouts des doigts (boules), chacun en une seule passe de dessin */
  const skin=new THREE.MeshStandardMaterial({color:0xE2B99C,roughness:0.65,transparent:true,opacity:0.8});
  const boneGeo=new THREE.CylinderGeometry(BONE_R,BONE_R,1,10);
  const bones=new THREE.InstancedMesh(boneGeo,skin,MAX_BONES);bones.count=0;bones.frustumCulled=false;scene.add(bones);
  const tips=new THREE.InstancedMesh(new THREE.SphereGeometry(TIP_R,12,8),skin,MAX_TIPS);tips.count=0;tips.frustumCulled=false;scene.add(tips);
  const knuckles=new THREE.InstancedMesh(new THREE.SphereGeometry(BONE_R*1.1,10,6),skin,MAX_KNUCKLES);knuckles.count=0;knuckles.frustumCulled=false;scene.add(knuckles);
  const palmMat=new THREE.MeshStandardMaterial({color:0xE2B99C,roughness:0.7,transparent:true,opacity:0.8,side:THREE.DoubleSide});
  for(const h of hands){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(PALM.length*3),3));
    g.setIndex([0,1,2, 0,2,3, 0,3,4, 0,4,5]);
    h.palm=new THREE.Mesh(g,palmMat);h.palm.visible=false;h.palm.frustumCulled=false;scene.add(h.palm);
  }

  /* le panneau d'aide, devant soi au lancement, puis fixe */
  const cam=renderer.xr.getCamera(),cp=new THREE.Vector3(),cq=new THREE.Quaternion(),fwd=new THREE.Vector3();
  cam.getWorldPosition(cp);cam.getWorldQuaternion(cq);fwd.set(0,0,-1).applyQuaternion(cq);fwd.y=0;
  if(fwd.lengthSq()<1e-4)fwd.set(0,0,-1);fwd.normalize();
  const pnl=panel(0.9,0.36);
  pnl.mesh.position.set(cp.x+fwd.x*1.1,cp.y-0.1,cp.z+fwd.z*1.1);
  pnl.mesh.lookAt(cp.x,cp.y-0.1,cp.z);
  scene.add(pnl.mesh);

  /* Rebond : un pad d'entraînement devant soi, à hauteur de caisse claire. La baguette est tenue
     par la pince pouce-index (le point d'appui) ; on alterne une frappe main ouverte (les autres doigts
     décollés, la baguette rebondit librement) et une frappe doigts fermés (les doigts serrent la baguette). */
  let pad=null,padMat=null,padT=0;
  const reb={expect:'open'};
  /* Moulinet : la baguette tenue en pince dessine un cercle complet (tour de poignet) en moins de 2,5 s */
  const spinT=trick==='thumb'||trick==='reverse';
  const ml={travel:0,t0:0,prev:new THREE.Vector3(),has:false};
  if(trick==='rebond'){
    padMat=new THREE.MeshStandardMaterial({color:0x39414F,roughness:0.8});
    pad=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.03,32),padMat);
    pad.position.set(cp.x+fwd.x*0.45,cp.y-0.6,cp.z+fwd.z*0.45);scene.add(pad);
  }
  const _w2=new THREE.Vector3(),_e2=new THREE.Vector3(),_f2=new THREE.Vector3();

  /* Main fantôme : à côté du panneau, elle rejoue le geste au ralenti, en boucle.
     Thumb Around (et Reverse) : la pince tient, l'index s'ouvre, la baguette fait le tour du pouce, l'index la rattrape.
     Rebond : la main frappe, une fois main ouverte, une fois doigts fermés. */
  const ghost={root:null,bones:{},baseY:0,stick:null,mat:null,smat:null};
  let disposed=false;
  if(trick&&trick!=='prise'){
    ghost.mat=new THREE.MeshStandardMaterial({color:0x9BD8FF,emissive:0x1E4B66,transparent:true,opacity:0.5,depthWrite:false});
    ghost.smat=new THREE.MeshStandardMaterial({color:0x9BD8FF,emissive:0x1E4B66,transparent:true,opacity:0.7});
    ghost.stick=new THREE.Mesh(stickGeo,ghost.smat);ghost.stick.visible=false;scene.add(ghost.stick);
    new GLTFLoader().load('./vr/hands/right.glb',g=>{
      if(disposed)return;
      const root=g.scene;
      root.traverse(o=>{if(o.isMesh){o.material=ghost.mat;o.frustumCulled=false;}if(o.name)ghost.bones[o.name]=o;});
      for(const k in ghost.bones)ghost.bones[k].userData.r0=ghost.bones[k].rotation.clone();
      const right=new THREE.Vector3(-fwd.z,0,fwd.x);
      root.position.copy(pnl.mesh.position).addScaledVector(right,GHOST.x).addScaledVector(fwd,GHOST.z);root.position.y+=GHOST.y;
      root.rotation.set(GHOST.rx,Math.atan2(-fwd.x,-fwd.z)+GHOST.ry,GHOST.rz,'YXZ');
      root.scale.setScalar(GHOST.scale);
      ghost.baseY=root.position.y;scene.add(root);ghost.root=root;
    },undefined,()=>{});
  }
  const _g1=new THREE.Vector3(),_g2=new THREE.Vector3(),_g3=new THREE.Vector3(),_gu=new THREE.Vector3();
  function curl(names,a){for(const n of names){const b=ghost.bones[n];if(b&&b.userData.r0)b.rotation.x=b.userData.r0.x+a;}}
  const BACK=['middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate'];
  function moulinet(h,t){
    if(!ml.has||t-ml.t0>2500){ml.has=true;ml.t0=t;ml.travel=0;ml.prev.copy(h.dir);return;}
    ml.travel+=ml.prev.angleTo(h.dir);ml.prev.copy(h.dir);
    if(ml.travel>=Math.PI*2){ml.has=false;stats.ok++;stats.tries++;play('tchak',0.9);say('Moulinet réussi !',t);if(store&&store.set)store.set(stats);}
  }
  function ghostUpdate(t){
    const r=ghost.root;if(!r)return;
    const B=ghost.bones,pos=(n,v)=>{const b=B[n];if(b)b.getWorldPosition(v);return !!b;};
    if(trick==='rebond'){
      const k=Math.floor(t/1200)%2,s=(t%1200)/1200;
      r.position.y=ghost.baseY+0.08*Math.abs(Math.cos(s*Math.PI));
      curl(BACK,k?GHOST.curl:0);
      r.updateMatrixWorld(true);
      if(!pos('wrist',_g1)||!pos('thumb-tip',_g2)||!pos('index-finger-tip',_g3))return;
      _g2.add(_g3).multiplyScalar(0.5);_gu.copy(_g2).sub(_g1).normalize();
      ghost.stick.position.copy(_g2).addScaledVector(_gu,STICK/2-0.08);
      ghost.stick.quaternion.setFromUnitVectors(UP,_gu);ghost.stick.visible=true;
      return;
    }
    if(trick==='twirl'){
      const MV=[[0,1],[1,2],[2,1],[1,0]],k=Math.floor(t/1000)%4,s=(t%1000)/1000,[fr,to]=MV[k],f=to>fr?to:fr;
      for(let i=1;i<4;i++)curl([FING[i]+'-phalanx-proximal',FING[i]+'-phalanx-intermediate'],i===f?GHOST.curl*Math.sin(Math.PI*Math.min(1,s*1.4)):0);
      r.updateMatrixWorld(true);
      twirlPose(pos,fr,to,s<0.4?0:(s-0.4)/0.6,ghost.stick.position,_g3);
      ghost.stick.quaternion.setFromUnitVectors(UP,_g3);ghost.stick.visible=true;
      return;
    }
    if(trick==='moulinet'){
      r.updateMatrixWorld(true);
      if(!pos('wrist',_g1)||!pos('thumb-tip',_g2)||!pos('index-finger-tip',_g3))return;
      _g2.add(_g3).multiplyScalar(0.5);_gu.copy(_g2).sub(_g1).normalize();
      _g3.set(0,1,0).addScaledVector(_gu,-_gu.y).normalize().applyAxisAngle(_gu,(t%1500)/1500*2*Math.PI);
      ghost.stick.position.copy(_g2);ghost.stick.quaternion.setFromUnitVectors(UP,_g3);ghost.stick.visible=true;
      return;
    }
    const ph=(t%4500)/4500;
    const open=ph<0.2?0:ph<0.28?(ph-0.2)/0.08:ph<0.8?1:ph<0.88?1-(ph-0.8)/0.08:0;
    const ang=ph<0.28?0:ph<0.8?(ph-0.28)/0.52*2*Math.PI:2*Math.PI;
    curl(['index-finger-phalanx-proximal','index-finger-phalanx-intermediate'],-GHOST.curl*0.6*open);
    r.updateMatrixWorld(true);
    if(!pos('thumb-tip',_g1)||!pos('index-finger-tip',_g2)||!pos('middle-finger-tip',_g3))return;
    _gu.copy(_g2).sub(_g1).normalize();
    _g3.sub(_g1);_g3.addScaledVector(_gu,-_g3.dot(_gu)).normalize();
    _g3.applyAxisAngle(_gu,(trick==='reverse'?-1:1)*ang);
    ghost.stick.position.copy(_g1);ghost.stick.quaternion.setFromUnitVectors(UP,_g3);ghost.stick.visible=true;
  }
  /* une image de Rebond pour la main h (pouce en _a, index en _b) */
  function rebond(h,hj,t,pinch){
    const w=hj['wrist'];
    if(!pinch||!w||!w.visible){h.stick.visible=false;h.tipPrev=null;return;}
    w.getWorldPosition(_w2);
    h.mid.copy(_a).add(_b).multiplyScalar(0.5);
    _f2.copy(h.mid).sub(_w2);if(_f2.lengthSq()<1e-6)return;_f2.normalize();
    h.stick.position.copy(h.mid).addScaledVector(_f2,STICK/2-0.08);
    h.stick.quaternion.setFromUnitVectors(UP,_f2);h.stick.visible=true;
    const tip=_e2.copy(h.mid).addScaledVector(_f2,STICK-0.08);
    /* main ouverte ou fermée : distance moyenne du poignet au bout du majeur, de l'annulaire et de l'auriculaire */
    let sum=0,n=0;
    for(const k of ['middle-finger-tip','ring-finger-tip','pinky-finger-tip']){const j=hj[k];if(j&&j.visible){j.getWorldPosition(_p);sum+=_p.distanceTo(_w2);n++;}}
    const open=n?sum/n:0,state=open>0.14?'open':open<0.11?'closed':'mid';
    const top=pad.position.y+0.015,r=Math.hypot(tip.x-pad.position.x,tip.z-pad.position.z);
    if(h.armed===undefined)h.armed=true;
    if(h.tipPrev){
      if(!h.armed&&tip.y>top+0.03)h.armed=true;
      if(h.armed&&h.tipPrev.y>top&&tip.y<=top&&r<0.2){
        h.armed=false;stats.tries++;padT=t;
        if(state===reb.expect){
          stats.ok++;reb.expect=reb.expect==='open'?'closed':'open';
          play('tchak',0.9);say('Bien !',t);padMat.color.set(0x7BE3A6);
        }else{
          play('tss',0.5);padMat.color.set(0xF2BB4A);
          say(reb.expect==='open'?'Ouvre la main : laisse rebondir':'Ferme les doigts sur la baguette',t);
        }
        if(store&&store.set)store.set(stats);
      }
    }
    (h.tipPrev||(h.tipPrev=new THREE.Vector3())).copy(tip);
  }

  const pr={t0:0,ref:null,done:false,msg:''};
  const prevBtn=new Map();   /* bouton B/Y de chaque manette, pour ne lire qu'un appui */
  let bothSince=0,lastT=0;
  const stats=(store&&store.get&&store.get())||{tries:0,ok:0};

  /* Tutoriel guidé de Thumb Around : cinq étapes courtes, qui avancent toutes seules.
     Aux étapes 3 et 4, la baguette tourne toute seule autour du pouce (assistance) :
     il suffit d'ouvrir l'index, puis de refermer la pince quand elle devient verte. */
  const TUTO=[
    'Étape 1/5 · Pince le pouce et l\'index : tu tiens la baguette',
    'Étape 2/5 · Ne bouge plus le pouce : c\'est le pivot',
    'Étape 3/5 · Ouvre l\'index : la baguette tourne toute seule',
    'Étape 4/5 · Referme la pince quand la baguette devient verte',
    'Étape 5/5 · À toi : lâche, laisse tourner, rattrape'
  ];
  const TURN_S=0.5;                         /* tours par seconde de la baguette assistée */
  const tuto={step:0,t0:0,lastT:0,a:0,th0:new THREE.Vector3(),u:new THREE.Vector3(),v:new THREE.Vector3(),prev:false};
  const green=new THREE.MeshStandardMaterial({color:0x7BE3A6,emissive:0x2E8A57,roughness:0.5});
  function nextStep(t,msg){tuto.step++;tuto.t0=t;play('tchak',0.8);say(msg||'Bien !',t);}
  /* une étape du tuto pour la main h (positions du pouce, de l'index et du majeur dans _a, _b, _c) */
  function tutoStep(h,t,pinch){
    const dt=tuto.lastT?Math.min(0.05,(t-tuto.lastT)/1000):0;tuto.lastT=t;
    const rise=pinch&&!tuto.prev;tuto.prev=pinch;
    h.stick.material=wood;
    if(tuto.step<=2){
      /* la baguette tenue dans la pince, comme en pratique libre */
      if(pinch){
        h.mid.copy(_a).add(_b).multiplyScalar(0.5);
        _d.copy(_c).sub(h.mid);if(_d.lengthSq()>1e-6)h.dir.copy(_d.normalize());
        h.stick.position.copy(h.mid);h.stick.quaternion.setFromUnitVectors(UP,h.dir);h.stick.visible=true;
      }else h.stick.visible=false;
      if(tuto.step===0){if(!pinch)tuto.t0=t;else if(t-tuto.t0>800){nextStep(t);tuto.th0.copy(_a);}}
      else if(tuto.step===1){
        if(!pinch||_a.distanceTo(tuto.th0)>0.012){tuto.th0.copy(_a);tuto.t0=t;}
        else if(t-tuto.t0>1000)nextStep(t);
      }else if(!pinch){
        /* l'index s'ouvre : la baguette part en tournant autour du pouce */
        tuto.u.copy(_b).sub(_a);if(tuto.u.lengthSq()<1e-8)tuto.u.set(1,0,0);tuto.u.normalize();
        tuto.v.copy(h.dir).addScaledVector(tuto.u,-h.dir.dot(tuto.u));
        if(tuto.v.lengthSq()<1e-6)tuto.v.set(0,1,0);tuto.v.normalize();
        tuto.a=0;nextStep(t,'Regarde-la tourner…');
      }
      return;
    }
    /* étapes 3 et 4 : la baguette tourne toute seule, centrée sur le pouce */
    tuto.a+=dt*2*Math.PI*TURN_S;
    const m=tuto.a%(2*Math.PI),win=tuto.a>Math.PI&&(m>=Math.PI*5/3||m<=Math.PI/3);
    _d.copy(tuto.v).applyAxisAngle(tuto.u,(trick==='reverse'?-1:1)*tuto.a);
    h.stick.position.copy(_a);h.stick.quaternion.setFromUnitVectors(UP,_d);h.stick.visible=true;
    if(tuto.step===4)h.stick.material=win?green:wood;
    if(tuto.step===3&&t-tuto.t0>1500)nextStep(t,'À toi !');
    else if(tuto.step===4&&rise){
      if(win){tuto.step=5;tuto.t0=t;h.det.reset();play('tchak',1);say(COACH.ok,t);h.stick.material=wood;}
      else{play('tss',0.4);say('Attends qu\'elle soit verte, puis pince.',t);}
    }
  }
  let coach='';let coachT=0;

  function say(msg,t){coach=msg;coachT=t;}

  /* ---- Physique de la baguette (corps rigide simple) ----
     Tenue : elle suit la pince, on mesure sa vitesse et sa vitesse de rotation.
     Lâchée sur le pouce (Thumb Around) : elle tourne autour du pouce avec son élan, la gravité
     (le point de pince n'est pas au centre : PIV) et un frottement. Rattrapée par une nouvelle pince.
     Sans pivot : elle tombe (gravité, élan) jusqu'au sol, où elle reste ; une pince la reprend. */
  const G=new THREE.Vector3(0,-9.8,0),PIV=0.06,IPIV=STICK*STICK/12+PIV*PIV;
  const FLOOR=cp.y>1?0:cp.y-1.5;            /* sol : 0 en référence « local-floor », sinon sous la tête */
  const MIN_W=2*Math.PI*0.6;                /* élan minimal donné au lâcher (le suivi des doigts mesure mal la pichenette) */
  const _x=new THREE.Vector3(),_y=new THREE.Vector3(),_t1=new THREE.Vector3(),_t2=new THREE.Vector3(),_t3=new THREE.Vector3();
  function placeHeld(h,t){
    const ph=h.ph;
    h.mid.copy(_a).add(_b).multiplyScalar(0.5);
    _x.copy(_c).sub(h.mid);if(_x.lengthSq()>1e-6)h.dir.copy(_x.normalize());
    ph.pos.copy(h.mid).addScaledVector(h.dir,PIV);ph.dir.copy(h.dir);
    const dt=ph.lt?(t-ph.lt)/1000:0;
    if(dt>1e-3&&dt<0.1){
      _x.copy(h.mid).sub(ph.lm).divideScalar(dt);ph.v.lerp(_x,0.5);
      _y.crossVectors(ph.ld,h.dir);const sn=_y.length();
      _x.copy(_y).multiplyScalar(sn>1e-6?Math.asin(Math.min(1,sn))/sn/dt:0);ph.w.lerp(_x,0.5);
    }
    ph.lt=t;ph.lm.copy(h.mid);ph.ld.copy(h.dir);ph.mode='held';
  }
  function showPh(h){h.stick.position.copy(h.ph.pos);h.stick.quaternion.setFromUnitVectors(UP,h.ph.dir);h.stick.visible=true;}
  function startFall(h,t){const ph=h.ph;ph.mode='fall';ph.t0=t;ph.lt=0;}
  function fallPh(h,dt){
    const ph=h.ph;if(ph.mode!=='fall')return;
    ph.v.addScaledVector(G,dt);ph.pos.addScaledVector(ph.v,dt);
    const wl=ph.w.length();if(wl>1e-4)ph.dir.applyAxisAngle(_x.copy(ph.w).divideScalar(wl),wl*dt).normalize();
    ph.w.multiplyScalar(Math.exp(-0.3*dt));
    if(ph.pos.y-Math.abs(ph.dir.y)*STICK/2<=FLOOR){
      ph.dir.y=0;if(ph.dir.lengthSq()<1e-6)ph.dir.set(1,0,0);ph.dir.normalize();
      ph.pos.y=FLOOR+0.01;ph.v.set(0,0,0);ph.w.set(0,0,0);ph.mode='floor';play('tss',0.5);
    }
  }
  /* lâcher sur le pouce : la rotation se fait autour de l'axe pouce → index */
  function startSpinPh(h,t){
    const ph=h.ph,sg=trick==='reverse'?-1:1;
    _t1.copy(_b).sub(_a).normalize();
    let wu=ph.w.dot(_t1);if(sg*wu<MIN_W)wu=sg*MIN_W;
    ph.w.copy(_t1).multiplyScalar(wu);ph.a=0;ph.t0=t;ph.p0.copy(_a);ph.mode='spin';ph.lt=0;
  }
  function spinPh(h,t,dt){
    const ph=h.ph;
    _t1.copy(_b).sub(_a);if(_t1.lengthSq()<1e-8)return;_t1.normalize();
    ph.w.addScaledVector(_x.copy(ph.dir).cross(G),PIV/IPIV*dt);
    const wu=ph.w.dot(_t1)*Math.exp(-0.5*dt);   /* frottement sur le pouce */
    ph.w.copy(_t1).multiplyScalar(wu);
    ph.dir.addScaledVector(_t1,-ph.dir.dot(_t1));if(ph.dir.lengthSq()<1e-6)ph.dir.copy(h.dir);
    ph.dir.normalize().applyAxisAngle(_t1,wu*dt);ph.a+=wu*dt;
    ph.pos.copy(_a).addScaledVector(ph.dir,PIV);
    const lost=_a.distanceTo(ph.p0)>0.05,slow=t-ph.t0>600&&Math.abs(wu)<0.8;
    if(lost||slow||t-ph.t0>4000){
      ph.v.crossVectors(ph.w,_x.copy(ph.dir).multiplyScalar(PIV));startFall(h,t);
      stats.tries++;play('tss',0.4);say(lost?COACH.pivot:COACH.incomplete,t);if(store&&store.set)store.set(stats);
    }
  }
  function catchPh(h,t){
    const ph=h.ph,sg=trick==='reverse'?-1:1;
    h.mid.copy(_a).add(_b).multiplyScalar(0.5);_x.copy(_c).sub(h.mid).normalize();
    const good=ph.dir.angleTo(_x)<Math.PI/3,turn=sg*ph.a;
    let msg;
    if(turn<=-TA.full)msg=COACH.sens;else if(turn<TA.full)msg=COACH.incomplete;else if(!good)msg=COACH.catch;else msg=COACH.ok;
    stats.tries++;if(msg===COACH.ok){stats.ok++;play('tchak',0.9);}else play('tss',0.4);
    say(msg,t);if(store&&store.set)store.set(stats);
    ph.w.set(0,0,0);ph.v.set(0,0,0);placeHeld(h,t);
  }
  /* Thumb Around en pratique : une main, la physique fait le reste */
  function spinFree(h,t,pinch,dt){
    const rise=pinch&&!h.pp;h.pp=pinch;const m=h.ph.mode;
    if(m==='held'||m==='none'){if(pinch)placeHeld(h,t);else if(m==='held')startSpinPh(h,t);}
    else if(m==='spin'){if(rise)catchPh(h,t);else spinPh(h,t,dt);}
    else if(rise){h.ph.w.set(0,0,0);h.ph.v.set(0,0,0);placeHeld(h,t);say('Baguette reprise',t);}
    else fallPh(h,dt);
    if(h.ph.mode!=='none')showPh(h);else h.stick.visible=false;
  }

  /* ---- Tour entre les doigts (finger twirl) ----
     La baguette est coincée entre deux doigts (creux 0 : index-majeur, 1 : majeur-annulaire,
     2 : annulaire-auriculaire). Replier le doigt de devant la fait passer, en un demi-tour,
     au creux suivant ; aller jusqu'à l'auriculaire puis revenir à l'index = un tour réussi. */
  const FING=['index-finger','middle-finger','ring-finger','pinky-finger'];
  const FNAME=['l\'index','le majeur','l\'annulaire','l\'auriculaire'];
  const tw={gap:0,dirn:1,anim:false,from:0,to:0,t0:0,arm:true};
  const TW_MS=380;
  const pivotF=(gap,dirn)=>dirn>0?gap+1:gap;
  function gapC(pos,k,out){pos(FING[k]+'-phalanx-intermediate',_t1);pos(FING[k+1]+'-phalanx-intermediate',_t2);return out.copy(_t1).add(_t2).multiplyScalar(0.5);}
  function palmN(pos,out){pos('wrist',_t3);pos('index-finger-phalanx-proximal',_t1);pos('pinky-finger-phalanx-proximal',_t2);
    _t1.sub(_t3);_t2.sub(_t3);out.crossVectors(_t1,_t2);if(out.lengthSq()<1e-10)out.set(0,1,0);return out.normalize();}
  const _tc=new THREE.Vector3(),_tc2=new THREE.Vector3(),_tn=new THREE.Vector3(),_ta=new THREE.Vector3();
  /* pose de la baguette entre les creux from et to, s de 0 à 1 (demi-tour autour du doigt pivot) */
  function twirlPose(pos,from,to,s,outP,outD){
    palmN(pos,_tn);gapC(pos,from,_tc);
    if(from!==to&&s>0){
      gapC(pos,to,_tc2);_tc.lerp(_tc2,s).addScaledVector(_tn,0.02*Math.sin(Math.PI*s));
      const f=to>from?to:from;pos(FING[f]+'-phalanx-proximal',_t1);pos(FING[f]+'-tip',_t2);
      _ta.copy(_t2).sub(_t1);if(_ta.lengthSq()>1e-8)_tn.applyAxisAngle(_ta.normalize(),Math.PI*s);
    }
    outP.copy(_tc);outD.copy(_tn);
  }
  function curled(pos,f){
    if(!pos('wrist',_t3)||!pos(FING[f]+'-phalanx-proximal',_t1)||!pos(FING[f]+'-tip',_t2))return 0;
    const r=_t2.distanceTo(_t3)/Math.max(1e-4,_t1.distanceTo(_t3));
    return r<1.4?1:r>1.6?-1:0;     /* 1 replié, -1 tendu, 0 entre les deux */
  }
  function twirl(h,hj,t){
    const pos=(n,v)=>{const j=hj[n];if(!j||!j.visible)return false;j.getWorldPosition(v);return true;};
    if(tw.anim){
      const s=Math.min(1,(t-tw.t0)/TW_MS);
      twirlPose(pos,tw.from,tw.to,s,h.ph.pos,h.ph.dir);
      if(s>=1){
        tw.anim=false;tw.gap=tw.to;tw.arm=false;play('tchak',0.7);
        if(tw.gap===2)tw.dirn=-1;
        else if(tw.gap===0){tw.dirn=1;stats.ok++;stats.tries++;play('psch',0.6);say('Un tour complet !',t);if(store&&store.set)store.set(stats);}
      }
    }else{
      twirlPose(pos,tw.gap,tw.gap,0,h.ph.pos,h.ph.dir);
      const c=curled(pos,pivotF(tw.gap,tw.dirn));
      if(!tw.arm){if(c<0)tw.arm=true;}
      else if(c>0){tw.anim=true;tw.from=tw.gap;tw.to=tw.gap+tw.dirn;tw.t0=t;}
    }
    h.ph.mode='twirl';showPh(h);
  }

  /* recommencer depuis le début (A/X, ou deux pinces 2,5 s quand le tuto est fini) */
  let restartSince=0;
  function restart(t){
    pr.done=false;pr.ref=null;pr.t0=0;
    tuto.step=0;tuto.t0=t;tuto.prev=false;tuto.lastT=0;reb.expect='open';
    Object.assign(tw,{gap:0,dirn:1,anim:false,arm:true});
    for(const h of hands){h.ph.mode='none';h.pp=false;h.stick.material=wood;h.stick.visible=false;h.det.reset();}
    play('psch',0.5);say('On recommence depuis le début',t);
  }

  function status(){
    return hands.map((h,i)=>{
      const name=i===0?'Main 1':'Main 2';
      if(!h.seen)return name+' : non suivie';
      return name+(h.held?' : tient la baguette':' : libre');
    }).join('  ·  ');
  }

  function draw(t){
    const lines=[{t:trick==='reverse'?'Reverse Thumb Around':trick==='moulinet'?'Moulinet':trick==='twirl'?'Entre les doigts':trick?'Thumb Around':'Drumstick Spin · prototype',size:5,weight:800}];
    if(trick==='prise'){
      lines[0].t='Ma prise';
      const left=pr.t0&&!pr.done?Math.max(1,Math.ceil((2000-(t-pr.t0))/1000)):0;
      lines.push({t:pr.done?'Prise enregistrée ! Les mains du jeu la reprennent.':'Tiens tes baguettes (ou deux crayons) comme pour jouer, mains nues',size:3.8,color:pr.done?'#7BE3A6':'#E8ECF2',weight:800});
      lines.push({t:pr.done?'A/X : refaire la prise':left?'Ne bouge plus… '+left:'Montre tes deux mains, puis ne bouge plus 2 secondes',size:3.4,color:'#97A1B2',weight:700});
    }else if(trick==='rebond'){
      lines[0].t='Rebond';
      lines.push({t:reb.expect==='open'?'Frappe le pad main OUVERTE':'Frappe le pad doigts FERMÉS',size:4.2,color:reb.expect==='open'?'#7BE3A6':'#8D9CFF',weight:800});
      lines.push({t:coach&&t-coachT<1500?coach:'Rebonds : '+stats.ok+' réussis sur '+stats.tries,size:3.4,color:'#97A1B2',weight:700});
    }else if(trick==='twirl'){
      const f=pivotF(tw.gap,tw.dirn);
      lines.push({t:tw.anim?'…':!tw.arm?'Tends '+FNAME[f]+'…':'Replie '+FNAME[f]+' : la baguette passe au creux suivant',size:3.8,color:'#E8ECF2',weight:800});
      lines.push({t:coach&&t-coachT<1500?coach:'Jusqu\'à l\'auriculaire, puis retour à l\'index · Tours : '+stats.ok,size:3.4,color:'#97A1B2',weight:700});
    }else if(trick==='moulinet'){
      lines.push({t:hands.some(h=>h.held)?'Tourne le poignet : la baguette fait un cercle complet':'Pince la baguette entre le pouce et l\'index',size:3.8,color:'#E8ECF2',weight:800});
      lines.push({t:coach&&t-coachT<1500?coach:'Moulinets : '+stats.ok+' réussis',size:3.4,color:'#97A1B2',weight:700});
    }else if(spinT&&tuto.step<5){
      lines.push({t:TUTO[Math.min(tuto.step,4)===3?2:Math.min(tuto.step,4)===4?3:Math.min(tuto.step,4)],size:3.8,color:'#E8ECF2',weight:800});
      lines.push({t:coach&&t-coachT<1500?coach:'Une étape à la fois : elle avance toute seule',size:3.4,color:coach?'#7BE3A6':'#97A1B2',weight:700});
    }else if(spinT){
      lines.push({t:TUTO[4],size:3.6,color:'#E8ECF2',weight:800});
      lines.push({t:'Essais : '+stats.ok+' réussis sur '+stats.tries,size:3.4,color:'#97A1B2'});
      lines.push({t:coach&&t-coachT<2500?coach:'Pivot : le pouce. Lâche, laisse tourner, rattrape.',size:3.6,color:coach===COACH.ok?'#7BE3A6':'#F2BB4A',weight:700});
    }else{
      lines.push({t:status(),size:3.4,color:'#7BE3A6',weight:700});
      lines.push({t:'Pince le pouce et l\'index pour tenir la baguette',size:3.2,color:'#97A1B2'});
    }
    if(trick)lines.push({t:'A/X'+(spinT&&tuto.step>=5?' ou deux pinces 2,5 s':'')+' : recommencer depuis le début',size:3.2,color:'#97A1B2'});
    lines.push({t:trick==='thumb'?'B/Y : retour à la batterie':'Deux pinces pendant 2 s, ou B/Y : retour à la batterie',size:3.2,color:'#97A1B2'});
    drawPanel(pnl,lines);
  }

  const _s=new THREE.Vector3(),_e=new THREE.Vector3(),_d=new THREE.Vector3(),_q=new THREE.Quaternion(),_sc=new THREE.Vector3(),_mt=new THREE.Matrix4(),_one=new THREE.Vector3(1,1,1);

  /* dessine une main : os entre les articulations, boules aux articulations (pour les arrondir),
     bouts des doigts plus gros, et une paume pleine (un éventail de triangles depuis le poignet) */
  function drawHand(h,hj,nb,nt,nk){
    const pos=new Map();
    for(const name in hj){const j=hj[name];if(j&&j.visible){const v=new THREE.Vector3();j.getWorldPosition(v);pos.set(name,v);}}
    if(pos.has('wrist')){
      for(const c of CHAINS){
        let prev=pos.get('wrist');
        for(const name of c){
          const p=pos.get(name);if(!p)break;
          _d.copy(p).sub(prev);const len=_d.length();
          if(len>1e-5&&nb<MAX_BONES){
            _q.setFromUnitVectors(UP,_d.multiplyScalar(1/len));_sc.set(1,len,1);
            _mt.compose(_p.copy(prev).add(p).multiplyScalar(0.5),_q,_sc);bones.setMatrixAt(nb++,_mt);
          }
          prev=p;
        }
      }
    }
    for(const [name,p] of pos){
      if(TIPS.includes(name)){if(nt<MAX_TIPS)tips.setMatrixAt(nt++,_mt.makeTranslation(p.x,p.y,p.z));}
      else if(nk<MAX_KNUCKLES)knuckles.setMatrixAt(nk++,_mt.makeTranslation(p.x,p.y,p.z));
    }
    const ok=PALM.every(n=>pos.has(n));h.palm.visible=ok;
    if(ok){
      const a=h.palm.geometry.attributes.position;
      PALM.forEach((n,k)=>{const p=pos.get(n);a.setXYZ(k,p.x,p.y,p.z);});
      a.needsUpdate=true;h.palm.geometry.computeVertexNormals();h.palm.geometry.computeBoundingSphere();
    }
    return [nb,nt,nk];
  }

  /* À chaque image : lire les mains, tenir les baguettes, dessiner la main.
     Retourne true quand il faut revenir à la batterie. */
  /* Ma prise : les deux mains suivies et immobiles 2 s = la prise est enregistrée */
  const _jp=new THREE.Vector3(),_jq=new THREE.Quaternion();
  function prise(t){
    if(pr.done)return;
    const pts=[];
    for(const h of hands){const hj=h.g.joints||{};for(const n of ['wrist','thumb-tip','index-finger-tip','pinky-finger-tip']){const j=hj[n];if(!j||!j.visible){pr.ref=null;pr.t0=0;return;}pts.push(j.getWorldPosition(new THREE.Vector3()));}}
    if(!pr.ref||pts.some((p,i)=>p.distanceTo(pr.ref[i])>0.015)){pr.ref=pts;pr.t0=t;return;}
    if(t-pr.t0<2000)return;
    const res={};
    for(const h of hands){
      const side=h.g.userData.side||'';const hj=h.g.joints||{};
      const g=gripFromJoints(n=>{const j=hj[n];if(!j)return null;j.updateMatrixWorld(true);j.matrixWorld.decompose(_jp,_jq,_v);return {p:_jp.clone(),q:_jq.clone()};});
      if(!g||!side){pr.t0=t;return;}
      res[side]=g;
    }
    if(!res.left||!res.right){pr.t0=t;return;}
    res.t=Date.now();
    try{localStorage.setItem(PRISE_KEY,JSON.stringify(res));}catch(e){}
    pr.done=true;play('tchak',0.9);say('Prise enregistrée !',t);
  }
  function update(t){
    let exit=false;

    /* manettes présentes : B/Y ramène à la batterie */
    for(const src of session.inputSources){
      const gp=src.gamepad;if(!gp)continue;
      const down=!!(gp.buttons[5]&&gp.buttons[5].pressed),a=!!(gp.buttons[4]&&gp.buttons[4].pressed);
      const p=prevBtn.get(src)||{};
      if(down&&!p.b)exit=true;
      if(a&&!p.a&&trick)restart(t);
      prevBtn.set(src,{b:down,a});
    }
    const dt=lastT?Math.min(0.05,(t-lastT)/1000):0;lastT=t;

    let nb=0,nt=0,nk=0,tutoHand=null;
    for(const h of hands){
      const hj=h.g.joints||{};
      const th=hj['thumb-tip'],ix=hj['index-finger-tip'],md=hj['middle-finger-tip'];
      /* perte de suivi : on ne change rien, la baguette reste où elle était (pas de pénalité) */
      h.seen=!!(th&&ix&&md&&th.visible&&ix.visible&&md.visible);
      if(h.seen){
        th.getWorldPosition(_a);ix.getWorldPosition(_b);md.getWorldPosition(_c);
        const pinch=!!(h.g.inputState&&h.g.inputState.pinching);
        if(trick==='prise'){h.stick.visible=false;}
        else if(trick==='rebond')rebond(h,hj,t,pinch);
        else if(spinT&&tuto.step<5){
          /* tuto guidé : une seule main (la première suivie), l'autre attend */
          if(!tutoHand){tutoHand=h;tutoStep(h,t,pinch);}else h.stick.visible=false;
        }else if(spinT){
          /* pratique : chaque main a sa baguette physique, les deux mains peuvent faire le trick */
          spinFree(h,t,pinch,dt);
        }else if(trick==='twirl'){
          if(!tutoHand){tutoHand=h;twirl(h,hj,t);}else h.stick.visible=false;
        }else{
          if(pinch&&!h.held){h.held=true;h.ph.v.set(0,0,0);h.ph.w.set(0,0,0);play('tss',0.35);}
          else if(!pinch&&h.held){h.held=false;startFall(h,t);}   /* lâchée : elle tombe avec son élan */
          if(h.held){
            /* la baguette tenue dans la pince, dirigée vers le bout du majeur */
            placeHeld(h,t);
            if(trick==='moulinet')moulinet(h,t);
          }else{fallPh(h,dt);if(trick==='moulinet')ml.has=false;}
          if(h.ph.mode!=='none')showPh(h);
        }
      }else{
        if(h.ph.mode==='spin'||h.ph.mode==='held')startFall(h,t);
        if(h.ph.mode==='fall'||h.ph.mode==='floor'){fallPh(h,dt);showPh(h);}else h.stick.visible=false;
        h.held=false;h.pp=false;
        if(spinT)h.det.reset();if(trick==='moulinet')ml.has=false;
      }
      if(meshOn(h)){
        h.palm.visible=false;
        /* couleur de peau, une fois le modèle chargé */
        if(!h.model.userData.skin){h.model.userData.skin=true;h.model.traverse(o=>{if(o.isMesh&&o.material&&o.material.color)o.material.color.set(0xE2B99C);});}
      }
      else [nb,nt,nk]=drawHand(h,hj,nb,nt,nk);
    }
    bones.count=nb;bones.instanceMatrix.needsUpdate=true;
    tips.count=nt;tips.instanceMatrix.needsUpdate=true;
    knuckles.count=nk;knuckles.instanceMatrix.needsUpdate=true;

    /* les deux pinces tenues longtemps : retour (mode libre) */
    if(trick!=='thumb'){
      if(hands.every(h=>h.held)){
        if(!bothSince)bothSince=t;
        else if(t-bothSince>HOLD_EXIT_MS)exit=true;
      }else bothSince=0;
    }

    if(spinT&&tuto.step>=5){
      if(hands.every(h=>h.seen&&h.pp)){if(!restartSince)restartSince=t;else if(t-restartSince>2500){restartSince=0;restart(t);}}
      else restartSince=0;
    }
    if(pad&&padT&&t-padT>300){padMat.color.set(0x39414F);padT=0;}
    if(trick==='prise')prise(t);
    ghostUpdate(t);
    draw(t);
    return exit;
  }

  function dispose(){
    disposed=true;
    if(ghost.root){scene.remove(ghost.root);ghost.root.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
    if(ghost.stick){scene.remove(ghost.stick);ghost.mat.dispose();ghost.smat.dispose();}
    for(const h of hands){scene.remove(h.g);scene.remove(h.stick);}
    stickGeo.dispose();wood.dispose();green.dispose();boneGeo.dispose();skin.dispose();
    scene.remove(bones);bones.dispose();
    if(pad){scene.remove(pad);pad.geometry.dispose();padMat.dispose();}
    scene.remove(tips);tips.dispose();
    scene.remove(knuckles);knuckles.dispose();
    for(const h of hands){scene.remove(h.palm);h.palm.geometry.dispose();}palmMat.dispose();
    scene.remove(pnl.mesh);pnl.mesh.geometry.dispose();pnl.mesh.material.map.dispose();pnl.mesh.material.dispose();
  }

  return {update,dispose,stats:()=>({...stats}),
    /* pour les tests : les mains suivies et celles qui tiennent une baguette */
    debug:()=>({seen:hands.map(h=>h.seen),held:hands.map(h=>h.held),bones:bones.count,tips:tips.count,trick,ghost:!!ghost.root,ghostStick:!!(ghost.stick&&ghost.stick.visible),mesh:hands.map(meshOn),tuto:tuto.step,rebond:reb.expect,phase:hands.map(h=>h.det.phase),phys:hands.map(h=>h.ph.mode),twirl:tw.gap,prise:pr.done,coach,stats:{...stats}})};
}
