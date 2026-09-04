# Find My Playlist

Site du projet Find My Playlist, servi sur [vlfmusic.fr](https://vlfmusic.fr) via GitHub Pages.

Catalogue public des playlists Spotify publiques (recherche + tags), et deux pages privées :
`#/admin` pour éditer les tags du site, `#/modify` pour éditer nom/description directement sur
Spotify (publiques ou privées) — la description affichée sur le site suit automatiquement celle de
Spotify, il n'y a qu'un seul texte à maintenir.

## Stack

- [Vite](https://vite.dev) + React + TypeScript
- Récupération des playlists publiques au build (GitHub Actions) via l'API Spotify, authentifiée
  avec un refresh token (Spotify n'autorise plus le flow app-only "Client Credentials" pour lister
  les playlists d'un compte, même publiques — voir "Sécurité" ci-dessous). Le nom et la description
  affichés sur le site sont ceux de Spotify tels quels ; seuls les tags sont une donnée du site,
  éditée à la main.
- `#/admin` : édition des tags du site via l'API GitHub (Contents), déclenchement du redéploiement,
  connexion CI (lecture seule) pour le fetch au build
- `#/modify` : édition directe nom/description sur Spotify via OAuth (Authorization Code + PKCE),
  habillée comme le catalogue public plutôt que dans le style sobre de l'admin. Une sauvegarde
  réussie sur une playlist publique déclenche aussi automatiquement un redéploiement du site (si un
  token GitHub est déjà enregistré sur `#/admin` dans ce navigateur).
- Les deux pages privées partagent le même écran de mot de passe optionnel
  ([`src/lib/adminGate.ts`](src/lib/adminGate.ts))

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
`public/data/catalog.json` avant de builder.

Les pages publiques utilisent de vraies URLs (`/genre/techno`, `/genre/feel/rock`). GitHub Pages
n'ayant pas de réécriture SPA, le build publie `dist/404.html` en copie de `index.html` (plugin
`spa-404-fallback` dans `vite.config.ts`) : un lien profond ouvert à froid reçoit cette copie et
l'app se route sur le chemin. Seule conséquence, invisible pour les visiteurs : ces pages sont
servies avec un statut HTTP 404. Les pages privées restent volontairement sur des routes en `#`,
qui ne sont jamais envoyées au serveur.

**Un simple push ne consomme aucun appel Spotify** — seuls le cron quotidien et le bouton
"Rafraîchir le site maintenant" appellent réellement l'API (`SKIP_LIVE_FETCH` dans le workflow, basé
sur `github.event_name`) ; un push de code réutilise juste la dernière liste de playlists mise en
cache. Cette dernière liste réussie (`data/last-successful-playlists.json`) sert aussi de filet de
sécurité si le fetch Spotify échoue (quota épuisé, secret expiré...) — les données d'exemple ne
servent que s'il n'y a jamais eu de fetch réussi. Les compteurs de titres sont mis en cache par
playlist avec leur `snapshot_id` (`data/track-counts-cache.json`) : un appel individuel n'est refait
que si le `snapshot_id` a changé depuis la dernière fois, donc seules les playlists réellement
modifiées coûtent du quota.

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
   write**, avec une expiration. Le coller dans `#/admin`, section "Tags du site" (stocké uniquement
   dans le navigateur — `#/modify` réutilise ce même token pour déclencher un redéploiement
   automatique après une sauvegarde publique, sans avoir à le recoller).
5. **Refresh token Spotify pour le build** — une fois le site déployé (ou en local via `npm run
   dev`), ouvrir `#/admin`, section "Configuration CI", cliquer **Connecter Spotify (lecture seule,
   pour CI)**, autoriser l'accès, puis **Copier le refresh token**. Ajouter ce token comme secret
   GitHub Actions `SPOTIFY_REFRESH_TOKEN`, avec `SPOTIFY_CLIENT_ID` (Settings → Secrets and
   variables → Actions). Sans ça, le build utilise les données d'exemple à la place de tes vraies
   playlists.

   ⏳ **Depuis le 20 juillet 2026, Spotify fait expirer les refresh tokens au bout de 6 mois** à
   partir de la connexion initiale (pas rallongé par les rafraîchissements de token d'accès). À
   refaire tous les ~6 mois : reconnexion sur `#/admin` → "Configuration CI" → remettre à jour le
   secret `SPOTIFY_REFRESH_TOKEN`. Idem pour la connexion d'édition sur `#/modify` (pas de secret à
   changer, juste se reconnecter sur place). Si le token expire sans être renouvelé, le build ne
   casse pas : il retombe sur la dernière liste de playlists connue (voir "Déploiement").
6. **Mot de passe admin (optionnel)** — dissuade les visiteurs curieux qui tomberaient sur l'URL
   `#/admin` ou `#/modify` (voir "Sécurité" : ce n'est pas ce qui protège réellement tes données).
   Génère un hash avec `node scripts/hash-password.mjs "ton-mot-de-passe"` et colle le résultat dans
   [`src/config.ts`](src/config.ts) (`ADMIN_GATE_PASSWORD_HASH`). Laisser vide désactive l'écran sur
   les deux pages (même mot de passe, même verrou pour les deux).

7. **Projet Supabase** (supabase.com, plan gratuit) — c'est ce qui porte les comptes visiteurs, les
   favoris et les votes. GitHub Pages ne sert que des fichiers statiques et ne peut donc rien
   arbitrer : sans un service extérieur, n'importe qui pourrait voter mille fois depuis la console
   du navigateur.
   - Créer le projet, puis exécuter **dans l'ordre** les fichiers de
     [`supabase/migrations/`](supabase/migrations/) dans le SQL Editor. Ils ne sont pas
     ré-exécutables : relancer un fichier déjà passé échoue sur `already exists`, ce qui veut
     simplement dire qu'il est déjà en place.
   - Copier **Project URL** et la clé **anon** (Settings → API) dans
     [`src/config.ts`](src/config.ts). La clé anon est publique par conception — elle voyage dans le
     bundle comme le Client ID Spotify. Ce n'est pas elle qui protège quoi que ce soit (voir
     "Sécurité"). La clé **service_role** contourne toutes les règles et n'a rien à faire dans ce
     dépôt, sous aucune forme.
   - Reporter la même URL et la même clé anon dans l'étape *Keep the Supabase project awake* de
     [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : un projet gratuit se met en
     pause après une semaine sans activité base, et le site cesserait alors d'afficher les votes.
     Les visiteurs suffisent normalement à le tenir éveillé, cette étape est le plancher pour une
     semaine sans personne.
8. **Connexion Google** — deux consoles à accorder, et c'est l'étape où l'on se perd le plus, parce
   qu'il y a **deux URL de callback différentes à deux endroits différents** :

   | Étape | URL | Où la saisir |
   |---|---|---|
   | Google → Supabase | `https://<ref>.supabase.co/auth/v1/callback` | dans **Google Cloud** |
   | Supabase → le site | `https://vlfmusic.fr/connexion` | dans **Supabase** |

   - Google Cloud → *Google Auth Platform* : écran de consentement en **External**, scopes
     `openid`, `userinfo.email`, `userinfo.profile` et rien d'autre. Créer un client **Web
     application** ; *Authorized JavaScript origins* `https://vlfmusic.fr` et
     `http://localhost:5173` ; *Authorized redirect URIs* l'URL de callback Supabase ci-dessus.
   - ⚠️ **Publier l'application** (Audience → Publish app). Laissée en *Testing*, seuls les comptes
     listés à la main peuvent se connecter, cent au maximum. Les scopes demandés n'étant pas
     sensibles, la publication est immédiate et ne demande aucune vérification Google.
   - Le **Client Secret** Google se colle dans Supabase et **uniquement** là : c'est un vrai secret,
     utilisé côté serveur, que le navigateur ne voit jamais. Contrairement au Client ID Spotify, il
     ne va pas dans `src/config.ts`.
   - Supabase → Authentication : **Google activé, tous les autres fournisseurs désactivés**, Email
     compris — il n'y a volontairement aucun mot de passe dans ce projet.
   - Supabase → Authentication → ⚠️ **« Enable anonymous sign-ins » sur OFF**. Activé, bourrer les
     urnes coûterait une requête HTTP par vote au lieu d'un compte Google.
   - Supabase → Authentication → URL Configuration : Site URL `https://vlfmusic.fr`, Redirect URLs
     `https://vlfmusic.fr/connexion` **et** `http://localhost:5173/connexion`.

## Sécurité

- Spotify a désactivé l'accès en "Client Credentials" (app-only, sans connexion) à la liste des
  playlists d'un compte — même publiques. Le fetch au build doit donc s'authentifier avec un vrai
  token utilisateur, mais celui-ci est obtenu via une connexion **dédiée, en lecture seule**
  (scope `playlist-read-private` uniquement, section "Configuration CI" de `#/admin`) : le secret
  GitHub Actions qui en résulte ne peut donc rien modifier sur le compte Spotify, seulement lire la
  liste de playlists.
- L'édition directe des playlists (nom/description, `#/modify`) utilise une connexion **séparée**,
  avec les scopes d'écriture — stockée uniquement dans le navigateur de la personne qui se connecte,
  jamais dans un secret CI. Un token capable de modifier le compte ne peut exister que si quelqu'un
  s'y connecte avec les identifiants Spotify réels du compte.
  `#/modify` affiche deux blocs : les playlists **publiques** viennent du même
  `public/data/catalog.json` que le site public (iso par construction, aucun appel Spotify pour
  juste les lister) ; les playlists **privées** viennent d'un fetch Spotify mis en cache à part
  (`localStorage`), rafraîchi uniquement via le bouton "Rafraîchir la liste (privées)", jamais
  automatiquement. Cliquer sur une playlist publique va quand même chercher son nom/description
  Spotify à jour avant affichage — le JSON public n'est qu'un instantané pris au dernier build, il
  peut être légèrement périmé si la playlist a été modifiée sur Spotify depuis.
- Les écritures sur le repo (`#/admin`) passent par un token GitHub que seul le propriétaire (ou un
  collaborateur autorisé) peut générer avec accès en écriture à ce repo précis.
- `#/admin` n'est jamais lié depuis la navigation publique — accessible seulement en tapant l'URL.
- L'écran de mot de passe optionnel ([`src/lib/adminGate.ts`](src/lib/adminGate.ts)) n'est qu'un
  déterrent : le hash est présent dans le bundle public comme tout le reste d'un site statique. Il
  évite juste qu'un visiteur qui tombe sur l'URL ne se mette à explorer l'interface — la vraie
  protection reste le token GitHub et la connexion Spotify ci-dessus.

### Comptes visiteurs, favoris et votes

- **Aucun mot de passe n'existe nulle part.** La connexion passe uniquement par Google : rien à
  hacher, rien à faire fuiter, aucun formulaire de réinitialisation à attaquer, et aucun formulaire
  d'inscription sur le site à spammer — Google fait ce filtrage. C'est la raison du choix, pas un
  effet de bord.
- **La clé anon est publique et ne protège rien.** Ce qui protège les données est la Row Level
  Security, écrite dans [`supabase/migrations/`](supabase/migrations/) — donc relisible et
  comparable dans git plutôt que seulement dans une console web.
- **`anon` ne reçoit aucun droit de table** sur `favorites`, `upvotes` ni `profiles`. Pas seulement
  aucune politique de lecture : aucun `GRANT`. Un refus arrive donc en `42501`, avant même que la
  moindre policy soit consultée. Ce qui est public passe par des **vues**, qui ne peuvent rendre que
  les colonnes et les lignes qu'elles nomment — une policy mal écrite, elle, exposerait tout.
- **Un vote par personne et par playlist**, garanti par la clé primaire composite et non par
  l'interface : une requête forgée ne peut pas voter deux fois. Aucun `UPDATE` n'est accordé sur les
  votes ni les favoris — on insère ou on supprime, jamais on ne réécrit, ce qui rend aussi
  `created_at` infalsifiable.
- **Le compteur de votes est public ; qui a voté ne l'est pas**, sauf choix explicite de la personne
  sur sa page « Mon compte ». Le réglage est fermé par défaut : qui ne visite jamais cette page
  reste invisible pour toujours. Cocher rend visibles **tous** ses votes, passés compris ; décocher
  les cache tous aussitôt — c'est une jointure calculée à la lecture, il n'y a rien à
  re-synchroniser.
- ⚠️ **Ne jamais ajouter `force row level security` sur `public.upvotes`.** La vue des compteurs
  agrège au nom du propriétaire de la table, qui est exempt de sa propre RLS ; `FORCE` la lui
  appliquerait et tous les compteurs retomberaient à zéro.
- Le linter Supabase signale `security_definer_view` sur les deux vues publiques. C'est attendu :
  c'est exactement le mécanisme employé, et les `comment on view` le disent.
- **Suppression de compte** — `delete_own_account()` est en `SECURITY DEFINER` parce qu'elle touche
  le schéma `auth`, et sans danger parce que le seul identifiant qu'elle sait viser est
  `auth.uid()`, lu dans le jeton signé : elle ne peut supprimer que son appelant, quoi qu'on lui
  passe. Le `ON DELETE CASCADE` des trois tables emporte le reste. Sans elle, « supprimer mes
  données » aurait laissé l'e-mail en base.
- **Ce qui n'est pas couvert**, et qui est assumé : quelqu'un avec plusieurs comptes Google peut
  voter plusieurs fois, et l'unicité des pseudos ne se défend pas contre les caractères qui se
  ressemblent sans être les mêmes. Aller plus loin voudrait dire empreinte d'IP ou d'appareil, pire
  pour la vie privée que le problème résolu.

## Taxonomie de genres

[`data/genre-taxonomy.json`](data/genre-taxonomy.json) mappe des motifs dans les noms de playlists
(ex. `Feel The Vibe ChillFort`, `Techno Nappe AfterVNR Voice`) vers des tags suggérés (genre,
tempo, sous-genre, présence de voix), utilisés pour pré-remplir les tags dans l'admin. Seules les
familles "Feel The Vibe"/Rock et Techno sont couvertes pour l'instant — le reste (D&B, Jazzy Soul,
Raggameff, Rap Game FR, "Old School"...) se rajoute au fil de l'eau en éditant ce fichier.
