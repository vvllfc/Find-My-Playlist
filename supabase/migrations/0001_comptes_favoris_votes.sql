-- ===========================================================================
-- Comptes, favoris et votes.
--
-- Le site est statique et le catalogue est un artefact de build
-- (public/data/catalog.json) : aucune playlist n'existe en base. Les deux
-- tables ci-dessous ne stockent donc qu'un identifiant Spotify en texte libre,
-- sans clé étrangère possible vers quoi que ce soit. Le CHECK sur le format
-- est ce qui remplace cette contrainte manquante.
--
-- Aucune table "profiles" : rien de ce que fait le site n'a besoin d'un nom ou
-- d'un avatar. La seule donnée personnelle du projet reste l'e-mail dans
-- auth.users, géré par Supabase — le schéma public n'en contient aucune.
--
-- Ce fichier est la totalité du modèle de sécurité. Il vit ici plutôt que
-- seulement dans la console web pour pouvoir être relu et comparé dans git.
-- ===========================================================================


-- --- Favoris (strictement privés) ------------------------------------------

create table public.favorites (
  -- Rempli par la base plutôt que par le client : la requête n'a même pas
  -- besoin d'envoyer un user_id, et le WITH CHECK plus bas rejette de toute
  -- façon celui de quelqu'un d'autre.
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  playlist_id text        not null,
  created_at  timestamptz not null default now(),

  -- Un favori par personne et par playlist, garanti par la base et non par
  -- l'application : impossible à contourner depuis le navigateur.
  primary key (user_id, playlist_id),

  -- Un identifiant Spotify fait 22 caractères base62. Sans ça, une personne
  -- connectée pourrait écrire des clés d'un mégaoctet et remplir les 500 Mo
  -- du plan gratuit à elle seule.
  constraint favorites_playlist_id_format
    check (playlist_id ~ '^[A-Za-z0-9]{22}$')
);

-- Pas d'index supplémentaire : la clé primaire commence par user_id, donc
-- « mes favoris » est déjà une lecture d'index sur sa première colonne.


-- --- Votes (privés à la ligne près, publics à l'agrégat) --------------------

create table public.upvotes (
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  playlist_id text        not null,
  created_at  timestamptz not null default now(),

  primary key (user_id, playlist_id),

  constraint upvotes_playlist_id_format
    check (playlist_id ~ '^[A-Za-z0-9]{22}$')
);

-- La clé primaire indexe user_id en premier ; le compte public regroupe par
-- playlist_id, dans l'autre sens. Cet index-là est ce qui permet à la vue
-- plus bas de rester un parcours d'index seul plutôt qu'un parcours de table.
create index upvotes_playlist_id_idx on public.upvotes (playlist_id);


-- --- Plafond par personne --------------------------------------------------

-- La contrainte de format borne la taille d'une ligne, pas leur nombre : il
-- reste 62^22 identifiants valides à inventer. Ce plafond borne le nombre.
-- Déclaré SECURITY INVOKER volontairement : le compte s'exécute donc sous RLS,
-- ne voit que les lignes de la personne connectée, et c'est exactement le
-- compte qu'on veut.
create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing bigint;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into existing using new.user_id;
  if existing >= 2000 then
    raise exception 'Trop d''entrées pour ce compte' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger favorites_row_cap before insert on public.favorites
  for each row execute function public.enforce_row_cap();
create trigger upvotes_row_cap before insert on public.upvotes
  for each row execute function public.enforce_row_cap();


-- --- Le compteur public ----------------------------------------------------

-- Le seul objet que les visiteurs non connectés peuvent lire. Il n'expose que
-- le total : anon n'a aucun droit sur public.upvotes lui-même, donc la
-- question « qui a voté » n'a littéralement pas de chemin pour être posée.
--
-- security_invoker = false (le défaut, écrit ici pour qu'on ne se le demande
-- pas) : l'accès à la table sous-jacente est vérifié au nom du propriétaire de
-- la vue, qui est aussi le propriétaire de la table, et un propriétaire de
-- table est exempt de sa propre RLS tant que FORCE ROW LEVEL SECURITY n'est
-- pas posé. D'où la règle à ne jamais enfreindre plus bas : ne pas FORCER la
-- RLS sur upvotes, sinon ce compteur retombe à zéro pour tout le monde.
--
-- Une playlist sans aucun vote n'apparaît pas : le client lit une clé absente
-- comme un zéro, ce qui garde la réponse proportionnelle à l'activité réelle
-- plutôt qu'à la taille du catalogue.
create view public.playlist_upvote_counts
with (security_invoker = false)
as
  select playlist_id, count(*)::int as upvotes
  from public.upvotes
  group by playlist_id;

comment on view public.playlist_upvote_counts is
  'Compteur public de votes. Seule voie de lecture pour anon ; volontairement '
  'security_invoker = false pour agréger toutes les lignes sans donner à '
  'personne le droit d''en lire une seule.';


-- ===========================================================================
-- RLS. C'est ici, et nulle part ailleurs, que se joue la sécurité : la clé
-- anon est publique par conception et voyage dans le bundle JavaScript.
-- ===========================================================================

alter table public.favorites enable row level security;
alter table public.upvotes   enable row level security;

-- NE JAMAIS ajouter « force row level security » ici : la vue
-- playlist_upvote_counts compte au nom du propriétaire de la table, et FORCE
-- lui appliquerait la RLS à lui aussi.


-- --- Droits de table -------------------------------------------------------

-- Supabase accorde ALL à anon et authenticated par défaut sur le schéma
-- public. On reprend tout avant de rendre le strict nécessaire, pour ne pas
-- dépendre uniquement des politiques : anon ne reçoit rien du tout sur les
-- deux tables, donc il n'y a même pas de SELECT à filtrer ni de politique à
-- oublier d'écrire.
revoke all on public.favorites from anon, authenticated;
revoke all on public.upvotes   from anon, authenticated;

grant select, insert, delete on public.favorites to authenticated;
grant select, insert, delete on public.upvotes   to authenticated;

-- Pas d'UPDATE, ni en droit ni en politique. Une ligne de vote est un fait
-- daté : on la crée ou on la supprime, on ne la réécrit pas. C'est aussi ce
-- qui rend created_at infalsifiable.

revoke all   on public.playlist_upvote_counts from public;
grant select on public.playlist_upvote_counts to anon, authenticated;


-- --- favorites -------------------------------------------------------------

-- auth.uid() est enveloppé dans un sous-select pour que Postgres l'évalue une
-- fois par requête (initPlan) au lieu d'une fois par ligne — l'idiome
-- recommandé par Supabase, et la différence se voit dès quelques milliers de
-- lignes.
create policy favorites_select_own on public.favorites
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using ((select auth.uid()) = user_id);


-- --- upvotes ---------------------------------------------------------------

-- Lire ses propres votes sert à une seule chose : savoir si le bouton doit
-- être allumé. Personne ne peut lire ceux de quelqu'un d'autre, y compris le
-- propriétaire du site depuis le navigateur.
create policy upvotes_select_own on public.upvotes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy upvotes_insert_own on public.upvotes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy upvotes_delete_own on public.upvotes
  for delete to authenticated
  using ((select auth.uid()) = user_id);
