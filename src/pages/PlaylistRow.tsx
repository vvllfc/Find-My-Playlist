import { displayNameAtDepth, formatListeningTime, type CatalogPlaylist } from '../lib/catalog'
import { useAuth } from '../lib/authStore'
import { toggleFavorite, toggleUpvote, useUserLibrary } from '../lib/userLibrary'
import { useUpvoteCounts } from '../lib/upvoteCounts'

interface PlaylistRowProps {
  playlist: CatalogPlaylist
  /** Position in the list as shown, not in the catalogue — it is only a label. */
  index: number
  /** How many folder levels the listing already names, so the row can drop them. */
  depth: number
}

// A heart, outlined until it is kept. The same shape either way — only the
// fill changes — so the row never shifts when it is clicked.
const HEART =
  'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z'

// The flame, drawn with a second shorter tongue on the left. The valley
// between the two is what makes it read as fire rather than as a droplet —
// the icon-set flame it replaces closed an inner loop on itself and turned to
// mush at the 21px it is actually shown at.
const FLAME =
  'M13.2 2.6C14.4 6.6 17.6 9.6 17.6 14A5.6 5.6 0 0 1 6.4 14C6.4 11.4 6.6 9 7.4 7.2C8 8.8 8.8 10.2 9.8 11C10.4 8.2 11.4 5.2 13.2 2.6Z'

// The owner's own pick, and a fuller heart than the visitor's: it is a mark
// stuck on the row rather than a control sitting in it.
const CURATED_HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

// Fill comes from CSS (--icon-fill) rather than an attribute, because it has
// three states — outlined at rest, translucent under the pointer, solid once
// set — and only the middle one has no markup to hang off.
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// One row of the tracklist, lifted out of CatalogPage so the catalogue and the
// favourites page render the same thing — and so the stacking rule below only
// has to be got right once.
export default function PlaylistRow({ playlist, index, depth }: PlaylistRowProps) {
  const listeningTime = formatListeningTime(playlist.totalDurationMs)
  const { status } = useAuth()
  const { favoriteIds, upvotedIds } = useUserLibrary()
  const { counts } = useUpvoteCounts()

  const saved = favoriteIds.has(playlist.id)
  const voted = upvotedIds.has(playlist.id)
  const votes = counts.get(playlist.id) ?? 0

  return (
    // A div rather than the link itself: the controls sit above a link that is
    // stretched over the whole row, and a button can't live inside an anchor.
    <div className={playlist.favorite ? 'row favorite' : 'row'}>
      {playlist.favorite && (
        <span className="row-heart" role="img" aria-label="Coup de cœur">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d={CURATED_HEART} />
          </svg>
        </span>
      )}
      <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="row-main">
        {/* Cut back by how deep the folder actually is: its own words say
            nothing new, but a sub-genre that never became a folder still tells
            them apart. A search or a catalog-wide tag filter spans everything,
            so there the full name is what's meaningful.

            The tags that used to sit under it are gone: they were the name
            split into words, printed a second time in another typeface, and
            filtering is done by the strip above the list. */}
        <p className="name">
          <a href={playlist.externalUrl} target="_blank" rel="noreferrer" className="row-link">
            {displayNameAtDepth(playlist, depth)}
          </a>
        </p>
        {playlist.description && <p className="desc">{playlist.description}</p>}
      </span>
      <span className="row-meta">
        {listeningTime && <span className="row-duration">{listeningTime}</span>}
        <span className="row-count">{playlist.trackCount} titres</span>
      </span>
      {/* A column of their own at the end of the row, the same width on every
          row: that is what makes them line up down the list instead of
          drifting against metadata whose width changes with the number. They
          used to hang off the top-left corner, where nothing lined up with
          anything.

          It is each button that rises above the stretched link, never this
          box: giving the box a z-index would lift the count with it, and the
          number is not a control. */}
      <span className="row-actions">
        <button
          type="button"
          className={saved ? 'row-fav saved' : 'row-fav'}
          aria-pressed={saved}
          aria-label={
            status !== 'signed-in'
              ? 'Se connecter pour ajouter à mes favoris'
              : saved
                ? 'Retirer de mes favoris'
                : 'Ajouter à mes favoris'
          }
          onClick={() => void toggleFavorite(playlist.id)}
        >
          <Icon path={HEART} />
        </button>
        <button
          type="button"
          className={voted ? 'row-vote voted' : 'row-vote'}
          aria-pressed={voted}
          aria-label={
            status !== 'signed-in'
              ? 'Se connecter pour voter'
              : voted
                ? 'Retirer mon vote'
                : 'Voter pour cette playlist'
          }
          onClick={() => void toggleUpvote(playlist.id)}
        >
          <Icon path={FLAME} />
        </button>
        {/* Keeps its slot at zero rather than appearing with the first vote,
            which would shove the flame sideways under the reader's eye. Text
            and not a button: it used to open the list of people who had made
            their vote public, and that panel was pulled until it can be drawn
            properly. */}
        <span className="row-votes" aria-label={votes > 0 ? `${votes} vote${votes > 1 ? 's' : ''}` : undefined}>
          {votes > 0 ? votes : ''}
        </span>
      </span>
    </div>
  )
}
