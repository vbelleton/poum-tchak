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
    return {g,held:false,mid:new THREE.Vector3(),dir:new THREE.Vector3(0,1,0),seen:false,det:new ThumbAroundDetector(trick==='reverse'?-1:1)};
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
  if(trick){
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

  const prevBtn=new Map();   /* bouton B/Y de chaque manette, pour ne lire qu'un appui */
  let bothSince=0;
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

  function status(){
    return hands.map((h,i)=>{
      const name=i===0?'Main 1':'Main 2';
      if(!h.seen)return name+' : non suivie';
      return name+(h.held?' : tient la baguette':' : libre');
    }).join('  ·  ');
  }

  function draw(t){
    const lines=[{t:trick==='reverse'?'Reverse Thumb Around':trick?'Thumb Around':'Drumstick Spin · prototype',size:5,weight:800}];
    if(trick==='rebond'){
      lines[0].t='Rebond';
      lines.push({t:reb.expect==='open'?'Frappe le pad main OUVERTE':'Frappe le pad doigts FERMÉS',size:4.2,color:reb.expect==='open'?'#7BE3A6':'#8D9CFF',weight:800});
      lines.push({t:coach&&t-coachT<1500?coach:'Rebonds : '+stats.ok+' réussis sur '+stats.tries,size:3.4,color:'#97A1B2',weight:700});
    }else if(!!trick&&tuto.step<5){
      lines.push({t:TUTO[Math.min(tuto.step,4)===3?2:Math.min(tuto.step,4)===4?3:Math.min(tuto.step,4)],size:3.8,color:'#E8ECF2',weight:800});
      lines.push({t:coach&&t-coachT<1500?coach:'Une étape à la fois : elle avance toute seule',size:3.4,color:coach?'#7BE3A6':'#97A1B2',weight:700});
    }else if(!!trick){
      lines.push({t:TUTO[4],size:3.6,color:'#E8ECF2',weight:800});
      lines.push({t:'Essais : '+stats.ok+' réussis sur '+stats.tries,size:3.4,color:'#97A1B2'});
      lines.push({t:coach&&t-coachT<2500?coach:'Pivot : le pouce. Lâche, laisse tourner, rattrape.',size:3.6,color:coach===COACH.ok?'#7BE3A6':'#F2BB4A',weight:700});
    }else{
      lines.push({t:status(),size:3.4,color:'#7BE3A6',weight:700});
      lines.push({t:'Pince le pouce et l\'index pour tenir la baguette',size:3.2,color:'#97A1B2'});
    }
    lines.push({t:'Deux pinces pendant 2 s, ou B/Y : retour à la batterie',size:3.2,color:'#97A1B2'});
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
  function update(t){
    let exit=false;

    /* manettes présentes : B/Y ramène à la batterie */
    for(const src of session.inputSources){
      const gp=src.gamepad;if(!gp)continue;
      const down=!!(gp.buttons[5]&&gp.buttons[5].pressed);
      if(down&&!prevBtn.get(src))exit=true;
      prevBtn.set(src,down);
    }

    let nb=0,nt=0,nk=0,tutoHand=null;
    for(const h of hands){
      const hj=h.g.joints||{};
      const th=hj['thumb-tip'],ix=hj['index-finger-tip'],md=hj['middle-finger-tip'];
      /* perte de suivi : on ne change rien, la baguette reste où elle était (pas de pénalité) */
      h.seen=!!(th&&ix&&md&&th.visible&&ix.visible&&md.visible);
      if(h.seen){
        th.getWorldPosition(_a);ix.getWorldPosition(_b);md.getWorldPosition(_c);
        const pinch=!!(h.g.inputState&&h.g.inputState.pinching);
        if(trick==='rebond')rebond(h,hj,t,pinch);
        else if(!!trick&&tuto.step<5){
          /* tuto guidé : une seule main (la première suivie), l'autre attend */
          if(!tutoHand){tutoHand=h;tutoStep(h,t,pinch);}else h.stick.visible=false;
        }else if(!!trick){
          /* chaque main a son détecteur : les deux mains peuvent faire le trick */
          const r=h.det.step({t,pinch,thumb:_a.clone(),index:_b.clone(),middle:_c.clone()});
          _d.copy(_c).sub(_a);
          if(_d.lengthSq()>1e-6){
            h.stick.position.copy(_a).addScaledVector(_d,0.5);
            h.stick.quaternion.setFromUnitVectors(UP,_d.clone().normalize());
            h.stick.visible=true;
          }
          if(r){
            if(r.ok){stats.ok++;stats.tries++;play('tchak',0.9);}
            else{stats.tries++;play('tss',0.4);}
            say(r.msg,t);
            if(store&&store.set)store.set(stats);
          }
        }else{
          if(pinch&&!h.held){h.held=true;play('tss',0.35);}
          else if(!pinch&&h.held){h.held=false;h.stick.visible=false;}
          if(h.held){
            /* la baguette : au milieu de la pince, dirigée vers le bout du majeur */
            h.mid.copy(_a).add(_b).multiplyScalar(0.5);
            _c.sub(h.mid);
            if(_c.lengthSq()>1e-6)h.dir.copy(_c.normalize());
            h.stick.position.copy(h.mid);
            h.stick.quaternion.setFromUnitVectors(UP,h.dir);
            h.stick.visible=true;
          }
        }
      }else{
        h.stick.visible=false;
        if(!!trick)h.det.reset();
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

    if(pad&&padT&&t-padT>300){padMat.color.set(0x39414F);padT=0;}
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
    debug:()=>({seen:hands.map(h=>h.seen),held:hands.map(h=>h.held),bones:bones.count,tips:tips.count,trick,ghost:!!ghost.root,ghostStick:!!(ghost.stick&&ghost.stick.visible),mesh:hands.map(meshOn),tuto:tuto.step,rebond:reb.expect,phase:hands.map(h=>h.det.phase),coach,stats:{...stats}})};
}
