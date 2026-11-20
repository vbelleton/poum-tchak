import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const V = () => new T.Vector3();
export async function bake(SIDE, P) {
  const o = await new FBXLoader().loadAsync('./Male_Adult_01.fbx');
  o.updateMatrixWorld(true);
  let mesh = null; o.traverse(x => { if (x.isSkinnedMesh) mesh = x; });
  const B = {}; o.traverse(x => { if (x.isBone) B[x.name] = x; });
  const S = SIDE === 'left' ? 'L' : 'R';
  const nm = s => 'Bip01_' + S + '_' + s;
  for (const k in B) { B[k].userData.q0 = B[k].quaternion.clone(); B[k].userData.restPos = B[k].getWorldPosition(new T.Vector3()); }
  const W = n => B[n].getWorldPosition(V());
  const upd = () => o.updateMatrixWorld(true);
  const tip = f => { const a = W(nm('Finger' + f + '1')), b = W(nm('Finger' + f + '2')); return b.clone().add(b.clone().sub(a).multiplyScalar(0.85)); };
  const H = W(nm('Hand'));
  const fd = W(nm('Finger2')).sub(H).normalize();
  const wv = W(nm('Finger1')).sub(W(nm('Finger4')));
  let n = V().crossVectors(fd, wv).normalize();
  /* côté paume : le bout de l'index va par là quand on le plie dans le bon sens */
  const axes = [V().set(1,0,0), V().set(-1,0,0), V().set(0,1,0), V().set(0,-1,0), V().set(0,0,1), V().set(0,0,-1)];
  const turn = (b, ax, a) => { b.quaternion.copy(b.userData.q0); b.quaternion.multiply(new T.Quaternion().setFromAxisAngle(ax, a)); };
  const thumbSide = tip(0).sub(H); if (thumbSide.dot(n) < 0) n.negate();
  /* l'axe local qui plie les doigts vers la paume */
  let curlAx = null, best = -1e9; const ib = B[nm('Finger1')], t0 = tip(1);
  for (const ax of axes) { turn(ib, ax, 0.6); upd(); const dv = tip(1).sub(t0); const s = dv.dot(n) - Math.abs(dv.dot(wv.clone().normalize())); if (s > best) { best = s; curlAx = ax; } turn(ib, ax, 0); upd(); }
  /* la baguette : du milieu de la 1re phalange de l'index jusqu'au talon de la main côté auriculaire, sous la paume */
  /* l'index se replie d'abord (comme sur une baguette) : la baguette passe sous sa phalange du milieu,
     contre le pouce, puis traverse la paume jusqu'au talon de la main côté auriculaire */
  const PK = W(nm('Finger4'));
  const heel0 = H.clone().lerp(PK, P.heelT).addScaledVector(wv.clone().normalize(), -P.heelW * wv.length());
  turn(B[nm('Finger1')], curlAx, P.pre[0]); turn(B[nm('Finger11')], curlAx, P.pre[1]); upd();
  const palmC = H.clone().lerp(W(nm('Finger3')), 0.5).addScaledVector(n, P.off);
  const FA = W(nm('Finger11')).lerp(palmC, P.fulc);
  turn(B[nm('Finger1')], curlAx, 0); turn(B[nm('Finger11')], curlAx, 0); upd();
  const heel = heel0.clone().addScaledVector(n, P.off);
  const d = FA.clone().sub(heel).normalize();
  n.addScaledVector(d, -n.dot(d)).normalize();
  const P0 = heel.clone().lerp(FA, 0.5);
  const dist = p => { const q = p.clone().sub(P0); return q.addScaledVector(d, -q.dot(d)).length(); };
  const want = P.r + P.fing;
  const e3w = V().crossVectors(d, n);
  const angOf = p => { const q = p.clone().sub(P0); return Math.atan2(q.dot(e3w), q.dot(n)); };
  const cost = (pts, th) => { let c = 0; pts.forEach((p, i) => { const e = dist(p) - (P.r + th[i]); c += e < 0 ? 25 * e * e : e * e; }); return c; };
  const chainPts = f => { const j1 = W(nm('Finger' + f + '1')), j2 = W(nm('Finger' + f + '2')), tp = tip(f), j0 = W(nm('Finger' + f)); return [j0.clone().lerp(j1, 0.5), j1, j1.clone().lerp(j2, 0.5), j2, j2.clone().lerp(tp, 0.5), tp]; };
  const TH = [1.05, 1.0, 0.95, 0.9, 0.88, 0.85].map(x => x * P.thick);
  const WT = [0.3, 0.6, 1, 1, 1, 1.2];
  const log = [];
  const LIM = { 1: [P.idxMin ?? 0, 1.5], 2: [0.1, 1.6], 3: [0.2, 1.7], 4: [0.3, 1.8] };
  for (const f of [1, 2, 3, 4]) {
    const bs = [B[nm('Finger' + f)], B[nm('Finger' + f + '1')], B[nm('Finger' + f + '2')]];
    let bst = null;
    for (let a = LIM[f][0]; a <= LIM[f][1]; a += 0.04) for (let b = 0; b <= 1.9; b += 0.04) {
      turn(bs[0], curlAx, a); turn(bs[1], curlAx, b); turn(bs[2], curlAx, 0.75 * b); bs[0].updateMatrixWorld(true);
      const pts = chainPts(f); let c = 0; pts.forEach((p, i) => { const e = dist(p) - (P.r + TH[i]); c += WT[i] * (e < 0 ? 25 * e * e : e * e); });
      /* le doigt doit faire le tour de la baguette, pas la longer */
      { let cum = 0, prev = angOf(W(nm('Finger' + f))); for (const p of pts) { const a2 = angOf(p); let da = a2 - prev; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; cum += da; prev = a2; }
        const wr = Math.abs(cum), need = P.wrap[f - 1]; if (wr < need) c += P.wrapK * (need - wr) * (need - wr); }
      if (!bst || c < bst.c) bst = { c, a, b };
    }
    turn(bs[0], curlAx, bst.a); turn(bs[1], curlAx, bst.b); turn(bs[2], curlAx, 0.75 * bst.b); upd();
    log.push(['F' + f, +bst.a.toFixed(2), +bst.b.toFixed(2), +Math.sqrt(bst.c / 6).toFixed(2)]);
  }
  /* pouce : posé sur la baguette */
  {
    const bs = [B[nm('Finger0')], B[nm('Finger01')], B[nm('Finger02')]];
    let bst = null;
    for (const ax of axes) for (const ax2 of axes) for (let a = -0.6; a <= 1.0; a += 0.08) for (let b = 0; b <= 1.0; b += 0.08) {
      turn(bs[0], ax, a); turn(bs[1], ax2, b); turn(bs[2], ax2, 0.8 * b); bs[0].updateMatrixWorld(true);
      const j2 = W(nm('Finger02')), tp = tip(0), j1 = W(nm('Finger01'));
      const pts = [j1.clone().lerp(j2, 0.5), j2, j2.clone().lerp(tp, 0.5), tp], th = [1.15, 1.1, 1.05, 1.0].map(x => x * P.thick);
      let c = 0; pts.forEach((p, i) => { const e = dist(p) - (P.r + th[i]); c += (i < 1 ? 0.4 : 1) * (e < 0 ? 25 * e * e : e * e); });
      if (!bst || c < bst.c) bst = { c, a, b, ax, ax2 };
    }
    turn(bs[0], bst.ax, bst.a); turn(bs[1], bst.ax2, bst.b); turn(bs[2], bst.ax2, 0.8 * bst.b); upd();
    log.push(['T', +bst.a.toFixed(2), +bst.b.toFixed(2), +Math.sqrt(bst.c / 4).toFixed(2)]);
  }
  /* cuisson : chaque sommet suit ses os, dans le repère du monde */
  mesh.skeleton.update();
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const keepRe = new RegExp('Bip01_' + S + '_(Forearm|Hand|Finger)|Bip01_' + S + 'ForeTwist|' + S + '_ForeTwist');
  const bones = mesh.skeleton.bones, keepB = bones.map(b => keepRe.test(b.name));
  const bodyGroups = g.groups.filter(gr => mesh.material[gr.materialIndex].name === 'm002_body');
  const inBody = i => bodyGroups.some(gr => i >= gr.start && i < gr.start + gr.count);
  const dbg={groups:g.groups.map(gr=>[gr.start,gr.count,mesh.material[gr.materialIndex]&&mesh.material[gr.materialIndex].name]),keep:bones.filter((b,i)=>keepB[i]).map(b=>b.name)};
  const Hr = B[nm('Hand')].userData.restPos, ue = B[nm('Forearm')].userData.restPos.clone().sub(Hr).normalize();
  const tris = [];
  const vcount = pos.count;
  const dom = i => { let m = -1, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > m) { m = w; bi = si.getComponent(i, k); } } return bi; };
  for (let t = 0; t < vcount / 3; t++) {
    const i0 = 3 * t; if (!inBody(i0)) continue;
    if (![0, 1, 2].every(k => keepB[dom(i0 + k)])) continue;
    /* on coupe l'avant-bras à P.arm cm du poignet : au-delà, près du coude, la peau s'étire */
    if ([0, 1, 2].some(k => V().fromBufferAttribute(pos, i0 + k).applyMatrix4(mesh.matrixWorld).sub(Hr).dot(ue) > P.arm)) continue;
    tris.push(t);
  }
  const skinM = i => { const m = new T.Matrix4().set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0), tmp = new T.Matrix4(); for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (!w) continue; const b = si.getComponent(i, k); tmp.multiplyMatrices(bones[b].matrixWorld, mesh.skeleton.boneInverses[b]); const e = tmp.elements, me = m.elements; for (let q = 0; q < 16; q++) me[q] += w * e[q]; } return m; };
  /* repère final : la baguette sur -z, paume vers le bas (un peu vers l'intérieur), en mètres */
  const e3 = V().crossVectors(d, n);
  const sgn = SIDE === 'left' ? 1 : -1;
  const f1 = V().set(0, 0, -1), f2 = V().set(sgn * Math.sin(P.roll), -Math.cos(P.roll), 0), f3 = V().crossVectors(f1, f2);
  const E = new T.Matrix4().makeBasis(d, n, e3), F = new T.Matrix4().makeBasis(f1, f2, f3);
  const M = new T.Matrix4().makeTranslation(0, 0, P.z).multiply(F).multiply(E.clone().transpose()).multiply(new T.Matrix4().makeScale(0.01, 0.01, 0.01)).multiply(new T.Matrix4().makeTranslation(-P0.x, -P0.y, -P0.z));
  const Mn = new T.Matrix3().getNormalMatrix(M);
  const bindI = mesh.bindMatrixInverse, bind = mesh.bindMatrix, mw = mesh.matrixWorld;
  const outP = [], outN = [], outU = [], outC = [];
  let uMin = 1, uMax = 0, vMin = 1, vMax = 0;
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const i = 3 * t + k; const sm = skinM(i);
    const p = V().fromBufferAttribute(pos, i).applyMatrix4(bind).applyMatrix4(sm).applyMatrix4(bindI).applyMatrix4(mw).applyMatrix4(M);
    const nn = V().fromBufferAttribute(nor, i).transformDirection(bind).transformDirection(sm).transformDirection(bindI).transformDirection(mw).applyMatrix3(Mn).normalize();
    outP.push(p.x, p.y, p.z); outN.push(nn.x, nn.y, nn.z);
    /* l'avant-bras s'efface vers le coude, pour ne pas voir le bout coupé */
    { const tt = V().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(Hr).dot(ue); const al = Math.max(0, Math.min(1, 1 - (tt - P.fade0) / (P.arm - P.fade0))); outC.push(1, 1, 1, al * al * (3 - 2 * al)); }
    const u = uv.getX(i), v = uv.getY(i); outU.push(u, v); uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  /* texture : seulement la partie de l'image qui sert aux mains, réduite */
  const tex = await new TGALoader().loadAsync('./m002_body_color.tga');
  const img = tex.image, w0 = img.width, h0 = img.height;
  const pad = 0.01; uMin = Math.max(0, uMin - pad); vMin = Math.max(0, vMin - pad); uMax = Math.min(1, uMax + pad); vMax = Math.min(1, vMax + pad);
  const src = document.createElement('canvas'); src.width = w0; src.height = h0;
  const sctx = src.getContext('2d'), id = sctx.createImageData(w0, h0);
  const data = img.data, ch = data.length / (w0 * h0);
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) { const s = (y * w0 + x) * ch, t = ((h0 - 1 - y) * w0 + x) * 4; id.data[t] = data[s]; id.data[t + 1] = data[s + 1]; id.data[t + 2] = data[s + 2]; id.data[t + 3] = 255; }
  sctx.putImageData(id, 0, 0);
  const cx = uMin * w0, cy = (1 - vMax) * h0, cw = (uMax - uMin) * w0, chh = (vMax - vMin) * h0;
  const sc = Math.min(1, P.texMax / Math.max(cw, chh));
  const dst = document.createElement('canvas'); dst.width = Math.round(cw * sc); dst.height = Math.round(chh * sc);
  dst.getContext('2d').drawImage(src, cx, cy, cw, chh, 0, 0, dst.width, dst.height);
  for (let k = 0; k < outU.length; k += 2) { outU[k] = (outU[k] - uMin) / (uMax - uMin); outU[k + 1] = (outU[k + 1] - vMin) / (vMax - vMin); }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(outP, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(outN, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(outU, 2));
  geo.setAttribute('color', new T.Float32BufferAttribute(outC, 4));
  const ct = new T.CanvasTexture(dst); ct.colorSpace = T.SRGBColorSpace; ct.flipY = false; ct.userData.mimeType = 'image/jpeg';
  /* l'image recadrée a l'origine en haut : on retourne v pour coller à flipY=false du glTF */
  for (let k = 1; k < outU.length; k += 2) geo.attributes.uv.array[k] = 1 - geo.attributes.uv.array[k];
  const mat = new T.MeshStandardMaterial({ map: ct, roughness: 0.75, side: T.DoubleSide, vertexColors: true, transparent: true });
  const hand = new T.Mesh(geo, mat); hand.name = 'main-' + SIDE;
  return { dbg, hand, log, tris: tris.length, tex: [dst.width, dst.height], curl: curlAx.toArray() };
}
export async function exportGLB(obj) {
  return await new GLTFExporter().parseAsync(obj, { binary: true });
}
