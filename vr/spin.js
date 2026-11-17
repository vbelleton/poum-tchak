/* Drumstick Spin. Étape 1 : suivi des mains WebXR, pince pouce + index, baguette virtuelle tenue entre les doigts.
   Étape 2 (MVP) : un seul trick, Thumb Around. La baguette tourne autour du pouce (pivot), le détecteur
   vérifie le pivot, la rotation complète et le rattrapage par la pince (pas seulement un tour de 360°).
   Ce module ne touche ni à la batterie ni au menu : vr.js l'allume, lui donne la scène et la session,
   et appelle update() à chaque image. Le pincement vient du suivi de core three.js (hand.inputState). */
import * as THREE from './three.module.min.js';

const STICK=0.40;            /* longueur de la baguette virtuelle (m), comme dans vr.js */
const HOLD_EXIT_MS=2000;     /* les deux pinces tenues ce temps = retour à la batterie */
const JOINT_R=0.007;         /* rayon d'une articulation dessinée (m) */
const MAX_JOINTS=50;         /* 25 articulations par main */
const UP=new THREE.Vector3(0,1,0);

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
  ok:'Bravo, tu as réussi !'
};

const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_m=new THREE.Matrix4(),_p=new THREE.Vector3();
const _u=new THREE.Vector3(),_v=new THREE.Vector3(),_vp=new THREE.Vector3(),_e1=new THREE.Vector3(),_e2=new THREE.Vector3();

/* Détecteur de Thumb Around, pur (pas de rendu) : on lui donne, à chaque image, la pince, le pouce,
   l'index et le majeur. Il répond par null, ou par un résultat : { ok, msg }.
   Déroulé : la pince tient la baguette, la rotation autour du pouce démarre ; la pince s'ouvre
   (la baguette tourne librement) ; la pince se referme (rattrapage) : on compte le tour fait. */
export class ThumbAroundDetector{
  constructor(){this.reset();}
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
        res=turned>=TA.full?{ok:true,msg:COACH.ok}:{ok:false,msg:COACH.incomplete};
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

/* renderer, scene, session : la session WebXR en cours. panel, drawPanel : les panneaux de vr.js.
   play(id, force) : le son de vr.js. trick : null (libre) ou 'thumb' (Thumb Around). */
export function create({renderer,scene,session,panel,drawPanel,play,trick=null,store=null}){
  const hands=[0,1].map(i=>{
    const g=renderer.xr.getHand(i);scene.add(g);
    return {g,held:false,mid:new THREE.Vector3(),dir:new THREE.Vector3(0,1,0),seen:false};
  });

  /* une baguette par main, cachée tant que la pince ne la tient pas */
  const wood=new THREE.MeshStandardMaterial({color:0xE9D6B0,roughness:0.5});
  const stickGeo=new THREE.CylinderGeometry(0.006,0.009,STICK,10);
  for(const h of hands){h.stick=new THREE.Mesh(stickGeo,wood);h.stick.visible=false;scene.add(h.stick);}

  /* mains pleines : chaque doigt est un tube entre ses articulations, la paume une bille */
  const SKIN=new THREE.MeshStandardMaterial({color:0xE0B894,roughness:0.7});
  const boneGeo=new THREE.CylinderGeometry(1,1,1,8,1),palmGeo=new THREE.SphereGeometry(1,12,8);
  for(const h of hands){
    h.bones=[];
    for(let i=0;i<20;i++){const m=new THREE.Mesh(boneGeo,SKIN);m.visible=false;scene.add(m);h.bones.push(m);}
    h.palm=new THREE.Mesh(palmGeo,SKIN);h.palm.visible=false;scene.add(h.palm);
  }
  const FINGER_CHAIN=['-metacarpal','-phalanx-proximal','-phalanx-intermediate','-phalanx-distal','-tip'];
  const FINGER_NAMES=['thumb','index-finger','middle-finger','ring-finger','pinky-finger'];
  const _P=new THREE.Vector3(),_Q=new THREE.Vector3();
  function updateHand(h){
    const hj=h.g.joints||{};
    h.bones.forEach(m=>{m.visible=false;});h.palm.visible=false;
    let bi=0;
    const seg=(a,b,r)=>{
      if(!a||!b||!a.visible||!b.visible||bi>=h.bones.length)return;
      a.getWorldPosition(_P);b.getWorldPosition(_Q);
      const len=_P.distanceTo(_Q);if(len<1e-4)return;
      const m=h.bones[bi++];
      m.position.copy(_P).add(_Q).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP,_Q.clone().sub(_P).normalize());
      m.scale.set(r,len,r);m.visible=true;
    };
    const wrist=hj['wrist'];
    for(const f of FINGER_NAMES){
      let prev=wrist;
      for(const suf of FINGER_CHAIN){
        const j=hj[f+suf];
        if(!j)continue;
        seg(prev,j,0.0085);prev=j;
      }
    }
    const mid=hj['middle-finger-metacarpal'];
    if(wrist&&mid&&wrist.visible&&mid.visible){
      wrist.getWorldPosition(_P);mid.getWorldPosition(_Q);
      h.palm.position.copy(_P).add(_Q).multiplyScalar(0.5);
      h.palm.scale.setScalar(0.024);h.palm.visible=true;
    }
  }
  /* les articulations des mains, en une seule passe de dessin (InstancedMesh) */
  const jointMat=new THREE.MeshStandardMaterial({color:0xD7C7A6,roughness:0.6});
  const joints=new THREE.InstancedMesh(new THREE.SphereGeometry(JOINT_R,8,6),jointMat,MAX_JOINTS*2);
  joints.count=0;joints.frustumCulled=false;scene.add(joints);

  /* le panneau d'aide, devant soi au lancement, puis fixe */
  const cam=renderer.xr.getCamera(),cp=new THREE.Vector3(),cq=new THREE.Quaternion(),fwd=new THREE.Vector3();
  cam.getWorldPosition(cp);cam.getWorldQuaternion(cq);fwd.set(0,0,-1).applyQuaternion(cq);fwd.y=0;
  if(fwd.lengthSq()<1e-4)fwd.set(0,0,-1);fwd.normalize();
  const pnl=panel(0.9,0.36);
  pnl.mesh.position.set(cp.x+fwd.x*1.1,cp.y-0.1,cp.z+fwd.z*1.1);
  pnl.mesh.lookAt(cp.x,cp.y-0.1,cp.z);
  scene.add(pnl.mesh);

  const prevBtn=new Map();   /* bouton B/Y de chaque manette, pour ne lire qu'un appui */
  let bothSince=0;

  /* Thumb Around : le détecteur, les essais, le message du coach */
  const det=new ThumbAroundDetector();
  const stats=(store&&store.get&&store.get())||{tries:0,ok:0};
  let coach='';let coachT=0;
  const tipPos=new THREE.Vector3();
  const trickDir=new THREE.Vector3();

  function say(msg,t){coach=msg;coachT=t;}

  function status(){
    return hands.map((h,i)=>{
      const name=i===0?'Main 1':'Main 2';
      if(!h.seen)return name+' : non suivie';
      return name+(h.held?' : tient la baguette':' : libre');
    }).join('  ·  ');
  }

  function draw(t){
    const lines=[{t:trick==='thumb'?'Thumb Around · MVP':'Drumstick Spin · prototype',size:5,weight:800}];
    if(trick==='thumb'){
      lines.push({t:'Essais : '+stats.ok+' réussis sur '+stats.tries,size:3.4,color:'#97A1B2'});
      /* le tuto pas à pas : une seule consigne à la fois, celle de l'étape en cours */
      const held=hands.some(h=>h.held);
      const step=det.phase==='roll'?3:held||det.phase==='caught'?2:1;
      const guide=[
        'Étape 1 sur 3 : pince la baguette entre le pouce et l\'index.',
        'Étape 2 sur 3 : garde le pouce immobile, lâche la pince, fais tourner la baguette autour.',
        'Étape 3 sur 3 : rattrape-la en reprenant la pince.'
      ];
      lines.push({t:coach&&t-coachT<2500?coach:guide[step-1],size:3.6,color:coach===COACH.ok?'#7BE3A6':'#F2BB4A',weight:700});
      lines.push({t:'Étape '+step+' sur 3 · Essais réussis : '+stats.ok,size:3,color:'#97A1B2'});
    }else{
      lines.push({t:status(),size:3.4,color:'#7BE3A6',weight:700});
      lines.push({t:'Pince le pouce et l\'index pour tenir la baguette',size:3.2,color:'#97A1B2'});
    }
    lines.push({t:'Deux pinces pendant 2 s, ou B/Y : retour à la batterie',size:3.2,color:'#97A1B2'});
    drawPanel(pnl,lines);
  }

  /* À chaque image : lire les mains, tenir les baguettes, dessiner les articulations.
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

    let n=0;
    /* la main qui fait le trick : la première suivie */
    let trickHand=null;
    for(const h of hands){
      const hj=h.g.joints||{};
      const th=hj['thumb-tip'],ix=hj['index-finger-tip'],md=hj['middle-finger-tip'];
      /* perte de suivi : on ne change rien, la baguette reste où elle était (pas de pénalité) */
      h.seen=!!(th&&ix&&md&&th.visible&&ix.visible&&md.visible);
      if(h.seen){
        th.getWorldPosition(_a);ix.getWorldPosition(_b);md.getWorldPosition(_c);
        const pinch=!!(h.g.inputState&&h.g.inputState.pinching);
        if(trick==='thumb'){
          if(!trickHand){
            trickHand=h;
            /* on dessine la baguette du tour : du pouce vers le majeur */
            const tip=tipPos.copy(_a);
            trickDir.copy(_c).sub(_a);
            if(trickDir.lengthSq()>1e-6){
              h.stick.position.copy(tip).addScaledVector(trickDir,0.5);
              h.stick.quaternion.setFromUnitVectors(UP,trickDir.clone().normalize());
              h.stick.visible=true;
            }
            const r=det.step({t,pinch,thumb:_a.clone(),index:_b.clone(),middle:_c.clone()});
            if(r){
              if(r.ok){stats.ok++;stats.tries++;play('tchak',0.9);}
              else{stats.tries++;play('tss',0.4);}
              say(r.msg,t);
              if(store&&store.set)store.set(stats);
            }
          }
          /* les autres mains restent libres */
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
      }
      /* la main pleine, tube par tube */
      updateHand(h);
    }
    joints.count=n;joints.instanceMatrix.needsUpdate=true;

    /* les deux pinces tenues longtemps : retour (mode libre) */
    if(trick!=='thumb'){
      if(hands.every(h=>h.held)){
        if(!bothSince)bothSince=t;
        else if(t-bothSince>HOLD_EXIT_MS)exit=true;
      }else bothSince=0;
    }else if(!trickHand)det.reset();

    draw(t);
    return exit;
  }

  function dispose(){
    for(const h of hands){scene.remove(h.g);scene.remove(h.stick);}
    stickGeo.dispose();wood.dispose();
    scene.remove(joints);joints.geometry.dispose();jointMat.dispose();
    scene.remove(pnl.mesh);pnl.mesh.geometry.dispose();pnl.mesh.material.map.dispose();pnl.mesh.material.dispose();
  }

  return {update,dispose,stats:()=>({...stats}),
    /* pour les tests : les mains suivies et celles qui tiennent une baguette */
    debug:()=>({seen:hands.map(h=>h.seen),held:hands.map(h=>h.held),joints:joints.count,trick,phase:det.phase,coach,stats:{...stats}})};
}
