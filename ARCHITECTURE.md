# Reprendre ce projet

Ce document s'adresse à qui hérite du code. Le [README](README.md) dit **comment installer et
configurer** ; celui-ci dit **pourquoi c'est fait comme ça**, et surtout **ce qui va vous mordre**.
Les décisions qui ont l'air arbitraires ont presque toutes une raison, et elle est écrite quelque
part — le plus souvent en commentaire, juste au-dessus de la ligne concernée.

---

## En deux minutes

vlfmusic.fr est un catalogue des playlists Spotify du propriétaire du site. Les visiteurs le
parcourent, et peuvent — avec un compte — mettre des playlists en favori et voter pour elles.

```
Spotify API ──(build)──> catalog.json ──> site statique (GitHub Pages)
                              ▲                    │
                    data/site-content.json         │ fetch
                    data/genre-taxonomy.json       ▼
                                            Supabase (Postgres + Auth)
```

Trois dépendances de production, pas une de plus : `react`, `react-dom`, `@supabase/auth-js`.
Aucun framework CSS, aucune bibliothèque de composants, aucun client de requêtes. C'est un choix,
pas un manque de temps : le site fait peu de choses, et chacune tient en quelques dizaines de
lignes qu'on peut lire.

---

## La contrainte qui explique tout le reste

**GitHub Pages ne sait que servir des fichiers.** Il n'y a pas de serveur, donc pas d'endroit de
confiance où exécuter du code. Tout ce qui ressemble à une décision étrange en découle :

- Le catalogue est un **JSON figé au build**, pas une requête à l'exécution. La clé Spotify ne peut
  pas vivre dans le navigateur.
- Les comptes et les votes passent par **Supabase**, appelé directement depuis le navigateur. La
  sécurité ne peut donc pas être dans le code du site — elle est **dans la base**.
- Les pages d'administration écrivent via **l'API GitHub avec un token personnel**, saisi à la main
  par le propriétaire et stocké dans son seul navigateur. Ce mécanisme n'est pas généralisable aux
  visiteurs, ce qui est précisément pourquoi Supabase existe ici.

> **La règle qui en découle, et qui vaut pour toute évolution :** ce que le site affiche n'est
> jamais une garantie. Si une donnée doit rester privée, c'est une politique Postgres qui doit le
> refuser, pas un composant qui doit s'abstenir de l'afficher.

---

## D'où viennent les playlists

`scripts/fetch-and-merge-playlists.mjs`, lancé au build (`npm run fetch:playlists`), produit
`public/data/catalog.json` en fusionnant trois sources :

| Source | Contenu | Qui l'écrit |
|---|---|---|
| API Spotify | noms, descriptions, nombre de titres, durées, URL | Spotify |
| `data/genre-taxonomy.json` | comment un **nom** de playlist devient genre, dossier et tags | à la main |
| `data/site-content.json` | descriptions éditoriales, coups de cœur, définitions de tags | la page `#/admin` |

**Les tags ne sont pas saisis : ils sont déduits du nom de la playlist**, par
`classifyPlaylistName()` dans [`src/lib/genreTaxonomy.js`](src/lib/genreTaxonomy.js). Renommer une
playlist sur Spotify la déplace donc de dossier au prochain build. C'est voulu — c'est ce qui permet
de tout piloter depuis Spotify — mais ça veut dire qu'une correction de tag se fait **soit** en
renommant la playlist, **soit** en modifiant la taxonomie.

Ce fichier est en `.js` et non en `.ts` pour une seule raison : il est importé tel quel par le
script Node du build, qui n'a aucun chargeur TypeScript.

### Le piège de la taxonomie

La comparaison ignore la casse, les accents et les apostrophes typographiques — mais **la graphie
renvoyée est celle écrite dans la taxonomie**. Le même mot orthographié de deux façons dans deux
listes différentes produit donc deux tags distincts pour une seule idée. C'est arrivé
(`Melo`/`Mélo`, `Lectro`/`Léctro`, 20 playlists coupées en deux) ; voir le commit
« Spell each tag one way ». Avant d'ajouter un token, vérifier qu'il n'existe pas déjà ailleurs sous
une autre orthographe.

Pour une faute de frappe côté Spotify, la forme tableau existe : `["Acide", "Acid"]` accepte les
deux et ne renvoie jamais que la première.

---

## Carte du code

### `src/lib` — la logique, testable

| Fichier | Rôle |
|---|---|
| `router.ts` | Routes, navigation, animation de dossier. Singleton + `useSyncExternalStore`. |
| `catalog.ts` | Modèle du catalogue : arbre de dossiers, tri, tags, formatage des durées. |
| `genreTaxonomy.js` | Nom de playlist → genre / dossier / tags. Partagé avec le script de build. |
| `useCatalog.ts` | Chargement de `catalog.json`. |
| `supabase.ts` | **Seul fichier qui importe `@supabase/*`.** Client auth différé + `restFetch`. |
| `authStore.ts` | État de session, connexion Google, échange du code, chemin de retour. |
| `userLibrary.ts` | Favoris et votes de la personne connectée, bascules optimistes. |
| `upvoteCounts.ts` | Compteurs publics, un seul fetch mémoïsé pour toute l'application. |
| `profile.ts` | Pseudo, normalisation, suppression de compte. |
| `github.ts`, `siteContent.ts` | Écriture dans le dépôt via l'API GitHub (pages privées). |
| `spotifyAuth.ts`, `spotifyApi.ts` | OAuth PKCE et appels Spotify (pages privées). |
| `adminGate.ts`, `hash.ts` | Le mot de passe dissuasif des pages privées. |
| `folderTransition.ts` | L'animation d'ouverture de dossier (Web Animations API). |

### `src/pages` — le rendu

Publiques : `CatalogPage`, `PlaylistRow`, `GlossaryPage`, `FavoritesPage`, `AccountPage`,
`SignInPage`, `PrivacyPage`, `SiteMenu`, `SiteFooter`.
Privées : `AdminPage`, `ModifyPage`, `PasswordGate`.

**Presque tout le CSS est dans `CatalogPage.css`**, importé par chaque page. Ce n'est pas idéal,
mais le fichier est ordonné par zone et abondamment commenté ; le scinder demanderait de trancher
ce qui est partagé, ce qui est loin d'être évident.

---

## Conventions du front

### État partagé : singleton de module, pas de contexte React

`router.ts`, `authStore.ts`, `userLibrary.ts` et `upvoteCounts.ts` suivent tous le même patron : un
état au niveau du module, un `Set` d'écouteurs, et un hook `useSyncExternalStore`. Les raisons, par
ordre d'importance :

1. `main.tsx` est enveloppé de `<StrictMode>` : un provider s'abonnerait **deux fois** à chaque
   rechargement en développement. Un module ne s'évalue qu'une fois.
2. `App.tsx` et `userLibrary.ts` lisent ces états **sans être des composants**.
3. Des fonctions pures se testent dans le vitest Node en place ; un provider, non.

> ⚠️ **Le piège** : `useSyncExternalStore` compare les instantanés par **identité**. `router.ts` s'en
> tire avec une chaîne, comparée par valeur. Un instantané **objet** reconstruit à chaque lecture
> fait boucler React indéfiniment. Les stores ne remplacent l'objet que quand quelque chose a
> réellement changé — voir `setState()` dans `authStore.ts`.

### Navigation

`<Link to="…">` est un vrai `<a href>` qui route en place au clic gauche simple : le clic milieu,
« copier le lien » et « ouvrir dans un onglet » continuent de fonctionner. `navigate()` empile une
entrée d'historique, `replaceLocation()` non — cette dernière sert quand l'URL qu'on quitte ne doit
pas pouvoir être rejouée (retour OAuth) ou n'a pas à exister (redirection de garde).

Les pages publiques ont de vrais chemins (`/genre/techno`), les deux pages privées restent sur des
routes à dièse : un dièse n'est jamais envoyé au serveur. GitHub Pages n'ayant pas de réécriture
SPA, le build copie `index.html` en `404.html` (voir `vite.config.ts`) — c'est ce qui fait marcher
un lien profond à froid.

---

## Comptes, connexion, sécurité

### Aucun mot de passe n'existe

La connexion passe uniquement par Google. Il n'y a **aucun formulaire d'inscription** sur le site,
donc rien à spammer, aucun hash à casser, aucune réinitialisation à attaquer. C'était une exigence
explicite, et c'en est la forme la plus forte : ne rien stocker.

### Ce qui protège les données

**La clé `anon` est publique par conception** et vit dans `src/config.ts`, commitée. Elle n'autorise
rien par elle-même. Ce qui protège, c'est la posture des droits :

- `anon` ne reçoit **aucun `GRANT` de table** sur `favorites`, `upvotes` et `profiles`. Les refus
  arrivent donc en `42501` *avant* même qu'une politique soit consultée.
- Les seules fenêtres publiques sont des **vues**, qui ne peuvent renvoyer que les colonnes et les
  lignes qu'elles nomment. Une politique mal écrite exposerait tout ; une vue, non.
- Aucun droit `UPDATE` n'est accordé nulle part : on insère ou on supprime. C'est ce qui rend
  `created_at` infalsifiable et un double vote structurellement impossible (clé primaire composite).

> ⚠️ **Ne jamais ajouter `force row level security` sur `public.upvotes`.** La vue des compteurs
> agrège au nom du propriétaire de la table, exempt de sa propre RLS. `FORCE` la lui appliquerait et
> **tous les compteurs publics tomberaient à zéro**. C'est écrit aussi dans la migration `0001`.

> ⚠️ **La clé `service_role` ne doit jamais apparaître dans ce dépôt**, sous aucune forme. Le Client
> Secret Google non plus : il vit dans Supabase et nulle part ailleurs.

Les migrations sont dans `supabase/migrations/`, numérotées, et **chacune explique son raisonnement
en tête**. Ce sont elles la documentation du modèle de sécurité, pas ce fichier.

### `/connexion` : un chemin, deux métiers

C'est **à la fois** la page de connexion et l'URL de retour de Google. Ce n'est pas un raccourci :
Supabase n'accepte que des URL de redirection déclarées à l'avance dans sa console, donc replier la
page visible sur le chemin d'atterrissage évite d'en déclarer une seconde et de les tenir en phase.

Les deux se distinguent par la **query string**, jamais par le chemin : un retour de Google porte
`?code=` ou `?error=`, un visiteur qui arrive pour se connecter ne porte rien. Lu une seule fois au
montage, parce que l'échange efface la query en s'exécutant.

> ⚠️ **La collision de callback OAuth.** Spotify et Google renvoient tous deux un `?code=` sur la
> même origine. Ils sont départagés **par leur chemin d'atterrissage** : Spotify sur `/`, Google sur
> `/connexion`. Le `redirect_uri` de Spotify est enregistré verbatim comme la racine du site et ne
> peut pas bouger sans re-déclaration, donc c'est Google qu'on a déplacé.
>
> Se tromper ici donne le code d'un fournisseur au point de terminaison de l'autre et **le
> consomme** : un code est à usage unique et vit cinq minutes. `spotifyAuth.ts` efface la query
> *avant* ses contrôles de validité, donc un code égaré est détruit sans possibilité de réessai.
>
> **Et ça ne se teste pas en local** : `SPOTIFY_REDIRECT_URI` est figé sur la production. Toute
> modification de l'effet de callback dans `App.tsx` doit être revérifiée **sur le site déployé**.

Le client `GoTrueClient` est construit à la main avec deux réglages non négociables, expliqués dans
`supabase.ts` : `flowType: 'pkce'` (le défaut autonome est `implicit`, qui met le jeton d'accès dans
l'URL, donc dans l'historique) et `detectSessionInUrl: false` (le défaut consommerait le `?code=` de
Spotify).

### Chargement différé de l'authentification

`@supabase/auth-js` pèse ~23 ko gzip et **n'est pas dans le bundle initial**. Le pivot est
`hasStoredSession()`, une lecture synchrone de `localStorage` sur une clé qu'on pose nous-mêmes :
son absence prouve qu'il n'y a rien à restaurer. Un visiteur qui ne se connecte jamais télécharge
~84 ko gzip au lieu de ~104, et est connu déconnecté immédiatement plutôt qu'après un
téléchargement.

Un test verrouille ce gain (`supabase.test.ts`, `expect(clientBuilds).toBe(0)`). Si vous le voyez
échouer, quelque chose a remis le client sur le chemin critique.

---

## Les pièges, dans l'ordre où ils mordent

1. **Ne jamais faire confiance au `public/data/catalog.json` local.** Il peut contenir des durées à
   zéro ou périmées. Un bug « les durées ne s'affichent plus » a déjà été poursuivi une demi-heure
   avant qu'on constate que la production allait bien. **Comparer avec
   `https://vlfmusic.fr/data/catalog.json` avant de conclure.**
2. **Ne pas relancer de build Spotify manuel pour déboguer.** Chaque exécution consomme du quota.
3. **La connexion Spotify ne peut pas aboutir en local** (voir ci-dessus).
4. **La copie de travail est en CRLF**, le dépôt en LF. Un script d'édition qui compare des chaînes
   multi-lignes doit normaliser (`.replace(/\r\n/g, '\n')`) ou il ne trouvera jamais ses ancres.
5. **Le lien du titre est étiré sur toute la ligne** (`.row-link::after { inset: 0 }`), pour qu'un
   clic n'importe où ouvre Spotify. Tout contrôle posé dans une ligne doit donc porter
   `position: relative; z-index: 1` pour repasser au-dessus — **sur le bouton lui-même, jamais sur
   son conteneur**, sinon la durée et le nombre de titres remontent avec et cessent d'être
   cliquables.
6. **Ne pas poser `opacity`, `transform`, `filter` ou `isolation` sur ces boutons** : chacun ouvre un
   contexte d'empilement. Un `background`, lui, est sans danger — c'est pour ça que le cadre violet
   d'un coup de cœur est dessiné en pseudo-élément au-dessus plutôt qu'en masquant derrière.
7. **`.row` se replie de trois à deux colonnes sous 480 px.** Ajouter une quatrième colonne oblige à
   tenir deux points de rupture en phase pour toujours. Préférer une bande qui s'étend
   (`grid-column: 1 / -1`), comme la barre d'actions.
8. **`.catalog-page` pose deux calques décoratifs en `position: fixed` sur toute la fenêtre.** Tout
   contenu ajouté hors de `.catalog` a besoin de son propre `position: relative; z-index: 1`, sans
   quoi il est peint par-dessous et devient invisible. C'est arrivé au pied de page.
9. **Le texte visible par les visiteurs fait partie du modèle de sécurité.** Le glossaire, l'écran de
   connexion et la page de confidentialité affirment des choses sur la vie privée. **Toute
   modification du schéma ou des droits doit être suivie d'une relecture de ces trois pages** — elles
   ont déjà dû être corrigées trois fois pour avoir promis une confidentialité qui n'était plus
   exacte.

---

## Tests

`vitest` en environnement **Node**, sans jsdom : il n'y a donc **aucun test de composant**, par choix.
En ajouter un demanderait `jsdom`, `@testing-library/react` et sa panoplie — quatre dépendances de
développement pour vérifier un bouton.

**La conséquence pratique, à respecter** : mettre les décisions dans des modules purs qui se testent
(`catalog.ts`, `profile.ts`, `userLibrary.ts`, `genreTaxonomy.js`), et garder les composants aussi
bêtes que possible. Les appels réseau se testent en remplaçant `fetch` par `vi.stubGlobal`, sur le
modèle de `github.test.ts`.

La porte avant de pousser, dans cet ordre :

```bash
npx vitest run      # 125 tests
npx tsc -b          # typage
npm run lint        # oxlint
npm run build       # et vérification à l'œil dans le navigateur
```

---

## Déploiement

`.github/workflows/deploy.yml`, sur push vers `main`, en manuel, et par cron quotidien à 6 h — le
cron existe pour récupérer les changements faits côté Spotify sans commit.

`npm run lint` et `npm test` s'exécutent **avant** le fetch Spotify : un run condamné n'a pas à
dépenser du quota avant d'échouer. Corollaire à connaître : **un test rouge arrête aussi le
rafraîchissement quotidien du catalogue.** C'est le bon arbitrage, mais c'est d'où vient un site qui
n'a plus bougé depuis deux jours.

Une étape `curl` maintient le projet Supabase éveillé : l'offre gratuite met un projet en pause après
une semaine sans activité base. Le trafic réel y suffit normalement — chaque page lit les compteurs —
mais le cron est le plancher.

---

## Ce qui est en pause, et ce qui reste

**Le panneau des votants.** Il affichait le pseudo des personnes ayant coché « rendre mes votes
publics ». Retiré le 04/09/2026 parce que mal dessiné, avec l'interrupteur qui allait avec, puis la
vue `playlist_public_voters` a été refermée par la migration `0004`.

> ⚠️ **Si vous le remettez, remettez les trois choses ensemble** : le panneau, l'interrupteur de la
> page « Mon compte », et le `grant` sur la vue. Rouvrir la vue sans l'interrupteur laisse la liste
> lisible par n'importe qui — la clé `anon` est publique — pendant que plus personne ne peut s'en
> retirer. C'est exactement l'état dans lequel le projet s'est trouvé quelques heures, et que le
> contrôle de cohérence a rattrapé. `canGoPublic()` dans `profile.ts` est conservée pour ça.

**Restent ouverts** : les définitions de tags du glossaire (`catalog.tags` est vide ; un CSV des 91
entrées circule pour être rempli d'un coup), la vérification de marque Google (README, étape 9), et
la reprise du design de plusieurs écrans — `/favoris`, `/compte` et la puce « Les plus votées »
réutilisent encore les classes du catalogue sans avoir été dessinés.
