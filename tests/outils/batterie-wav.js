// Fabrique un fichier WAV de batterie de synthèse pour simuler le micro :
// 3 grosses caisses, 3 caisses claires, 3 charlestons isolés (pour la calibration),
// puis un groove rock à 100 BPM (grosse caisse 1 et 3, caisse claire 2 et 4, charleston en croches).
const fs = require('fs');
const os = require('os');
const path = require('path');

const SR = 44100;

function biquad(x, kind, f0, Q) {
  const w = 2 * Math.PI * f0 / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b = kind === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const a0 = 1 + al, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  b = b.map((v) => v / a0);
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
let graine = 12345;
const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 1073741824 - 1; };
const bruit = (n) => Float64Array.from({ length: n }, hasard);
const normer = (x) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return x.map((v) => v / (m || 1)); };

function grosseCaisse() {
  const n = Math.floor(SR * 0.45), x = new Float64Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += 2 * Math.PI * (50 + 105 * Math.exp(-t / 0.03)) / SR;
    x[i] = 0.95 * Math.sin(ph) * Math.exp(-t / 0.1);
  }
  return x;
}
function caisseClaire() {
  const n = Math.floor(SR * 0.25);
  let nz = normer(biquad(biquad(bruit(n), 'hp', 280, 0.7), 'lp', 4200, 0.7));
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const corps = (0.6 * Math.sin(2 * Math.PI * 185 * t) + 0.4 * Math.sin(2 * Math.PI * 245 * t)) * Math.exp(-t / 0.07);
    x[i] = 0.85 * (0.55 * corps + 0.6 * nz[i] * Math.exp(-t / 0.1));
  }
  return x;
}
function charleston() {
  const n = Math.floor(SR * 0.08);
  const nz = normer(biquad(biquad(bruit(n), 'hp', 7500, 0.7), 'hp', 7500, 0.7));
  return nz.map((v, i) => 0.6 * v * Math.exp(-(i / SR) / 0.016));
}

function fabriquer(fichier) {
  const total = Math.floor(SR * 46), buf = new Float64Array(total);
  const poser = (s, x) => { const i = Math.floor(s * SR); for (let k = 0; k < x.length && i + k < total; k++) buf[i + k] += x[k]; };
  const [K, S, H] = [grosseCaisse(), caisseClaire(), charleston()];
  [2, 3, 4].forEach((t) => poser(t, K));
  [5.5, 6.5, 7.5].forEach((t) => poser(t, S));
  [9, 10, 11].forEach((t) => poser(t, H));
  const b = 0.6;
  for (let mes = 0; mes < 11; mes++) {
    const t0 = 13 + mes * 4 * b;
    for (let tps = 0; tps < 4; tps++) {
      const t = t0 + tps * b;
      poser(t, tps % 2 === 0 ? K : S);
      poser(t, H); poser(t + b / 2, H);
    }
  }
  const data = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(fichier, Buffer.concat([h, data]));
  return fichier;
}

const FICHIER = path.join(os.tmpdir(), 'poum-tchak-batterie.wav');
if (!fs.existsSync(FICHIER)) fabriquer(FICHIER);
module.exports = { FICHIER };
