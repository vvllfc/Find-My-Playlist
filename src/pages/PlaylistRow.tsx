import { displayNameAtDepth, formatListeningTime, type CatalogPlaylist } from '../lib/catalog'
import { useAuth } from '../lib/authStore'
import { toggleFavorite, useUserLibrary } from '../lib/userLibrary'

interface PlaylistRowProps {
  playlist: CatalogPlaylist
  /** Position in the list as shown, not in the catalogue — it is only a label. */
  index: number
  /** How many folder levels the listing already names, so the row can drop them. */
  depth: number
  /** Tags the surrounding folder already says, which the row leaves out. */
  impliedTags: ReadonlySet<string>
  activeTags: ReadonlySet<string>
  onToggleTag: (tag: string) => void
}

// One row of the tracklist, lifted out of CatalogPage so the catalogue and the
// favourites page render the same thing — and so the stacking rule below only
// has to be got right once.
export default function PlaylistRow({
  playlist,
  index,
  depth,
  impliedTags,
  activeTags,
  onToggleTag,
}: PlaylistRowProps) {
  const listeningTime = formatListeningTime(playlist.totalDurationMs)
  const { status } = useAuth()
  const { favoriteIds } = useUserLibrary()
  const saved = favoriteIds.has(playlist.id)

  return (
    // A div rather than the link itself: the tags below the name are buttons
    // now, and a button can't sit inside an anchor. The name's link is
    // stretched back over the whole row in CSS, so clicking anywhere still
    // opens Spotify — except on a tag, which sits above it and filters instead.
    <div className={playlist.favorite ? 'row favorite' : 'row'}>
      {playlist.favorite && (
        <span className="row-heart" role="img" aria-label="Coup de cœur">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          </svg>
        </span>
      )}
      <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="row-main">
        {/* Cut back by how deep the folder actually is: its own words say
            nothing new, but a sub-genre that never became a folder still tells
            them apart. A search or a catalog-wide tag filter spans everything,
            so there the full name is what's meaningful. */}
        <p className="name">
          <a href={playlist.externalUrl} target="_blank" rel="noreferrer" className="row-link">
            {displayNameAtDepth(playlist, depth)}
          </a>
        </p>
        {playlist.description && <p className="desc">{playlist.description}</p>}
        <span className="row-tags">
          {playlist.tags
            .filter((tag) => !impliedTags.has(tag))
            .map((tag) => {
              const selected = activeTags.has(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  className={selected ? 'chip matched' : 'chip'}
                  aria-pressed={selected}
                  aria-label={`${selected ? 'Retirer le filtre' : 'Filtrer par'} ${tag}`}
                  onClick={() => onToggleTag(tag)}
                >
                  {tag}
                </button>
              )
            })}
        </span>
      </span>
      <span className="row-meta">
        {listeningTime && <span className="row-duration">{listeningTime}</span>}
        <span className="row-count">{playlist.trackCount} titres</span>
        {/* Inside row-meta rather than as a fourth grid column: .row collapses
            to two columns under 480px, and a new column would mean keeping two
            breakpoints in step forever. */}
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
            {/* One shape either way; only the fill says whether it is set, so
                the row does not change width when it is clicked. */}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M7 3h10a1 1 0 0 1 1 1v17l-6-3.5L6 21V4a1 1 0 0 1 1-1z"
                fill={saved ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      </span>
    </div>
  )
}
