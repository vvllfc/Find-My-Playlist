# Find My Playlist

Site du projet Find My Playlist, servi sur [vlfmusic.fr](https://vlfmusic.fr) via GitHub Pages.

Catalogue public des playlists Spotify publiques (recherche + tags), et page privée `#/admin`
pour éditer les descriptions/tags et modifier directement le nom/description sur Spotify.

## Stack

- [Vite](https://vite.dev) + React + TypeScript
- Récupération des playlists publiques au build (GitHub Actions) via l'API Spotify (Client Credentials)
- Admin (`#/admin`) : édition des tags/descriptions du site via l'API GitHub (Contents), édition
  directe nom/description Spotify via OAuth (Authorization Code + PKCE)

## Développement

```bash
npm install
npm run dev
```

Sans les variables Spotify (`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`/`SPOTIFY_USER_ID`),
`npm run fetch:playlists` utilise automatiquement `data/sample-spotify-fixture.json` — pratique
pour développer sans credentials réels. Pour tester avec de vraies données en local, crée un
`.env.local` (gitignored) avec ces trois variables et lance :

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
     pas un secret, seul le Client Secret l'est.
   - Trouver son user ID Spotify (profil → Partager → Copier le lien → segment après `/user/`).
4. **Secrets GitHub Actions** (Settings → Secrets and variables → Actions) :
   `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_USER_ID`.
5. **Token admin** — créer un PAT *fine-grained* (github.com/settings/tokens?type=beta), scopé
   uniquement à ce repo, permissions **Contents: Read and write** + **Actions: Read and write**,
   avec une expiration. Le coller une fois dans `#/admin` (stocké uniquement dans le navigateur).

## Sécurité

- Le fetch public (build) n'utilise que le flow *Client Credentials* de Spotify : lecture seule,
  incapable d'écrire quoi que ce soit sur un compte Spotify.
- L'édition directe des playlists Spotify (`#/admin`) passe par le vrai écran de connexion Spotify
  (`accounts.spotify.com`) — un token capable de modifier le compte ne peut exister que si quelqu'un
  s'y connecte avec les identifiants réels du compte.
- Les écritures sur le repo (`#/admin`) passent par un token GitHub que seul le propriétaire (ou un
  collaborateur autorisé) peut générer avec accès en écriture à ce repo précis.
- `#/admin` n'est jamais lié depuis la navigation publique — accessible seulement en tapant l'URL.

## Taxonomie de genres

[`data/genre-taxonomy.json`](data/genre-taxonomy.json) mappe des motifs dans les noms de playlists
(ex. `Feel The Vibe ChillFort`, `Techno Nappe AfterVNR Voice`) vers des tags suggérés (genre,
tempo, sous-genre, présence de voix), utilisés pour pré-remplir les tags dans l'admin. Seules les
familles "Feel The Vibe"/Rock et Techno sont couvertes pour l'instant — le reste (D&B, Jazzy Soul,
Raggameff, Rap Game FR, "Old School"...) se rajoute au fil de l'eau en éditant ce fichier.
