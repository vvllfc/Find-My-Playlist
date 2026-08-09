# Find My Playlist

Site du projet Find My Playlist, servi sur [vlfmusic.fr](https://vlfmusic.fr) via GitHub Pages.

Catalogue public des playlists Spotify publiques (recherche + tags), et page privée `#/admin`
pour éditer les descriptions/tags et modifier directement le nom/description sur Spotify.

## Stack

- [Vite](https://vite.dev) + React + TypeScript
- Récupération des playlists publiques au build (GitHub Actions) via l'API Spotify, authentifiée
  avec un refresh token (Spotify n'autorise plus le flow app-only "Client Credentials" pour lister
  les playlists d'un compte, même publiques — voir "Sécurité" ci-dessous)
- Admin (`#/admin`) : édition des tags/descriptions du site via l'API GitHub (Contents), édition
  directe nom/description Spotify via OAuth (Authorization Code + PKCE)

## Développement

```bash
npm install
npm run dev
```

Sans les variables Spotify (`SPOTIFY_CLIENT_ID`/`SPOTIFY_REFRESH_TOKEN`), `npm run fetch:playlists`
utilise automatiquement `data/sample-spotify-fixture.json` — pratique pour développer sans
credentials réels. Pour tester avec de vraies données en local, crée un `.env.local` (gitignored)
avec ces deux variables (le refresh token s'obtient via `#/admin`, voir étape 5 ci-dessous) et
lance :

```bash
node --env-file=.env.local scripts/fetch-and-merge-playlists.mjs
npm run dev
```

## Déploiement

Le site est déployé automatiquement sur GitHub Pages : à chaque push sur `main`, tous les jours à
6h UTC (pour capter les changements faits côté Spotify sans commit), ou manuellement via le bouton
"Rafraîchir le site maintenant" de l'admin. Le workflow (`.github/workflows/deploy.yml`) régénère
`public/data/playlists.json` avant de builder.

Le domaine personnalisé est configuré via [`public/CNAME`](public/CNAME).

## Configuration à faire une fois (côté propriétaire du site)

1. **GitHub Pages** — Settings → Pages : source **GitHub Actions**, custom domain `vlfmusic.fr`.
2. **DNS** chez le registrar :
   - `A` (apex `vlfmusic.fr`) vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     (ou `ALIAS`/`ANAME` vers `vvllfc.github.io` si supporté).
   - `CNAME` pour `www.vlfmusic.fr` vers `vvllfc.github.io` (optionnel).
   - Une fois propagé, cocher **Enforce HTTPS** dans Settings → Pages.
3. **App Spotify** (developer.spotify.com/dashboard, gratuit) :
   - Redirect URI à enregistrer exactement : `https://vlfmusic.fr/`.
   - Copier le **Client ID** dans [`src/config.ts`](src/config.ts) (`SPOTIFY_CLIENT_ID`) — ce n'est
     pas un secret. Le Client Secret ne sert plus du tout dans ce projet (voir "Sécurité").
4. **Token admin GitHub** — créer un PAT *fine-grained* (github.com/settings/tokens?type=beta),
   scopé uniquement à ce repo, permissions **Contents: Read and write** + **Actions: Read and
   write**, avec une expiration. Le coller dans `#/admin`, section "Descriptions & tags du site"
   (stocké uniquement dans le navigateur).
5. **Refresh token Spotify pour le build** — une fois le site déployé (ou en local via `npm run
   dev`), ouvrir `#/admin`, section "Configuration CI", cliquer **Connecter Spotify (lecture seule,
   pour CI)**, autoriser l'accès, puis **Copier le refresh token**. Ajouter ce token comme secret
   GitHub Actions `SPOTIFY_REFRESH_TOKEN`, avec `SPOTIFY_CLIENT_ID` (Settings → Secrets and
   variables → Actions). Sans ça, le build utilise les données d'exemple à la place de tes vraies
   playlists.

## Sécurité

- Spotify a désactivé l'accès en "Client Credentials" (app-only, sans connexion) à la liste des
  playlists d'un compte — même publiques. Le fetch au build doit donc s'authentifier avec un vrai
  token utilisateur, mais celui-ci est obtenu via une connexion **dédiée, en lecture seule**
  (scope `playlist-read-private` uniquement, bouton "Configuration CI" dans l'admin) : le secret
  GitHub Actions qui en résulte ne peut donc rien modifier sur le compte Spotify, seulement lire la
  liste de playlists.
- L'édition directe des playlists (nom/description, bouton "Connecter Spotify" du haut) utilise une
  connexion **séparée**, avec les scopes d'écriture — stockée uniquement dans le navigateur de la
  personne qui se connecte, jamais dans un secret CI. Un token capable de modifier le compte ne peut
  exister que si quelqu'un s'y connecte avec les identifiants Spotify réels du compte.
- Les écritures sur le repo (`#/admin`) passent par un token GitHub que seul le propriétaire (ou un
  collaborateur autorisé) peut générer avec accès en écriture à ce repo précis.
- `#/admin` n'est jamais lié depuis la navigation publique — accessible seulement en tapant l'URL.

## Taxonomie de genres

[`data/genre-taxonomy.json`](data/genre-taxonomy.json) mappe des motifs dans les noms de playlists
(ex. `Feel The Vibe ChillFort`, `Techno Nappe AfterVNR Voice`) vers des tags suggérés (genre,
tempo, sous-genre, présence de voix), utilisés pour pré-remplir les tags dans l'admin. Seules les
familles "Feel The Vibe"/Rock et Techno sont couvertes pour l'instant — le reste (D&B, Jazzy Soul,
Raggameff, Rap Game FR, "Old School"...) se rajoute au fil de l'eau en éditant ce fichier.
