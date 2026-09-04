import { useMemo, useState } from 'react'
import { Link } from '../lib/Link'
import { formatListeningTime, type CatalogPlaylist } from '../lib/catalog'
import { useCatalog } from '../lib/useCatalog'
import { familiesFor, VOCALS_TAG, type TagFamily } from '../lib/tagFamilies'
import SiteMenu from './SiteMenu'

// The other way through the catalogue: instead of remembering a name, you say
// what you want and watch what is left.
//
// It exists because of what the names are. Four hundred and eighty-five
// playlists whose names are combinations of the same two dozen words —
// "Techno Acide Before Voice" — are not four hundred and eighty-five things to
// recognise, they are one grid of choices. The folder hierarchy walks that
// grid one axis at a time; this page shows every axis at once.
//
// Sub-genres come from the playlists' own subcategory rather than from the
// folder tree. The tree only opens a sub-folder for a genre big enough to need
// one, which is the right rule for navigation and the wrong one here: Jazzy
// Soul has no sub-folders and still has summers and winters worth asking for.

/** Above this many results, listing them says less than the count does. */
const LIST_LIMIT = 12

interface Choice {
  label: string
  count: number
  selected: boolean
  /** Nothing left under it, and not the thing currently chosen: shown, but
   *  inert. Removing it instead would make the rail jump about as you narrow. */
  exhausted: boolean
  toggle: () => void
}

function Rail({ label, choices }: { label: string; choices: Choice[] }) {
  return (
    <div className="rail">
      <p className="rail-label">{label}</p>
      {choices.length === 0 ? (
        <p className="rail-empty">rien sous cette sélection</p>
      ) : (
        // Scrolls sideways on a phone rather than wrapping: twenty genres over
        // four lines push everything that matters off the screen.
        <div className="rail-track">
          <div className="rail-chips">
            {choices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                className={['pick', choice.selected ? 'on' : '', choice.exhausted ? 'off' : ''].filter(Boolean).join(' ')}
                aria-pressed={choice.selected}
                disabled={choice.exhausted}
                onClick={choice.toggle}
              >
                {choice.label}
                <span className="pick-count">{choice.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SelectorPage() {
  const { catalog, error } = useCatalog()
  const [genre, setGenre] = useState<string | null>(null)
  const [sub, setSub] = useState<string | null>(null)
  const [vocals, setVocals] = useState<boolean | null>(null)
  /** One chosen tag per family at most: "chill AND energetic" is not a thing
   *  anyone means, and a single answer per question keeps the counts honest. */
  const [picked, setPicked] = useState<Record<string, string | null>>({})

  // Memoised: an empty literal per render would rebuild every rail below it
  // on every keystroke of state.
  const playlists = useMemo(() => catalog?.playlists ?? [], [catalog])

  // Only the tags that are genuinely free. A tag repeating the genre or the
  // sub-genre a playlist already sits in asks a question the rails above have
  // asked already.
  const freeTagsOf = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const playlist of playlists) {
      map.set(
        playlist.id,
        playlist.tags.filter(
          (tag) => tag !== playlist.category && tag !== playlist.subcategory && tag !== VOCALS_TAG,
        ),
      )
    }
    return map
  }, [playlists])

  const families: TagFamily[] = useMemo(
    () => familiesFor(playlists.flatMap((playlist) => freeTagsOf.get(playlist.id) ?? [])),
    [playlists, freeTagsOf],
  )

  // `skip` names the rail being counted, which is then left out of the test —
  // so a chip's number is what you would actually get by adding it, rather
  // than the count it already has under itself.
  const matches = useMemo(
    () =>
      (playlist: CatalogPlaylist, skip: string | null): boolean => {
        if (skip !== 'genre' && genre && playlist.category !== genre) return false
        if (skip !== 'sub' && sub && playlist.subcategory !== sub) return false
        if (skip !== 'vocals' && vocals !== null && playlist.tags.includes(VOCALS_TAG) !== vocals) return false
        const free = freeTagsOf.get(playlist.id) ?? []
        for (const [family, tag] of Object.entries(picked)) {
          if (!tag || skip === family) continue
          if (!free.includes(tag)) return false
        }
        return true
      },
    [genre, sub, vocals, picked, freeTagsOf],
  )

  const hits = useMemo(() => playlists.filter((p) => matches(p, null)), [playlists, matches])

  function choice(label: string, count: number, selected: boolean, toggle: () => void): Choice {
    return { label, count, selected, exhausted: count === 0 && !selected, toggle }
  }

  const genres = useMemo(() => {
    const pool = playlists.filter((p) => matches(p, 'genre'))
    const names = [...new Set(playlists.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort((a, b) =>
      a.localeCompare(b, 'fr'),
    )
    return names.map((name) =>
      choice(name, pool.filter((p) => p.category === name).length, genre === name, () => {
        // The sub-genres on offer belong to the genre being left behind.
        setSub(null)
        setGenre(genre === name ? null : name)
      }),
    )
  }, [playlists, matches, genre])

  const subs = useMemo(() => {
    if (!genre) return []
    const pool = playlists.filter((p) => matches(p, 'sub'))
    const names = [
      ...new Set(
        playlists.filter((p) => p.category === genre && p.subcategory).map((p) => p.subcategory as string),
      ),
    ].sort((a, b) => a.localeCompare(b, 'fr'))
    return names.map((name) =>
      choice(name, pool.filter((p) => p.subcategory === name).length, sub === name, () =>
        setSub(sub === name ? null : name),
      ),
    )
  }, [playlists, matches, genre, sub])

  const voices = useMemo(() => {
    const pool = playlists.filter((p) => matches(p, 'vocals'))
    return [true, false].map((wanted) =>
      choice(
        wanted ? 'Avec voix' : 'Sans voix',
        pool.filter((p) => p.tags.includes(VOCALS_TAG) === wanted).length,
        vocals === wanted,
        () => setVocals(vocals === wanted ? null : wanted),
      ),
    )
  }, [playlists, matches, vocals])

  // What each family offers is scoped to where you are — the genre and the
  // sub-genre — and not to the whole catalogue. That is the whole trick: forty
  // free tags never reach the screen at once, because a folder only ever has a
  // handful of them. Scoping to the genre alone was worse: picking "French
  // Vibe" left ten dead language chips beside the one that meant anything.
  const familyRails = useMemo(() => {
    const scope = playlists.filter(
      (p) => (!genre || p.category === genre) && (!sub || p.subcategory === sub),
    )
    return families.map((family) => {
      const offered = family.tags.filter((tag) =>
        scope.some((p) => (freeTagsOf.get(p.id) ?? []).includes(tag)),
      )
      const pool = playlists.filter((p) => matches(p, family.name))
      return {
        name: family.name,
        choices: offered.map((tag) =>
          choice(
            tag,
            pool.filter((p) => (freeTagsOf.get(p.id) ?? []).includes(tag)).length,
            picked[family.name] === tag,
            () =>
              setPicked((prev) => ({
                ...prev,
                [family.name]: prev[family.name] === tag ? null : tag,
              })),
          ),
        ),
      }
    })
  }, [playlists, families, freeTagsOf, matches, genre, sub, picked])

  const totalMs = hits.reduce((sum, p) => sum + p.totalDurationMs, 0)
  const listening = formatListeningTime(totalMs)
  const nothingChosen = !genre && !sub && vocals === null && Object.values(picked).every((tag) => !tag)

  function clearAll() {
    setGenre(null)
    setSub(null)
    setVocals(null)
    setPicked({})
  }

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <SiteMenu />
          <p className="kicker">
            <Link to="/" className="kicker-link">
              VLF Music
            </Link>
          </p>
          <h1>Décris ce que tu cherches</h1>
          <p>
            Pas de nom à retenir&nbsp;: tu poses le genre, le moment, la voix — et il ne reste que ce qui colle.
          </p>
        </div>
      </div>

      <main className="catalog">
        <Link to="/" className="back-link">
          <span className="back-arrow" aria-hidden="true">
            ←
          </span>
          Retour au catalogue
        </Link>

        {error && <p className="catalog-error">Impossible de charger les playlists pour le moment.</p>}
        {!error && !catalog && <p className="catalog-loading">Chargement des playlists…</p>}

        {catalog && (
          <>
            {/* One panel rather than rails loose on the page: over the
                oil-slick they dissolved into it. The rule inside separates
                where you are — genre, sous-genre — from what you want of it. */}
            <div className="selector">
              <div className="rail-group">
                <Rail label="Genre" choices={genres} />
                <Rail label="Sous-genre" choices={subs} />
              </div>
              <div className="selector-rule" />
              <div className="rail-group">
                <Rail label="Voix" choices={voices} />
                {familyRails.map((rail) => (
                  <Rail key={rail.name} label={rail.name} choices={rail.choices} />
                ))}
              </div>
            </div>

            <div className="tally">
              <p className="tally-count">
                <strong>{hits.length}</strong>
                <span>{hits.length > 1 ? 'playlists' : 'playlist'}</span>
                {listening && <span className="tally-time">{listening} d’écoute</span>}
              </p>
              {!nothingChosen && (
                <button type="button" className="tally-clear" onClick={clearAll}>
                  Tout effacer
                </button>
              )}
            </div>

            {hits.length === 0 && <p className="catalog-empty">Rien avec cette combinaison. Enlève un critère.</p>}
            {hits.length > LIST_LIMIT && (
              <p className="catalog-empty">Encore trop large pour lister — pose un critère de plus.</p>
            )}
            {hits.length > 0 && hits.length <= LIST_LIMIT && (
              <div className="tracklist">
                {hits.map((playlist, index) => (
                  <a
                    key={playlist.id}
                    className="row row-plain"
                    href={playlist.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="row-main">
                      <p className="name">{playlist.name}</p>
                      <p className="row-path">
                        {playlist.category}
                        {playlist.subcategory ? ` / ${playlist.subcategory}` : ''}
                      </p>
                    </span>
                    <span className="row-meta">
                      {formatListeningTime(playlist.totalDurationMs) && (
                        <span className="row-duration">{formatListeningTime(playlist.totalDurationMs)}</span>
                      )}
                      <span className="row-count">{playlist.trackCount} titres</span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
