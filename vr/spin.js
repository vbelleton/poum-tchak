/* Drumstick Spin. Étape 1 : suivi des mains WebXR, pince pouce + index, baguette virtuelle tenue entre les doigts.
   Étape 2 (MVP) : un seul trick, Thumb Around. La baguette tourne autour du pouce (pivot), le détecteur
   vérifie le pivot, la rotation complète et le rattrapage par la pince (pas seulement un tour de 360°).
   Ce module ne touche ni à la batterie ni au menu : vr.js l'allume, lui donne la scène et la session,
   et appelle update() à chaque image. Le pincement vient du suivi de core three.js (hand.inputState). */
import * as THREE from './three.module.min.js';

const STICK=0.40;            /* longueur de la baguette virtuelle (m), comme dans vr.js */
const HOLD_EXIT_MS=2000;     /* les deux pinces tenues ce temps = retour à la batterie */
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

const _P0=new THREE.Vector3(),_Q0=new THREE.Vector3(),_a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_m=new THREE.Matrix4(),_p=new THREE.Vector3();
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
const MAX_BONES=2*30,MAX_TIPS=2*5;
const BONE_R=0.0075,TIP_R=0.011;

/* renderer, scene, session : la session WebXR en cours. panel, drawPanel : les panneaux de vr.js.
   play(id, force) : le son de vr.js. trick : null (libre) ou 'thumb' (Thumb Around). */
export function create({renderer,scene,session,panel,drawPanel,play,trick=null,store=null}){
  const hands=[0,1].map(i=>{
    const g=renderer.xr.getHand(i);scene.add(g);
    return {g,held:false,mid:new THREE.Vector3(),dir:new THREE.Vector3(0,1,0),seen:false,det:new ThumbAroundDetector()};
  });

  /* une baguette par main, cachée tant que la pince ne la tient pas */
  const wood=new THREE.MeshStandardMaterial({color:0xE9D6B0,roughness:0.5});
  const stickGeo=new THREE.CylinderGeometry(0.006,0.009,STICK,10);
  for(const h of hands){h.stick=new THREE.Mesh(stickGeo,wood);h.stick.visible=false;scene.add(h.stick);}

  /* la main : os (cylindres) et bouts des doigts (boules), chacun en une seule passe de dessin */
  const skin=new THREE.MeshStandardMaterial({color:0xD9A98A,roughness:0.55,transparent:false,opacity:1});
  const boneGeo=new THREE.CylinderGeometry(BONE_R,BONE_R,1,10);
  const bones=new THREE.InstancedMesh(boneGeo,skin,MAX_BONES);bones.count=0;bones.frustumCulled=false;scene.add(bones);
  /* les articulations arrondies (rond aux phalanges) et la paume (un plat orienté) */
  const knucks=new THREE.InstancedMesh(new THREE.SphereGeometry(BONE_R*1.12,10,8),skin,2*25);knucks.count=0;knucks.frustumCulled=false;scene.add(knucks);
  const palms=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),skin,2);palms.count=0;palms.frustumCulled=false;scene.add(palms);
  let nk=0,np=0;
  const _bx=new THREE.Vector3(),_by=new THREE.Vector3(),_bz=new THREE.Vector3(),_bm=new THREE.Matrix4(),_bq=new THREE.Quaternion(),_bs=new THREE.Vector3();
  const tips=new THREE.InstancedMesh(new THREE.SphereGeometry(TIP_R,12,8),skin,MAX_TIPS);tips.count=0;tips.frustumCulled=false;scene.add(tips);

  /* le panneau d'aide, devant soi au lancement, puis fixe */
  const cam=renderer.xr.getCamera(),cp=new THREE.Vector3(),cq=new THREE.Quaternion(),fwd=new THREE.Vector3();
  cam.getWorldPosition(cp);cam.getWorldQuaternion(cq);fwd.set(0,0,-1).applyQuaternion(cq);fwd.y=0;
  if(fwd.lengthSq()<1e-4)fwd.set(0,0,-1);fwd.normalize();
  const pnl=panel(0.9,0.36);
  pnl.mesh.position.set(cp.x+fwd.x*1.1,cp.y-0.1,cp.z+fwd.z*1.1);
  pnl.mesh.lookAt(cp.x,cp.y-0.1,cp.z);
  scene.add(pnl.mesh);

  /* une baguette témoin, à droite du panneau, qui montre le mouvement à faire en boucle */
  const demoMat=new THREE.MeshStandardMaterial({color:0x7BB6FF,roughness:0.4,transparent:true,opacity:0.85});
  const demo=new THREE.Mesh(stickGeo,demoMat);demo.visible=trick!==null;scene.add(demo);
  const right=new THREE.Vector3().crossVectors(fwd,UP).normalize();
  const demoBase=new THREE.Vector3(pnl.mesh.position.x+right.x*0.7,pnl.mesh.position.y-0.05,pnl.mesh.position.z+right.z*0.7);
  const _da=new THREE.Vector3();
  function demoStep(t){
    if(!trick){demo.visible=false;return;}
    const s=t/1000;
    if(trick==='rebond'){
      /* la baguette tombe, rebondit de moins en moins haut, puis recommence */
      const c=(s%1.6)/1.6,h=Math.abs(Math.sin(c*Math.PI*3))*0.16*(1-c);
      demo.position.set(demoBase.x,demoBase.y-0.1+h,demoBase.z);
      demo.quaternion.setFromAxisAngle(_da.set(fwd.x,0,fwd.z),Math.PI/2);
    }else{
      /* thumb : pivote autour d'un bout ; moulinet : tourne autour de son milieu */
      const a=(s%1.8)/1.8*Math.PI*2;
      const axis=_da.copy(fwd).normalize();
      demo.quaternion.setFromAxisAngle(axis,a);
      const off=trick==='thumb'?STICK/2:0;
      demo.position.set(demoBase.x,demoBase.y,demoBase.z);
      if(off){const d=new THREE.Vector3(0,1,0).applyQuaternion(demo.quaternion);demo.position.addScaledVector(d,off);}
    }
    demo.visible=true;
  }

  const prevBtn=new Map();   /* bouton B/Y de chaque manette, pour ne lire qu'un appui */
  let bothSince=0;
  const stats=(store&&store.get&&store.get())||{tries:0,ok:0};
  let coach='';let coachT=0;

  function say(msg,t){coach=msg;coachT=t;}

  /* Rebond : un pad d'entraînement devant soi, à hauteur des genoux assis.
     Étape 2 : 8 frappes main ouverte (la baguette rebondit seule).
     Étape 3 : alterner une frappe main ouverte, une frappe en fermant les doigts, 8 fois. */
  const GOAL=8;
  const rb={step:2,n:0,want:'open',armed:true,openMax:0};
  let pad=null;
  if(trick==='rebond'){
    pad=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.02,24),new THREE.MeshStandardMaterial({color:0x3A4250,roughness:0.9}));
    pad.position.set(cp.x+fwd.x*0.45,cp.y-0.55,cp.z+fwd.z*0.45);
    scene.add(pad);
  }
  /* Moulinet : la baguette tenue fait un tour complet en tournant le poignet, en moins de 2,5 s */
  const ml={n:0,travel:0,t0:0,prev:new THREE.Vector3(),has:false};
  const _tip=new THREE.Vector3(),_w=new THREE.Vector3();
  function rebondStep(h,hj,t){
    const wr=hj['wrist'],md=hj['middle-finger-tip'],rg=hj['ring-finger-tip'];
    if(!wr||!md||!rg||!wr.visible)return;
    wr.getWorldPosition(_w);md.getWorldPosition(_P0);rg.getWorldPosition(_Q0);
    const curl=(_P0.distanceTo(_w)+_Q0.distanceTo(_w))/2;
    rb.openMax=Math.max(rb.openMax*0.999,curl);
    _tip.copy(h.mid).addScaledVector(h.dir,STICK/2);
    const top=pad.position.y+0.01;
    if(_tip.y>top+0.03)rb.armed=true;
    const dx=_tip.x-pad.position.x,dz=_tip.z-pad.position.z;
    if(!rb.armed||_tip.y>top||dx*dx+dz*dz>0.2*0.2)return;
    rb.armed=false;play('tchak',0.8);
    const kind=curl<rb.openMax*0.82?'closed':'open';
    if(rb.step===2){
      if(kind==='open'){rb.n++;say('Rebond '+rb.n+' sur '+GOAL,t);}
      else say('Garde les doigts ouverts : laisse la baguette rebondir toute seule.',t);
      if(rb.n>=GOAL){rb.step=3;rb.n=0;rb.want='open';say('Bravo ! Maintenant, alterne.',t);play('psch',0.6);}
    }else if(rb.step===3){
      if(kind===rb.want){rb.n++;rb.want=kind==='open'?'closed':'open';say('Bien ! '+rb.n+' sur '+GOAL,t);}
      else say(rb.want==='open'?'Celle-ci main ouverte : laisse rebondir.':'Celle-ci en fermant les doigts.',t);
      if(rb.n>=GOAL*2){rb.step=4;say('Bravo, tu sais faire rebondir la baguette !',t);play('psch',0.8);}
    }
  }
  function moulinetStep(h,t){
    if(!ml.has||t-ml.t0>2500){ml.has=true;ml.t0=t;ml.travel=0;ml.prev.copy(h.dir);return;}
    ml.travel+=ml.prev.angleTo(h.dir);ml.prev.copy(h.dir);
    if(ml.travel>=Math.PI*2){ml.n++;ml.has=false;play('tchak',0.9);say('Moulinet réussi ! ('+ml.n+')',t);}
  }

  function status(){
    return hands.map((h,i)=>{
      const name=i===0?'Main 1':'Main 2';
      if(!h.seen)return name+' : non suivie';
      return name+(h.held?' : tient la baguette':' : libre');
    }).join('  ·  ');
  }

  function draw(t){
    const lines=[{t:trick==='thumb'?'Thumb Around · MVP':trick==='rebond'?'Rebond':trick==='moulinet'?'Moulinet':'Drumstick Spin · prototype',size:5,weight:800}];
    const held0=hands.some(h=>h.held);
    if(trick==='rebond'||trick==='moulinet'){
      const g=trick==='rebond'
        ?(!held0?'Étape 1 sur 3 : pince la baguette entre le pouce et l\'index, main ouverte.'
          :rb.step===2?'Étape 2 sur 3 : frappe le pad gris et laisse rebondir, doigts ouverts ('+rb.n+'/'+GOAL+').'
          :rb.step===3?'Étape 3 sur 3 : alterne. '+(rb.want==='open'?'Celle-ci main ouverte.':'Celle-ci en fermant les doigts.')+' ('+rb.n+'/'+GOAL*2+')'
          :'Terminé ! Continue pour t\'entraîner.')
        :(!held0?'Étape 1 sur 2 : pince la baguette entre le pouce et l\'index.'
          :'Étape 2 sur 2 : tourne le poignet, la baguette dessine un cercle complet. Réussis : '+ml.n);
      lines.push({t:coach&&t-coachT<2000?coach:g,size:3.6,color:'#F2BB4A',weight:700});
    }else if(trick==='thumb'){
      lines.push({t:'Essais : '+stats.ok+' réussis sur '+stats.tries,size:3.4,color:'#97A1B2'});
      /* le tuto pas à pas : une seule consigne à la fois, celle de l'étape en cours */
      const held=hands.some(h=>h.held);
      const ph=hands.map(h=>h.det.phase),step=ph.includes('roll')?3:held||ph.includes('caught')?2:1;
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

  const _s=new THREE.Vector3(),_e=new THREE.Vector3(),_d=new THREE.Vector3(),_q=new THREE.Quaternion(),_sc=new THREE.Vector3(),_mt=new THREE.Matrix4(),_one=new THREE.Vector3(1,1,1);

  /* dessine les os d'une main : un segment par paire d'articulations qui se suivent */
  const taper=n=>{const i=n%30;return i%6===0?1.25:i%6===1?1.15:i%6===2?1.05:0.95;};
  function drawHand(hj,nb,nt){
    const seg=(a,b)=>{
      if(nb>=MAX_BONES)return nb;
      _s.copy(a);_e.copy(b);_d.copy(_e).sub(_s);const len=_d.length();
      if(len<1e-5)return nb;
      _q.setFromUnitVectors(UP,_d.multiplyScalar(1/len));
      const k=taper(nb);
      _sc.set(k,len,k);_mt.compose(_p.copy(_s).add(_e).multiplyScalar(0.5),_q,_sc);
      bones.setMatrixAt(nb,_mt);return nb+1;
    };
    const w=hj['wrist'];
    const pos=new Map();
    for(const c of CHAINS)for(const name of c){const j=hj[name];if(j&&j.visible){const v=new THREE.Vector3();j.getWorldPosition(v);pos.set(name,v);}}
    if(w&&w.visible){const v=new THREE.Vector3();w.getWorldPosition(v);pos.set('wrist',v);}
    if(pos.has('wrist')){
      for(const c of CHAINS){
        let prev=pos.get('wrist');
        for(const name of c){const p=pos.get(name);if(p){nb=seg(prev,p);prev=p;}else break;}
      }
    }
    /* une bille à chaque articulation, sauf le bout (déjà arrondi) */
    for(const [name,p] of pos){if(name==='wrist'||TIPS.includes(name)||nk>=50)continue;knucks.setMatrixAt(nk++,_mt.makeTranslation(p.x,p.y,p.z));}
    /* la paume : du poignet vers le majeur, largeur index → auriculaire */
    const pw=pos.get('wrist'),pmid=pos.get('middle-finger-metacarpal'),pix=pos.get('index-finger-metacarpal'),ppk=pos.get('pinky-finger-metacarpal');
    if(pw&&pmid&&pix&&ppk&&np<2){
      _by.copy(pmid).sub(pw);const L=_by.length();_by.normalize();
      _bx.copy(pix).sub(ppk);const Wd=_bx.length();_bx.normalize();
      _bz.crossVectors(_bx,_by).normalize();_bx.crossVectors(_by,_bz).normalize();
      _bm.makeBasis(_bx,_by,_bz);_bq.setFromRotationMatrix(_bm);
      _bs.set(Wd*1.25,L*1.05,0.022);
      palms.setMatrixAt(np++,_mt.compose(_p.copy(pw).add(pmid).multiplyScalar(0.5),_bq,_bs));
    }
    for(const name of TIPS){const p=pos.get(name);if(p&&nt<MAX_TIPS){tips.setMatrixAt(nt++,_mt.makeTranslation(p.x,p.y,p.z));}}
    return [nb,nt];
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

    let nb=0,nt=0;nk=0;np=0;
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
            if(!trickHand&&(trick==='rebond'||trick==='moulinet')){
              trickHand=h;
              if(trick==='rebond')rebondStep(h,hj,t);else moulinetStep(h,t);
            }
          }
        }
      }else{
        h.stick.visible=false;
        if(trick==='thumb')h.det.reset();
      }
      [nb,nt]=drawHand(hj,nb,nt);
    }
    bones.count=nb;bones.instanceMatrix.needsUpdate=true;
    tips.count=nt;tips.instanceMatrix.needsUpdate=true;
    knucks.count=nk;knucks.instanceMatrix.needsUpdate=true;palms.count=np;palms.instanceMatrix.needsUpdate=true;

    /* les deux pinces tenues longtemps : retour (mode libre) */
    if(trick!=='thumb'){
      if(hands.every(h=>h.held)){
        if(!bothSince)bothSince=t;
        else if(t-bothSince>HOLD_EXIT_MS)exit=true;
      }else bothSince=0;
    }
    if(trick==='moulinet'&&!hands.some(h=>h.held))ml.has=false;

    demoStep(t);
    draw(t);
    return exit;
  }

  function dispose(){
    for(const h of hands){scene.remove(h.g);scene.remove(h.stick);}
    scene.remove(demo);demoMat.dispose();
    stickGeo.dispose();wood.dispose();boneGeo.dispose();skin.dispose();
    scene.remove(bones);bones.dispose();
    scene.remove(tips);tips.dispose();scene.remove(knucks);knucks.dispose();scene.remove(palms);palms.dispose();
    if(pad){scene.remove(pad);pad.geometry.dispose();pad.material.dispose();}
    scene.remove(pnl.mesh);pnl.mesh.geometry.dispose();pnl.mesh.material.map.dispose();pnl.mesh.material.dispose();
  }

  return {update,dispose,stats:()=>({...stats}),
    /* pour les tests : les mains suivies et celles qui tiennent une baguette */
    debug:()=>({seen:hands.map(h=>h.seen),held:hands.map(h=>h.held),bones:bones.count,tips:tips.count,trick,phase:hands.map(h=>h.det.phase),coach,stats:{...stats}})};
}
