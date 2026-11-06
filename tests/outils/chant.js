// Un chant de test, fabriqué sur place : aucun vrai morceau dans le dépôt.
/** Un petit fichier de chant : 120 BPM, poum et tchak en alternance, son de silence. */
function fichierChant(titre = 'Mon <b>chant</b>') {
  const notes = [];
  for (let i = 0; i < 16; i++) notes.push([2 + i * 0.5, 2 + i * 0.5, i % 2]);
  const entete = Buffer.from(JSON.stringify({ id: 'essai', title: titre, bpm: 120, dur: 12, drums: ['poum', 'tchak'], notes, downbeats: [2, 4, 6, 8, 10] }));
  const taux = 8000, n = taux * 12;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(taux, 24); wav.writeUInt32LE(taux * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  const tete = Buffer.alloc(9); tete.write('PTCH', 0); tete[4] = 1; tete.writeUInt32LE(entete.length, 5);
  return { name: 'essai.poumtchak', mimeType: 'application/octet-stream', buffer: Buffer.concat([tete, entete, wav]) };
}

module.exports = { fichierChant };
