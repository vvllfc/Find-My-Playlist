-- ===========================================================================
-- Profils, et la possibilité de rendre ses votes publics.
--
-- La migration 0001 posait que personne ne peut savoir qui a voté. Celle-ci
-- ouvre une porte — une seule, et seulement de l'intérieur : chacun décide
-- pour soi, et le défaut est fermé.
--
-- Ce qui ne change PAS : public.upvotes n'accorde toujours aucun droit à
-- personne d'autre qu'à son propriétaire. Les votants publics passent par une
-- vue, comme les compteurs, plutôt que par un droit de lecture sur la table
-- assorti d'une policy filtrante. La différence compte : une policy mal écrite
-- exposerait tout, alors qu'une vue ne peut rendre que les colonnes et les
-- lignes qu'elle nomme.
-- ===========================================================================


-- --- Profils ---------------------------------------------------------------

create table public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,

  -- Le seul nom qui puisse être publié. Nul tant que personne ne l'a écrit,
  -- et la vue plus bas exclut les profils sans nom : publier un UUID nu
  -- n'apprendrait rien à personne tout en révélant quand même un votant.
  display_name text,

  -- Le réglage entier tient ici, et il est fermé par défaut. Quelqu'un qui ne
  -- visite jamais la page « Mon compte » reste invisible pour toujours : ce
  -- sont des données personnelles publiées, ça se choisit, ça ne se subit pas.
  votes_public boolean     not null default false,

  updated_at   timestamptz not null default now(),

  -- Borne la taille comme le CHECK de format borne celle des identifiants en
  -- 0001 : sans elle, une personne connectée écrit un nom d'un mégaoctet.
  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 40)
);


-- --- La vue des votants publics --------------------------------------------

-- Ne rend que les votes dont l'auteur a explicitement demandé qu'ils soient
-- visibles, et seulement son nom. Cocher la case rend visibles TOUS ses votes,
-- passés compris ; la décocher les retire tous aussitôt — c'est une jointure
-- calculée à la lecture, il n'y a rien à re-synchroniser.
--
-- user_id sort d'ici volontairement : c'est ce qui permet de reconnaître la
-- même personne d'une playlist à l'autre, ce qui est précisément le sens de
-- « mes votes sont publics ». Le connaître ne donne aucun pouvoir — la RLS
-- compare auth.uid(), qui vient du jeton signé et de nulle part ailleurs.
create view public.playlist_public_voters
with (security_invoker = false)
as
  select u.playlist_id, u.user_id, p.display_name
  from public.upvotes u
  join public.profiles p on p.id = u.user_id
  where p.votes_public
    and p.display_name is not null;

comment on view public.playlist_public_voters is
  'Votants ayant choisi la visibilité publique. Seule voie de lecture vers '
  'l''identité d''un votant ; public.upvotes reste sans aucun droit accordé.';


-- --- Suppression de son propre compte --------------------------------------

-- Effacer ses lignes est faisable avec les policies ci-dessous, mais pas la
-- ligne auth.users elle-même — d'où cette fonction. SECURITY DEFINER parce
-- qu'elle touche le schéma auth, et sans danger parce que le seul identifiant
-- qu'elle sait viser est auth.uid(), lu dans le jeton signé : elle ne peut
-- supprimer que son appelant, quoi qu'on lui passe. Le ON DELETE CASCADE des
-- trois tables emporte le reste.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = (select auth.uid());
end;
$$;


-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.profiles enable row level security;

-- Comme en 0001 : on reprend tout, puis on rend le strict nécessaire. anon ne
-- reçoit rien sur profiles — la vue est sa seule fenêtre, et elle ne montre
-- que ce que les gens ont demandé à montrer.
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- UPDATE est accordé ici, contrairement à favorites et upvotes : un vote est
-- un fait daté qu'on crée ou qu'on retire, un profil est fait pour être
-- corrigé.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = id);

revoke all   on public.playlist_public_voters from public;
grant select on public.playlist_public_voters to anon, authenticated;

-- Personne d'autre qu'une personne connectée ne peut la déclencher, et elle
-- n'agit jamais que sur elle-même.
revoke execute on function public.delete_own_account() from public, anon;
grant  execute on function public.delete_own_account() to authenticated;
