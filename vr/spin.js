/* Drumstick Spin, prototype (étape 1) : suivi des mains WebXR, pince pouce + index, et une baguette
   virtuelle tenue par la pince. Pas de détection de trick ici (étape suivante).
   Ce module ne touche ni à la batterie ni au menu : vr.js l'allume, lui donne la scène et la session,
   et appelle update() à chaque image. Le pincement vient du suivi de core three.js (hand.inputState). */
import * as THREE from './three.module.min.js';

const STICK=0.40;            /* longueur de la baguette virtuelle (m), comme dans vr.js */
const HOLD_EXIT_MS=2000;     /* les deux pinces tenues ce temps = retour à la batterie */
const JOINT_R=0.007;         /* rayon d'une articulation dessinée (m) */
const MAX_JOINTS=50;         /* 25 articulations par main */
const UP=new THREE.Vector3(0,1,0);

const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_m=new THREE.Matrix4(),_p=new THREE.Vector3();

/* renderer, scene, session : la session WebXR en cours. panel, drawPanel : les panneaux de vr.js.
   play(id, force) : le son de vr.js. */
export function create({renderer,scene,session,panel,drawPanel,play}){
  const hands=[0,1].map(i=>{
    const g=renderer.xr.getHand(i);scene.add(g);
    return {g,held:false,mid:new THREE.Vector3(),dir:new THREE.Vector3(0,1,0),seen:false};
  });

  /* une baguette par main, cachée tant que la pince ne la tient pas */
  const wood=new THREE.MeshStandardMaterial({color:0xE9D6B0,roughness:0.5});
  const stickGeo=new THREE.CylinderGeometry(0.006,0.009,STICK,10);
  for(const h of hands){h.stick=new THREE.Mesh(stickGeo,wood);h.stick.visible=false;scene.add(h.stick);}

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

  function status(){
    return hands.map((h,i)=>{
      const name=i===0?'Main 1':'Main 2';
      if(!h.seen)return name+' : non suivie';
      return name+(h.held?' : tient la baguette':' : libre');
    }).join('  ·  ');
  }

  function draw(){
    drawPanel(pnl,[
      {t:'Drumstick Spin · prototype',size:5,weight:800},
      {t:status(),size:3.4,color:'#7BE3A6',weight:700},
      {t:'Pince le pouce et l\'index pour tenir la baguette',size:3.2,color:'#97A1B2'},
      {t:'Deux pinces pendant 2 s, ou B/Y : retour à la batterie',size:3.2,color:'#97A1B2'}
    ]);
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
    for(const h of hands){
      const hj=h.g.joints||{};
      const th=hj['thumb-tip'],ix=hj['index-finger-tip'],md=hj['middle-finger-tip'];
      /* perte de suivi : on ne change rien, la baguette reste où elle était (pas de pénalité) */
      h.seen=!!(th&&ix&&md&&th.visible&&ix.visible&&md.visible);
      if(h.seen){
        th.getWorldPosition(_a);ix.getWorldPosition(_b);md.getWorldPosition(_c);
        const pinch=!!(h.g.inputState&&h.g.inputState.pinching);
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
      /* articulations de cette main */
      for(const k in hj){
        const j=hj[k];
        if(!j||!j.visible||n>=MAX_JOINTS*2)continue;
        j.getWorldPosition(_p);
        _m.makeTranslation(_p.x,_p.y,_p.z);
        joints.setMatrixAt(n++,_m);
      }
    }
    joints.count=n;joints.instanceMatrix.needsUpdate=true;

    /* les deux pinces tenues longtemps : retour */
    if(hands.every(h=>h.held)){
      if(!bothSince)bothSince=t;
      else if(t-bothSince>HOLD_EXIT_MS)exit=true;
    }else bothSince=0;

    draw();
    return exit;
  }

  function dispose(){
    for(const h of hands){scene.remove(h.g);scene.remove(h.stick);}
    stickGeo.dispose();wood.dispose();
    scene.remove(joints);joints.geometry.dispose();jointMat.dispose();
    scene.remove(pnl.mesh);pnl.mesh.geometry.dispose();pnl.mesh.material.map.dispose();pnl.mesh.material.dispose();
  }

  return {update,dispose,
    /* pour les tests : les mains suivies et celles qui tiennent une baguette */
    debug:()=>({seen:hands.map(h=>h.seen),held:hands.map(h=>h.held),joints:joints.count})};
}
