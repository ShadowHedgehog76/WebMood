# Moodboard

Base React (Vite) : un grand tableau blanc infini où l'on dessine, dépose des images
et colle du code — le tout persisté localement.

## Démarrer

```bash
npm install
npm run dev
```

## Mise en ligne (GitHub Pages)

Le dépôt vit sur un **Forgejo** auto-hébergé, répliqué automatiquement vers GitHub — c'est
GitHub qui publie le site.

Le site est publié automatiquement à chaque `push` sur `main` par le workflow
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) : `npm ci`, `npm run build`, puis
envoi de `dist/` à GitHub Pages.

À faire une seule fois dans le dépôt : **Settings → Pages → Source : GitHub Actions**.

Le site vit sous un sous-chemin (`/WebMood/`), c'est pourquoi
[vite.config.js](vite.config.js) fixe `base` à `/WebMood/` **au build uniquement** — en
développement on reste à la racine. Si le dépôt est renommé, c'est la seule ligne à changer.
`public/.nojekyll` évite que GitHub passe la sortie dans Jekyll.

Tout est local au navigateur (IndexedDB) : aucun serveur, aucune donnée qui sort de la machine.

## Premier passage

À la première visite, une **visite guidée** se lance toute seule
([Tour.jsx](src/components/Tour.jsx)) : huit étapes qui éclairent tour à tour la barre
d'outils, la barre de réglages, les boutons d'insertion, la navigation, le rail des tableaux
et le partage. Chaque étape peut préparer le décor — celle des réglages sélectionne le crayon
pour que la barre soit visible.

Flèches ou `Entrée` pour avancer, `Échap` ou « Passer » pour sortir. Elle ne revient plus
ensuite, et se rejoue quand on veut depuis **Découvrir le tableau**, dans le rail de gauche.

## Barre d'outils

La barre principale ne fait qu'une chose : **choisir un outil ou insérer un bloc**. Aucun de
ses boutons n'ouvre de menu, et sa taille ne change jamais.

Tout le reste vit sur une **seconde barre flottante, juste au-dessus**
([ContextBar.jsx](src/components/ContextBar.jsx)), qui s'adapte à la sélection ou, à défaut, à
l'outil actif :

| Contexte | Réglages proposés |
| --- | --- |
| Crayon, gomme | couleur, épaisseur |
| Outil forme ou forme sélectionnée | couleur, **les six formes**, remplissage, épaisseur |
| Connexion ou fil sélectionné | couleur, les quatre styles de flèche |
| Bloc visuel sélectionné | **2D / Vecteur / 3D** |
| Nœud de carte mentale | couleur, les quatre dispositions |
| Note ou texte | couleur, note/texte simple, taille |
| Zone de groupe | couleur, tri auto, ranger |
| Deux blocs ou plus | les six alignements |

La **palette** s'ouvre depuis cette barre (le bouton rond), et le choix de la forme, du moteur
d'un bloc visuel ou de la disposition d'une carte mentale s'y fait aussi — les boutons de la
barre principale créent simplement un bloc avec le réglage par défaut.

Elle apparaît et disparaît en fondu, et sa **largeur s'anime** d'un contexte à l'autre — sa
taille est mesurée par un `ResizeObserver`, seule façon d'animer une largeur qui dépend du
contenu.

Aucun raccourci n'est affiché sur le tableau — **survolez un outil** et une petite étiquette
suit la souris avec son nom et sa touche.

Le bouton rond ouvre la **palette** : 91 teintes (16 nuanciers × 5 valeurs, plus une rampe de
gris), une ligne d'accès rapide et un sélecteur système pour une couleur libre. La couleur
choisie sert au crayon, et au fil sélectionné le cas échéant.

## Dessiner et sélectionner

- Outil par défaut : la **sélection** — on arrive sur le tableau sans risquer d'y dessiner
- Outils : **sélection** (`V`), **crayon** (`P`), **gomme** (`E`), **forme** (`S`), **connexion**
  (`L`), **groupe** (`G`), **main** (`H`), **note** (`T`)
- Épaisseurs : quatre valeurs courantes plus un réglage libre au curseur ; même principe pour
  la taille d'un texte
- Icônes SVG dessinées dans [Icons.jsx](src/components/Icons.jsx) : pas d'emoji, pas de police
  d'icônes
- palette complète, 4 épaisseurs
- **Annuler / rétablir** : `⌘Z` / `⇧⌘Z`
- **Naviguer** : barre d'espace + glisser, clic milieu, molette / deux doigts
- **Zoomer** : `⌘` + molette (ou pincement), boutons en bas à droite ; clic sur le pourcentage
  pour réinitialiser la vue

## Tablette et stylet

Tout se pilote au doigt comme à la souris :

- **un doigt** utilise l'outil courant (dessiner, sélectionner, tracer une forme…) ;
- **deux doigts** déplacent et **zooment au pincement**, ancrés sur le point milieu — poser le
  second doigt **annule** ce que le premier venait de commencer, donc pas de trait parasite ;
- le **stylet est prioritaire** : tant qu'il touche la surface, doigts et paume sont ignorés
  (rejet de paume), et un doigt écarté ne peut plus rien déclencher jusqu'à ce qu'il se lève ;
- les **rails s'ouvrent au toucher** (le survol n'existe pas sur tablette), et se referment en
  touchant ailleurs.

## Sélection multiple

En mode sélection, **glisser sur le vide trace un lasso** ; `⇧`-clic ajoute ou retire un bloc,
`⌘A` prend tout. Une sélection multiple se déplace, se supprime et s'aligne d'un bloc : six
boutons d'alignement (gauche, centre, droite, haut, milieu, bas) apparaissent dans la barre
dès que deux blocs sont pris. Le panoramique reste sur `espace`, clic milieu/droit ou trackpad.

- `⌘C` / `⌘V` copient et collent les blocs (le presse-papiers système transporte le JSON, donc
  ça marche aussi d'un tableau à l'autre), `⌘D` duplique sur place.
- `⌘]` / `⌘[` passent au premier plan ou à l'arrière-plan.
- **Clic droit** sur un bloc ouvre son menu : dupliquer, plans, supprimer — plus les entrées
  propres aux nœuds de carte mentale.
- **Aimantation** : en déplaçant un bloc seul, ses bords et son centre s'alignent sur ceux des
  voisins, avec un repère rouge le temps du glisser ([snap.js](src/lib/snap.js)).

## Notes et texte

Deux boutons : la **note** (fond coloré, texte lisible calculé selon la luminance du fond) et
le **texte simple** (sans fond). Double-clic pour éditer, la palette donne la couleur, et quatre
tailles de police sont proposées quand un texte est sélectionné ; un bouton bascule entre note
et texte simple.

## Formes

L'outil **forme** (`S`) trace des vecteurs au glisser, avec aperçu en direct ; un simple clic
pose la forme à une taille par défaut. Huit formes se choisissent dans la barre de réglages —
**rectangle, ellipse, triangle, losange, ligne, flèche, main levée, arc** — et changer de forme
avec une forme sélectionnée **transforme celle-ci**.

**Main levée** : on dessine d'un geste continu et le tracé devient une forme vectorielle, pas
un trait de crayon — elle se déplace, se redimensionne et se recolore comme les autres. Les
points sont rangés en proportions du cadre, donc le dessin suit fidèlement le
redimensionnement ; un tracé qui revient près de son point de départ **se referme** tout seul
et devient remplissable.

**Arc** : une vraie courbe de Bézier cubique. Sélectionné, il montre ses **deux extrémités**
(ronds) et leurs **tangentes** (losanges), reliées par un fin trait bleu — on façonne la
courbe en tirant les losanges.

- Une extrémité lâchée près d'un **bloc** s'accroche à l'un de ses cinq points d'ancrage
  (quatre côtés et centre) et le suit ensuite quand on le déplace.
- Une extrémité lâchée sur **l'extrémité d'un autre arc** les **raccorde** : le point devient
  commun, les deux tangentes s'alignent dans le prolongement l'une de l'autre, et le passage
  d'un arc à l'autre se fait sans cassure. Déplacer une tangente du raccord entraîne celle
  d'en face — la jonction reste lisse.
- Sélectionner un arc affiche aussi les poignées de **ceux qui lui sont raccordés**, pour
  travailler la ligne entière d'un seul coup d'œil.

Les arcs acceptent les mêmes styles de pointe que les connexions.

- La **palette** donne la couleur, quatre pastilles les **épaisseurs courantes** et un
  cinquième bouton une **épaisseur libre** (curseur de 1 à 60 px, valeur affichée sur le
  bouton) ; celui de remplissage colore l'intérieur des formes fermées.
- Ces réglages s'appliquent à la forme sélectionnée, et servent de valeurs par défaut pour la
  suivante.
- Les formes se déplacent et se redimensionnent comme les autres blocs, et le trait garde son
  épaisseur (le SVG est redessiné à la taille réelle du bloc, pas étiré).

## Images et code

Trois façons d'ajouter du contenu :

- **Glisser-déposer** un ou plusieurs fichiers sur le tableau (déposés à l'endroit du curseur)
- **Coller** (`⌘V`) une image ou du texte depuis le presse-papiers
- Les boutons **image** et **code** de la barre d'outils

Les images sont rééchantillonnées au-delà de 1800 px pour garder un document léger et
conservent leur rapport d'aspect au redimensionnement. Les fichiers texte/code deviennent des
blocs colorés : le langage vient de l'extension, ou est deviné d'après le contenu pour un
extrait collé.

En mode **Sélection** : cliquer pour sélectionner, glisser pour déplacer, poignée en bas à
droite pour redimensionner, **double-clic** sur un bloc de code pour l'éditer, `Suppr` ou le
bouton ✕ pour supprimer. Les traits se dessinent toujours **au-dessus** des éléments, ce qui
permet d'annoter une image.

## Blocs visuels (code exécuté)

Le bouton **étincelles** crée un bloc coupé en deux : **le code à gauche, le rendu à droite**,
recalculé pendant la frappe. Le séparateur central se glisse pour donner plus de place à
l'un ou à l'autre, et la taille minimale du bloc (460 × 240) le garde toujours en format
rectangulaire horizontal.

Le **type d'affichage est déclaré dans le code**, sur une directive en tête de fichier —
`// @mode 2d`, `// @mode svg`, `// @mode 3d` (`@type` et les formes courtes `@2d`, `@svg`,
`@3d`, `@vecteur` marchent aussi). Changez la directive et le bloc bascule de moteur ; la
pastille de la barre du bloc affiche le mode reconnu.

Bloc sélectionné, les trois moteurs sont **à un clic dans la barre de réglages**
(2D / Vecteur / 3D). Le bouton ne fait qu'**éditer la directive** — le code reste la source de
vérité et n'est pas perdu. Seule exception : si le code est encore le modèle de départ intact,
il est remplacé par celui du nouveau moteur. Sur du code personnel, changer de moteur peut
évidemment le casser : l'erreur s'affiche en bandeau et le rendu précédent reste à l'écran.

| Directive | Le code reçoit | Ce qu'il fait |
| --- | --- | --- |
| `@mode 2d` | `ctx`, `canvas`, `width`, `height`, `loop(t => …)`, `TAU` | dessine sur un canvas 2D |
| `@mode svg` | `width`, `height`, `h(tag, attrs)`, `TAU` | **renvoie** une chaîne SVG |
| `@mode 3d` | `THREE`, `scene`, `camera`, `renderer`, `width`, `height`, `loop(t => …)` | compose une scène three.js |

`loop(callback)` enregistre une animation : le callback reçoit le temps écoulé en secondes et
le bloc affiche alors un bouton pause. Sans `loop`, le rendu est calculé une seule fois.
Une erreur de syntaxe ou d'exécution s'affiche en bandeau rouge dans le bloc, sans casser le
reste du tableau.

Le rendu affiché n'est remplacé qu'une fois le nouveau **exécuté sans erreur** : pendant la
frappe, où le code est forcément invalide par moments, l'image précédente reste à l'écran
(plus d'écran noir), et l'erreur s'affiche par-dessus.

Le bouton **image** du bloc rasterise l'aperçu courant (×2) et dépose une **image** à côté du bloc, à la
taille de l'aperçu : le visuel devient un élément ordinaire du tableau. three.js n'est chargé
qu'au premier bloc 3D (morceau séparé de ~190 ko gzip).

Le code des blocs est exécuté tel quel dans la page, y compris au rechargement du tableau :
c'est un outil local et personnel, pas un bac à sable — n'y collez que du code que vous
acceptez d'exécuter.

## Cartes mentales

Le bouton **carte mentale** pose un arbre bilatéral ; les quatre dispositions se choisissent
ensuite dans la barre de réglages, un nœud étant sélectionné (le changement vaut pour tout
l'arbre) :

| Disposition | Forme | Liaisons |
| --- | --- | --- |
| **Carte mentale** | racine au centre, branches à gauche et à droite | courbes |
| **Organigramme** | de haut en bas, chaque génération sur une ligne | équerres arrondies |
| **Arborescence** | liste indentée, une ligne par nœud | équerres en L |
| **Radial** | anneaux concentriques autour de la racine | rayons droits |

Tout se fait ensuite au **clic droit sur un nœud** :

- **Créer un enfant** — sous la racine d'une carte mentale, le côté est choisi tout seul pour
  équilibrer l'arbre (gauche, droite, gauche…) ; ailleurs l'enfant pousse du côté de son parent ;
- **Créer un frère** — c'est-à-dire un enfant de plus sur le parent (absent sur la racine, qui
  n'en a pas) ;
- **Renommer** (ou double-clic), **Supprimer la branche** (le nœud et toute sa descendance).

Chaque ajout, suppression ou changement de disposition **redispose tout l'arbre** : les frères
sont espacés selon la place que réclame leur propre descendance, rien ne se chevauche.
Déplacer un nœud emporte sa branche ; déplacer la racine déplace tout l'arbre. Les fils
parent → enfant sont dérivés de la hiérarchie, il n'y a aucune connexion à créer à la main.

**Progression** : les feuilles portent une case à cocher, les nœuds qui ont des enfants
affichent un pourcentage et une jauge. Cocher une feuille fait remonter la progression de
proche en proche jusqu'au nœud principal — chaque nœud vaut la moyenne de ses enfants (une
racine à `72 %` = moyenne de `50 %`, `67 %` et `100 %`). La palette recolore la branche
sélectionnée.

## Zones de groupe

L'outil **groupe** (`G`, cadre pointillé) pose une zone colorée là où l'on clique : une
**bande de couleur sans aucun contrôle** en haut à gauche, et la zone elle-même.

- **Tout bloc lâché dans la zone en devient membre**, où qu'il soit posé dedans — au milieu,
  en bas à droite, un peu à gauche : seule la zone compte (le centre du bloc doit s'y
  trouver). Aucune cible à viser.
- Le ressortir de la zone l'en retire.
- Déplacer la bande de couleur déplace le groupe **et tous ses membres**.
- Groupe sélectionné, la barre d'outils propose **tri auto** (les membres sont rangés en
  grille à chaque ajout, la hauteur du groupe s'ajuste) et **Ranger** (tri ponctuel). La
  palette recolore la zone.
- `Suppr` efface la zone sans toucher aux blocs qu'elle contenait.
- Zones imbriquées : la plus petite l'emporte.

## Connexions

L'outil **connexion** (`L`) relie deux blocs : cliquez le bloc de départ, puis le bloc d'arrivée
(`Échap` annule). Le fil est une courbe de Bézier qui s'accroche au côté le plus proche et
suit les blocs quand on les déplace.

Quatre styles de pointe, choisis dans la barre d'outils (aperçu dessiné sur chaque bouton) :
sans flèche, à droite, à gauche, des deux côtés. Le style et la couleur sélectionnés s'appliquent au fil
sélectionné, et deviennent le réglage par défaut des suivants. Un clic sur un fil le
sélectionne, `Suppr` l'efface ; supprimer un bloc emporte ses connexions.

## Tableaux, export et import

Une **barre flottante à gauche** ([BoardRail.jsx](src/components/BoardRail.jsx)) tient lieu de
menu « fichier ». Repliée, elle affiche des **vignettes carrées** — une par tableau, dessinées
depuis son contenu réel — et les icônes d'action ; **au survol elle s'ouvre** sur les noms et
les libellés. Elle propose :

- **plusieurs tableaux** : créer, renommer, dupliquer, supprimer, basculer — chacun garde son
  contenu et sa position de vue ;
- **Image PNG** de tout le tableau ou de la seule sélection ;
- **Exporter / importer un JSON** (l'import crée un nouveau tableau, il n'écrase rien).

Les vignettes ne sont pas des images : chaque sauvegarde recalcule une poignée de rectangles
normalisés (position, taille, type, couleur) rangés dans l'index — quelques centaines d'octets
par tableau, toujours à jour, sans rendu coûteux ([preview.js](src/lib/preview.js)).

L'export PNG réunit ce qui vient de trois rendus différents : les traits sont retracés sur un
canvas, les fils et branches sont reconstruits depuis leur géométrie, et les blocs (qui sont du
DOM) passent par un `foreignObject` SVG — avec les canvas remplacés par leur bitmap et les
champs de saisie réinjectés, sans quoi ils sortiraient vides ([export.js](src/lib/export.js)).
Les images hébergées en ligne sont rapatriées en `data:` avant la sérialisation, sinon elles
manqueraient à l'appel.

## Compte et tableaux en ligne

Le rail propose **Se connecter**, qui ouvre une fenêtre d'authentification
([AccountDialog.jsx](src/components/AccountDialog.jsx)) : adresse et mot de passe, création de
compte, ou **lien magique** reçu par courriel pour ceux qui n'aiment pas les mots de passe. La
création demande une **confirmation par courriel** avant la première connexion ; les messages
d'erreur du serveur sont traduits en français.

Une fois connecté :

- les tableaux du compte **rejoignent le rail** ; ceux d'ici prennent leur place en ligne, sans
  doublon (chaque entrée de l'index retient son `cloudId`) ;
- chaque enregistrement local est **répercuté en base** (table `boards`, colonne `doc` en
  `jsonb`) avec sa vignette, et les images collées **partent dans le Storage** : le document
  ne transporte plus des mégaoctets de base64 mais des adresses, dédoublonnées par empreinte
  SHA-256 du contenu ;
- ouvrir un tableau connu du compte mais absent de la machine **va chercher son contenu** ;
- **Copier le lien public** publie le tableau courant et met dans le presse-papier un lien
  `…/#b=<identifiant>` ; qui l'ouvre en récupère une copie dans ses propres tableaux.

La fenêtre du compte offre en plus les deux forçages, quand l'aller-retour automatique ne
suffit pas (long moment hors ligne, machine qui découvre le compte) :

- **Envoyer mes tableaux en ligne** : chaque tableau d'ici part en base, images comprises —
  ce qui est sur cet ordinateur écrase la base ;
- **Récupérer les tableaux du compte** : tous les tableaux du compte sont réécrits en local,
  le tableau ouvert se rafraîchit à l'écran — ce qui est en ligne écrase les copies locales.

Le tout demande les deux clés publiques du projet, dans un `.env` local (voir
[.env.example](.env.example)) et, pour la mise en ligne, dans les secrets du dépôt
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — sans elles, le bouton reste éteint et
l'application fonctionne en local comme avant.

Tout passe par [cloud.js](src/lib/cloud.js), qui charge le client Supabase à la demande. La
sécurité repose sur le **RLS** de Postgres : on ne lit et n'écrit que ses propres tableaux, à
l'exception des tableaux marqués publics, lisibles par tout le monde. Le Storage suit la même
règle (lecture ouverte, écriture et suppression dans son propre dossier).

Hors connexion, rien ne change : les tableaux restent dans IndexedDB et le compte est
facultatif.

## Partage et collaboration

Le rail propose **Partager ce tableau**, qui ouvre deux façons de faire
([ShareDialog.jsx](src/components/ShareDialog.jsx)).

### Code de partage (hors ligne)

Le tableau entier est sérialisé, compressé (`CompressionStream`, deflate brut) puis encodé en
base64url ([share.js](src/lib/share.js)) : un tableau avec une note et un trait de 200 points
tient dans **~1 ko** de texte. On le transmet comme on veut ; la personne qui le colle obtient
une **copie indépendante** dans un nouveau tableau.

### Session pair-à-pair (temps réel)

L'hôte ouvre une session et obtient un **code à six caractères** ; chaque personne qui le
saisit rejoint le tableau. Les navigateurs se parlent **directement en WebRTC**
([session.js](src/lib/session.js), PeerJS chargé à la demande) — un annuaire public sert
uniquement à la mise en relation, aucune donnée du tableau n'y transite.

Deux régimes, choisis pour que la liaison tienne dans la durée :

| Ce qui circule | Cadence | Pourquoi |
| --- | --- | --- |
| **Curseurs** | une fois par image | c'est ce qui donne la présence des autres |
| **Tchat** (bulles comprises) | immédiat | un message ne se fait pas attendre |
| Tout le reste — blocs, textes, traits, connexions | un **résumé toutes les 320 ms** | assez pour suivre, assez peu pour ne jamais s'engorger |

Le résumé ne contient **que ce qui a changé depuis le précédent**, et pour un bloc modifié,
**seuls les champs concernés** : déplacer une image n'en renvoie pas les données, seulement
ses coordonnées. Le trait en cours de tracé n'envoie que ses **nouveaux points**. C'est une
réécriture volontaire d'une première version qui diffusait le document entier — images
comprises — toutes les 220 ms : impeccable au début, saturée au bout de quelques minutes.

À la réception, un mouvement reçu **glisse** vers sa nouvelle place en 0,32 s au lieu d'y
sauter : on garde la sensation du direct sans en payer le débit. La transition est désactivée
si l'on est soi-même en train de manipuler un bloc, pour ne pas le faire traîner.

Les curseurs reçus alimentent une cible, et une boucle d'animation les en rapproche image par
image ([RemoteCursors.jsx](src/components/RemoteCursors.jsx)) : le mouvement reste fluide même
si le réseau livre les positions irrégulièrement. Chaque curseur affiche le nom de la personne
**et l'outil qu'elle tient** (crayon, gomme, forme, main…), mis à jour au moment où elle en
change.

Quand quelqu'un **écrit dans un bloc**, son curseur devient un **stylo** posé **sur la lettre
en cours**, et suit la frappe, les flèches et les clics dans le texte. Le navigateur n'expose pas la position
du curseur de saisie : elle est mesurée en recopiant le champ dans un calque invisible
([caret.js](src/lib/caret.js)), en tenant compte du zoom du tableau.

Pendant la session, un **rail apparaît à droite**, symétrique de celui des tableaux
([ChatRail.jsx](src/components/ChatRail.jsx)) : replié il montre les **participants** (pastille
colorée avec leurs initiales) et une pastille rouge en cas de messages non lus ; au survol il
s'ouvre sur les noms et le **tchat** de la session.

### Pointer un endroit

En **mode sélection**, un clic sec dans le vide envoie une **onde** à l'endroit cliqué, chez
tout le monde ([Pings.jsx](src/components/Pings.jsx)) : deux cercles qui s'ouvrent, à la
couleur de la personne, avec son nom. **Alt (Option) + clic** fait la même chose **quel que
soit l'outil** et sans rien perturber : pas de trait au crayon, pas de bloc déplacé ni
sélectionné. L'onde s'efface au bout d'une seconde.

### Secouer pour se faire voir

Comme sur macOS : **secouer sa souris** fait grossir son curseur chez tout le monde pendant une
seconde, puis il reprend sa taille. La détection est locale
([shake.js](src/lib/shake.js)) — au moins cinq changements de sens dans une fenêtre de 450 ms,
à plus de 900 px/s — et seul un petit message `shake` circule, au plus toutes les 400 ms. Un
déplacement rectiligne ou une hésitation lente ne déclenchent rien.

### Message rapide

Une touche **Entrée** ouvre une saisie à l'endroit du curseur
([QuickChat.jsx](src/components/QuickChat.jsx)), comme un menu contextuel — pas besoin d'aller
chercher le rail. `Entrée` envoie, `Échap` annule.

- Pendant qu'une personne écrit (saisie rapide **ou** champ du rail), les autres voient **trois
  points animés à la place de son nom**, sur son curseur.
- Le message envoyé apparaît **dans le tchat** et dans une **bulle sous le curseur** de son
  auteur, qui s'efface au bout de six secondes.

La topologie est en étoile : l'hôte relaie les messages entre les invités. Un invité n'émet
son document qu'après avoir reçu celui de l'hôte, sinon un arrivant au tableau vide effacerait
le travail de tout le monde. **Qui a le code peut rejoindre** : ne le diffusez qu'aux personnes
concernées.

### Tenir la connexion

Le réseau réel coupe, ralentit, change d'adresse. Plusieurs garde-fous s'empilent
([session.js](src/lib/session.js)) :

- **Relais TURN** en plus du STUN (ports 80, 443 et 443 en TCP) : quand la liaison directe
  est impossible — NAT strict, réseau d'entreprise, partage de connexion mobile — le flux
  passe par le relais au lieu d'échouer. C'était la cause principale des coupures.
- L'annuaire est maintenu au chaud (`pingInterval`), et s'il lâche, la liaison est
  **rétablie automatiquement** sans perdre la session ni le code.
- Une coupure entre deux personnes déclenche **trois tentatives de reconnexion au même
  hôte** avant d'envisager quoi que ce soit d'autre : une microcoupure ne provoque plus de
  changement d'hôte.
- « Pair introuvable » est écouté sur l'objet peer, là où PeerJS l'émet : un hôte vraiment
  absent est constaté tout de suite au lieu d'attendre le délai.
- **Onglet en arrière-plan** ou retour de connexion : les minuteurs sont remis à zéro
  (`visibilitychange`, `online`), sinon un onglet ralenti par le navigateur passait pour une
  déconnexion.
- Les erreurs sans gravité (pair parti, hoquet réseau) ne coupent plus la session.

Pendant une reconnexion, un bandeau « Connexion instable » s'affiche ; il disparaît dès que
la liaison est rétablie.

### Si l'hôte disparaît

Un **battement de cœur** circule dans les deux sens (toutes les 2,5 s). Après 8 s de silence,
on tente de se rebrancher ; ce n'est qu'après l'échec de ces tentatives — une quinzaine de
secondes en tout — que l'hôte est déclaré perdu :

- l'hôte tombe et il reste **au moins deux personnes** → le survivant au plus petit
  identifiant **reprend le même code**, les autres s'y rebranchent tout seuls (~6 s), et le
  tableau continue de se synchroniser ; un message le signale dans le tchat ;
- l'hôte tombe et il ne reste **qu'une personne** → la session se ferme proprement, avec un
  avis en haut de l'écran. Le tableau, lui, reste intact en local ;
- un invité disparaît sans prévenir → il sort de la liste des participants au bout de ~9 s.

Reprendre le **même code** est la clé : c'est ce qui permet aux autres de retrouver la session
sans rien se redire, et à quelqu'un d'arriver plus tard avec le code initial.

## Vue d'ensemble

Une **minimap** en bas à gauche montre les blocs en miniature et le cadre de la vue courante ;
un clic ou un glisser dedans déplace la vue ([Minimap.jsx](src/components/Minimap.jsx)).

## Persistance

Le document (traits, éléments, connexions, position de la vue) est enregistré automatiquement ~500 ms
après chaque modification dans **IndexedDB** (`moodboard` › `boards`), un enregistrement par
tableau plus un index, avec repli sur `localStorage` — et, si un compte est connecté, une
copie en base (voir plus haut). L'indicateur en bas à droite affiche l'état. Tout est rechargé au
démarrage ; le bouton 🗑 vide le tableau (annulable avec `⌘Z`).

## Animations

Durées et courbes sont trois variables partagées (`--fast`, `--base`, `--slow`, plus deux
courbes) définies dans [index.css](src/index.css), pour que tout bouge de la même façon :

- les blocs **apparaissent** avec un léger ressort, les poignées de sélection aussi ;
- une **remise en page automatique** (changement de disposition d'une carte mentale, tri d'un
  groupe, alignement d'une sélection) fait **glisser les blocs** vers leur nouvelle place au
  lieu de les téléporter — et uniquement dans ce cas : pendant un glisser à la souris, aucune
  transition, sinon le bloc traînerait derrière le curseur ;
- menus, palette, menu contextuel, infobulle, fenêtre de partage et messages du tchat entrent
  en fondu-glissé ; les boutons s'enfoncent légèrement au clic ;
- les rails, la barre de réglages et les curseurs distants ont leurs propres animations,
  décrites plus haut.

Tout est neutralisé d'un bloc si le système demande **moins de mouvement**
(`prefers-reduced-motion`).

## Performance

Le tableau reste à 120 fps en déplacement, même dézoomé et chargé :

- la grille est un **motif mis en cache** (un `fillRect` par image) avec un pas qui double
  quand on dézoome, au lieu d'un `arc()` par point — c'était des dizaines de milliers
  d'appels par image ;
- les traits hors écran sont **ignorés** grâce à une boîte englobante mémorisée par trait ;
- souris, trackpad et molette sont **regroupés à une mise à jour par image** (`requestAnimationFrame`) ;
- les blocs et les fils sont **mémoïsés** : un panoramique ne re-rend aucun bloc, et la couche
  des éléments est promue en texture (`will-change`) ;
- les fils sont dessinés en **coordonnées écran** (SVG de la taille de la fenêtre) ;
- une animation de bloc visuel **se met en pause hors écran** (`IntersectionObserver`), ce qui
  compte quand on dézoome sur beaucoup de blocs animés.

## Structure

```
src/
  main.jsx                  point d'entrée
  App.jsx
  index.css
  components/
    Whiteboard.jsx          document, historique, canvas, pan/zoom, sélection, connexions
    Whiteboard.css
    Toolbar.jsx             barre d'outils flottante (taille fixe)
    ContextBar.jsx          barre des réglages du moment, largeur animée
    BoardRail.jsx           barre latérale : tableaux, vignettes, export PNG/JSON, import
    Minimap.jsx             vue d'ensemble et navigation
    ShareDialog.jsx         code de partage et session pair-à-pair
    AccountDialog.jsx       connexion, création de compte, lien magique
    ChatRail.jsx            rail droit : participants repliés, tchat déployé
    QuickChat.jsx           saisie rapide ouverte à la position du curseur
    Pings.jsx               ondes visuelles pour pointer un endroit
    RemoteCursors.jsx       curseurs des participants, interpolés
    Icons.jsx               jeu d'icônes SVG inline (aucune dépendance)
    BoardItem.jsx           élément image / code / visuel / groupe : déplacer, redimensionner
    BoardItem.css
    GroupBlock.jsx          zone de groupe : bande de couleur + zone colorée
    MindNode.jsx            nœud de carte mentale : case à cocher, jauge, édition
    ShapeBlock.jsx          rendu SVG des formes (rect, ellipse, triangle, losange, ligne, flèche)
    TextBlock.jsx           note colorée ou texte simple
    GroupBlock.css
    SketchBlock.jsx         bloc visuel : aperçu live, modes, pause, export image
    SketchBlock.css
    Links.jsx               calque SVG des connexions
    Links.css
  lib/
    storage.js              IndexedDB + repli localStorage
    files.js                fichiers → éléments (rééchantillonnage image, blocs de code)
    highlight.js            coloration syntaxique minimale + détection de langage
    sketch.js               exécution des blocs visuels (2D / SVG / three.js) + capture
    links.js                géométrie des fils : ancrage, courbe, pointes de flèche
    groups.js               zones de groupe : appartenance par zone, tri automatique
    mindmap.js              arbre : disposition automatique, branches, progression
    shapes.js               formes : liste, normalisation du tracé, fabrique
    align.js                alignement d'une sélection multiple
    snap.js                 aimantation aux bords et centres voisins
    export.js               export PNG (canvas + foreignObject) et JSON
    share.js                code de partage : compression et encodage
    session.js              session WebRTC : connexions, relais, messages
    cloud.js                Supabase : compte, tableaux en base, images dans le Storage
    shake.js                détection du secouage de souris
    caret.js                position à l'écran du curseur de saisie
    preview.js              vignette d'un tableau : rectangles normalisés stockés dans l'index
    palette.js              palette générée (16 teintes × 5 valeurs + gris)
```

Le document est `{ strokes, items, links }` — un `item` est une image, un bloc de code, un
bloc visuel, une note, une forme, une zone de groupe ou un nœud de carte mentale : les traits sont rasterisés sur un `<canvas>`, les
éléments sont des nœuds DOM dans un calque transformé — texte net à tous les niveaux de zoom.
L'historique conserve des instantanés complets du document, d'où un `⌘Z` uniforme sur le
dessin comme sur les éléments.
