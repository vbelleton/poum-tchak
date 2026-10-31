# Poum Tchak

Pupitre de batterie : une mesure à jouer, lisible en onomatopées (poum, tchak,
pak…) et en solfège rythmique (Kodály, Takadimi, Konnakol), avec les sons
synthétisés, un clic, et une écoute au micro.

Page en ligne : https://vbelleton.github.io/poum-tchak/

## Ce qu'on y trouve

En haut, la batterie s'allume à chaque frappe avec son mot ; plusieurs fûts
frappés ensemble ont leur mot fondu (grosse caisse + caisse claire = « pak »).
En bas, la lecture : clic, tempo (saisie directe, − et + qui défilent si on
reste appuyé, Tap) et Jouer. Entre les deux, six rubriques :

- **Parcours** : une étape à la fois, en 25 étapes et 5 chapitres (le temps,
  croches, triolets, doubles croches, mélanges). Chaque étape lance le bon
  exercice tout réglé : une main seule, puis les deux, ou 3 consignes à
  traduire. À 85 % pour chaque main sur 4 mesures, l'étape est réussie et la
  suivante s'ouvre ; sinon on recommence, plus lentement si besoin. La
  progression et le meilleur tempo sont gardés.

- **Rythme** : mesure (4/4, 3/4, 6/8), droit ou ternaire, sons de synthèse ou de
  vraie batterie, modèles (rock, funk, disco, bossa, shuffle, valse, 6/8). La
  grille enchaîne jusqu'à huit mesures, avec trois forces de frappe : faible
  (ghost note), normale, forte (accent). Dessous, la mesure en onomatopées et en
  solfège rythmique (Kodály, Takadimi, Konnakol). Mes grooves : enregistrer
  l'enchaînement ou le partager par un lien.
- **Pratique** : les mêmes réglages de rythme qu'en Rythme, puis jouer sur
  l'écran : la batterie en plein écran, multitouch. Les pads à frapper
  s'entourent au bon moment ; chaque frappe reçoit un verdict (parfait, bien,
  tôt, tard, raté, en trop), avec la précision en pourcentage, la série, une
  jauge avance/retard et un bilan à l'arrêt. Seuls les fûts que tu joues sont
  notés. Une partition défilante en haut montre les fûts du rythme, et l'on
  choisit la batterie dessinée, la cascade (des barres colorées qui tombent vers
  la ligne de frappe, façon Rock Band) ou seulement les fûts utiles.
  Le **défi** : l'appli joue le rythme, compte une mesure, puis c'est à toi de
  le taper. À 80 % de précision le tempo monte ; sinon il ralentit, autant de
  fois qu'il faut. **Batterie électronique (MIDI)** : branchée en USB, chaque coup
  arrive avec le fût et l'heure exacts, allume son pad et est noté ; le tempo joué
  s'affiche. Chrome ou Edge (ordinateur, Android) ; sur iPhone, Safari ne gère pas
  le MIDI : passer par une appli navigateur MIDI (Web MIDI Browser).
  **Ma vraie batterie** : le micro entend chaque coup joué sur
  une vraie batterie, reconnaît le fût (grave, médium, aigu, ou les fûts appris
  par la calibration), allume le pad et le note comme une frappe sur l'écran,
  en libre comme en défi ; le tempo entendu s'affiche et peut être repris.
  Parle-le avant de le jouer, en quatre étapes : écouter, dire, jouer
  sur l'écran, jouer sur sa batterie au micro. Tempo progressif et mesures
  muettes.
- **Mains** : indépendance des mains. Un tableau à deux colonnes (main gauche,
  main droite) : 1, 2, 3 ou 4 coups par temps, ou 1 → ¼ qui change à chaque
  temps, avec la fraction du temps, le nom de la note, le solfège (Kodály ou
  Takadimi) et le compte (« 1 et », « 1 é et a »). Après une mesure de décompte,
  on tape les deux pads (ou F et J, ou une batterie MIDI : caisse claire = droite) :
  chaque main a son score, son avance ou retard moyen et sa régularité.
  Au-dessus de chaque pad, un couloir montre les coups qui arrivent : ils
  descendent, grossissent et s'allument au moment de frapper. Son au choix :
  modèle + clic, clic seul, ou sans son (on n'entend que ses baguettes).
  « Enchaîner les 16 duos » passe de 1 contre 1 à 4 contre 4.
- **Écoute** : le micro ou un fichier audio, pour trouver le tempo et une
  première lecture du rythme. La calibration apprend le son de chaque fût.
- **Mots** : s'entraîner à traduire une consigne en onomatopées (trois niveaux ;
  on répond sur une grille ou sur la batterie dessinée, coup par coup ; la
  réponse est vérifiée, chaque mot mal lu est expliqué, on peut
  l'écouter puis la jouer sur l'écran) ; traduire des onomatopées ou du solfège vers la grille, modifier le
  dictionnaire, les mots fondus, partager le dictionnaire, et le référentiel du
  solfège rythmique.

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
- Sur l'écran d'un téléphone, il reste 30 à 50 ms entre le doigt et le son :
  c'est bon pour lire et mémoriser un rythme, pas pour travailler un toucher.

## Crédits

Les sons de batterie viennent de
[Web Audio Samples](https://github.com/GoogleChromeLabs/web-audio-samples) de
l'équipe Chrome Web Audio, sous licence Apache 2.0 : grosse caisse, caisse
claire, toms, charleston et crash. Le charleston ouvert est fabriqué à partir du
charleston fermé.

## Tests

Les tests Playwright vérifient l'interface sur téléphone et sur ordinateur :
rubriques et clavier, grille et mesures, lecture et tempo, vue Jouer sur
l'écran (multitouch, notation), les quatre étapes de Parle-le, dictionnaire,
grooves et liens partagés, accessibilité (axe, thèmes clair et sombre),
débordements de 320 à 1280 px, hors ligne, et le micro avec un faux micro qui
joue une batterie de synthèse.

```
npm install
npx playwright install chromium
npm test              # tout, environ 6 minutes
npm run test:rapide   # sans le micro
```

## Fichiers

Tout tient dans `index.html` : pas de dépendance, pas de compilation. Les
autres fichiers servent à l'installation sur mobile et au mode hors ligne
(`sw.js`, `manifest.webmanifest`, `icon-*.png`) et aux tests (`tests/`,
`playwright.config.js`, `package.json`).
