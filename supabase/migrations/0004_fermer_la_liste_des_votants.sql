-- ===========================================================================
-- Refermer la fenêtre publique sur qui a voté.
--
-- 0002 a ouvert `playlist_public_voters` à `anon` pour un panneau, sous la
-- ligne d'une playlist, qui montrait les noms de ceux ayant coché « rendre mes
-- votes publics ». Ce panneau a été retiré de l'interface le 04/09/2026 : il
-- était mal dessiné, et l'interrupteur qui permettait de s'y soustraire est
-- parti avec lui.
--
-- Le laisser accessible serait la pire des situations. La clé `anon` est
-- publique par conception — elle est dans le bundle JavaScript — donc
-- n'importe qui pouvait continuer à lire cette vue par une simple requête
-- HTTP, y compris le `user_id` que le panneau lui-même n'affichait jamais.
-- Pendant ce temps plus personne ne pouvait se retirer, faute d'interrupteur,
-- et la page de confidentialité affirme que le lien entre une personne et un
-- vote n'est lisible par personne d'autre. Une promesse que la base doit tenir,
-- pas seulement l'interface.
--
-- Vérifié avant d'écrire ceci : la vue répondait bel et bien 200 à la clé
-- anonyme, avec des lignes réelles.
-- ===========================================================================

-- La vue n'est pas supprimée, seulement refermée : sa définition est ce qui
-- coûte à écrire, et la rouvrir le jour où le panneau sera correctement dessiné
-- tient dans un `grant`. En attendant, `votes_public` reste stocké tel quel sur
-- les profils — la valeur est simplement sans effet, ce qui est exactement ce
-- qu'on veut d'un réglage dont l'écran a disparu.
revoke select on public.playlist_public_voters from anon, authenticated;

comment on view public.playlist_public_voters is
  'Fermée depuis 0004 : aucun rôle ne peut la lire. Rouvrir avec un grant le '
  'jour où un panneau des votants revient dans l''interface, et remettre en '
  'même temps l''interrupteur de la page « Mon compte » — sans lui, personne '
  'ne peut se retirer de cette liste.';

-- Contrôle après exécution. Doit répondre 401/403 plutôt qu'un tableau :
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     'https://<ref>.supabase.co/rest/v1/playlist_public_voters?select=*' \
--     -H "apikey: <clé anon>" -H "Authorization: Bearer <clé anon>"
--
-- Le compteur public, lui, doit continuer à répondre 200 : il passe par
-- `playlist_upvote_counts`, qui n'est pas touchée ici.
