# Find My Playlist

Site du projet Find My Playlist, servi sur [vlfmusic.fr](https://vlfmusic.fr) via GitHub Pages.

## Stack

- [Vite](https://vite.dev) + React + TypeScript

## Développement

```bash
npm install
npm run dev
```

## Déploiement

Le site est déployé automatiquement sur GitHub Pages à chaque push sur `main`
via le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Le domaine personnalisé est configuré via [`public/CNAME`](public/CNAME).

### Configuration GitHub à faire une fois (côté repo)

1. Dans **Settings → Pages**, source : **GitHub Actions**.
2. Toujours dans **Settings → Pages**, section *Custom domain* : renseigner `vlfmusic.fr`.
3. Chez le registrar du domaine, ajouter les enregistrements DNS suivants :
   - `A` (apex `vlfmusic.fr`) vers les IP de GitHub Pages :
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - ou `ALIAS`/`ANAME` vers `vvllfc.github.io` si le registrar le supporte.
   - `CNAME` pour `www.vlfmusic.fr` vers `vvllfc.github.io` (optionnel, pour le sous-domaine `www`).
4. Attendre la propagation DNS puis cocher **Enforce HTTPS** dans Settings → Pages.
