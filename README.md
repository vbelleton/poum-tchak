# Poum Tchak

Pupitre de batterie : une mesure à jouer, lisible en onomatopées (poum, tchak,
pak…) et en solfège rythmique (Kodály, Takadimi, Konnakol), avec les sons
synthétisés, un clic, et une écoute au micro.

Page en ligne : https://vbelleton.github.io/poum-tchak/

## Ce qu'on y trouve

- **La batterie en haut** : sept fûts qui s'allument à chaque frappe, avec le
  mot qui va avec. Plusieurs fûts frappés ensemble ont leur propre mot fondu
  (grosse caisse + caisse claire = « pak »).
- **La grille** : 4/4, 3/4, 6/8, droit ou ternaire, modèles rock, funk, disco,
  bossa, shuffle, valse, 6/8. Jusqu'à huit mesures enchaînées. Trois forces de
  frappe : faible (ghost note), normale, forte (accent).
- **Parle-le avant de le jouer** : écouter la mesure, la dire à voix haute sur
  le clic, puis la jouer, le micro comparant le résultat à la grille.
- **Travailler** : tempo progressif (monter tout seul de N BPM toutes les
  N mesures) et mesures muettes (couper le son une mesure sur N pour tester son
  horloge interne).
- **Mes grooves** : enregistrer un enchaînement sur l'appareil, ou le partager
  par un lien qui contient la mesure, les accents et le tempo.
- **Écouter** : le micro ou un fichier audio, pour trouver le tempo et une
  première lecture du rythme. La calibration apprend le son de chaque fût.
- **Dictionnaire** : les mots sont modifiables, enrichissables, exportables.

## Limites connues

- Le micro a besoin d'une page en **https** (ou en local) pour fonctionner.
- Sans calibration, l'écoute range les sons en trois familles seulement :
  graves (poum), médiums (tchak), aigus (tss).
- Avec calibration, chaque frappe est nommée par un seul fût : deux fûts joués
  en même temps donnent le plus fort. Deux fûts de son proche (grosse caisse et
  tom basse) peuvent être confondus.
- Le premier temps trouvé par l'appli peut tomber sur un autre temps de la
  mesure : la grille est alors juste mais décalée.
- La lecture du rythme au micro ne marche qu'en 4/4.

## Fichiers

Tout tient dans `index.html` : pas de dépendance, pas de compilation. Les
autres fichiers servent à l'installation sur mobile et au mode hors ligne
(`sw.js`, `manifest.webmanifest`, `icon-*.png`).
