-- ===========================================================================
-- Un nom affiché ne peut appartenir qu'à une personne.
--
-- Depuis 0002 les noms s'affichent à côté des votes de qui les rend publics.
-- Sans cette contrainte, n'importe qui peut reprendre le nom d'un autre et
-- apparaître à sa place dans les listes de votants.
--
-- Ce que ça n'arrête PAS, et il vaut mieux le savoir : les caractères qui se
-- ressemblent sans être les mêmes — un « а » cyrillique dans « Valentin » passe
-- ici sans difficulté. Défendre contre ça demanderait une normalisation Unicode
-- autrement plus lourde, pour un site où le cas réaliste est quelqu'un qui
-- retape le même nom à la main.
-- ===========================================================================

-- Un index unique plutôt qu'une contrainte : c'est le seul moyen de comparer
-- une *expression* plutôt que la colonne brute.
--
-- lower() pour que Valentin, valentin et VALENTIN soient un seul nom.
-- btrim() et regexp_replace() pour que les espaces ne servent pas à fabriquer
-- des sosies : « Val  entin » et « Val entin » se ramènent au même.
--
-- Partiel, parce que les profils sans nom sont la majorité et doivent pouvoir
-- coexister — un index unique ordinaire tolère plusieurs NULL, mais autant que
-- l'index ne porte pas des lignes qu'il n'a aucune raison de surveiller.
create unique index profiles_display_name_unique
  on public.profiles (lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')))
  where display_name is not null;

-- Note pour une reprise : si deux profils portent déjà le même nom, la création
-- de l'index échoue en le disant. C'est le bon comportement — il faut trancher
-- lequel garde le nom, pas laisser l'ambiguïté s'installer en silence.
