# Mains Rocketbox (vr/hands/rb-*.glb)

Générées hors ligne par `bake.js` (three r170, FBXLoader + GLTFExporter, dans une page Playwright) à partir de
`Assets/Avatars/Adults/Male_Adult_01` de https://github.com/microsoft/Microsoft-Rocketbox (MIT) :
`Export/Male_Adult_01.fbx` et `Textures/m002_body_color.tga` (non versionnés ici).

Étapes : doigts repliés autour d'une baguette (recherche par grille), skinning figé en maillage statique dans le
repère du porte-baguette (baguette sur -z, mètres), on ne garde que main + avant-bras (coupé à 22 cm, fondu dès 9 cm),
texture recadrée en JPEG 512 px.
