// What the ninety-odd tags in the catalogue actually are, once you stop
// treating them as one flat vocabulary.
//
// Most of them are not free tags at all: twenty-one are genre names and a few
// dozen more are sub-genre names, and both already have a rail of their own on
// the selector — offering them again as tags would ask the same question
// twice. What is left is about forty genuinely free tags, and those fall into
// a handful of families: when did you want to play it, how hard, from which
// era, in which language, and what it sounds like.
//
// This is the only place that knowledge lives. Adding a tag to a family here
// is what moves it out of "Autres" on the selector; a tag in no family stays
// there, which makes that rail a to-do list rather than a dumping ground.
//
// Deliberately not derived from the taxonomy: the taxonomy says which words a
// playlist NAME may contain, which is a parsing question. This says what those
// words MEAN to someone looking for something, which is an editorial one, and
// the two drift apart on purpose.

export interface TagFamily {
  /** Shown as the rail's label, so it is written the way it should read. */
  name: string
  /** In the order they should be offered — chronological or by intensity
   *  where that exists, rather than alphabetical, because "Before, Middle,
   *  After" is the order a night actually happens in. */
  tags: string[]
}

export const TAG_FAMILIES: TagFamily[] = [
  {
    name: 'Moment',
    tags: ['Wake Up', 'Sunrise', 'Before', 'Middle', 'After', 'AfterVNR', 'AfterVNR160+', 'Sunset', 'GoodNight', 'Party'],
  },
  {
    name: 'Intensité',
    tags: ['chill', 'Chill Fort', 'Deep', 'energetic', 'energetic+'],
  },
  {
    name: 'Époque',
    tags: ['Very Old S', 'Old S', 'Old School', 'Like Before', 'Now', 'New School', 'New Gen'],
  },
  {
    name: 'Langue',
    tags: ['French', 'English', 'Spanish', 'Italian', 'Portuguese', 'German', 'Swedish', 'Russian', 'Arabic', 'African', 'Netherlands'],
  },
  {
    // What it sounds like rather than when you play it. "Instru" belongs here
    // and not with the voice question: it says there are instruments in the
    // music, not that there is no singing.
    name: 'Couleur',
    tags: ['Elec', 'Lectro', 'Melo', 'Mélo', 'Nappe', 'Rock', 'Emo', 'Grime', 'Instru'],
  },
]

/** The rail everything unclassified falls into, named here so the page and
 *  this file cannot disagree about it. */
export const UNSORTED_FAMILY = 'Autres'

/** Marks vocals, and asked as its own two-way question rather than as a tag —
 *  so it never reaches a family rail. */
export const VOCALS_TAG = 'vocals'

const CLASSIFIED = new Set(TAG_FAMILIES.flatMap((family) => family.tags))

/**
 * Every family, plus a computed "Autres" holding whatever `tags` contains that
 * no family claims. Computed rather than listed so a tag invented tomorrow
 * shows up somewhere visible instead of silently vanishing from the selector.
 */
export function familiesFor(tags: Iterable<string>): TagFamily[] {
  const unsorted = [...new Set(tags)].filter((tag) => !CLASSIFIED.has(tag) && tag !== VOCALS_TAG).sort()
  return unsorted.length > 0 ? [...TAG_FAMILIES, { name: UNSORTED_FAMILY, tags: unsorted }] : TAG_FAMILIES
}
