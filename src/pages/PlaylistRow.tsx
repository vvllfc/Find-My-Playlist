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
  const { favoriteIds, upvotedIds } = useUserLibrary()
  const { counts } = useUpvoteCounts()

  const saved = favoriteIds.has(playlist.id)
  const voted = upvotedIds.has(playlist.id)
  const votes = counts.get(playlist.id) ?? 0

  return (
    // A div rather than the link itself: the tags below the name are buttons
    // now, and a button can't sit inside an anchor. The name's link is
    // stretched back over the whole row in CSS, so clicking anywhere still
    // opens Spotify — except on a control, which sits above it.
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
      {/* A strip of its own across the top of the row rather than tucked in
          after the duration. At the end of the line it ran out of room on a
          phone and spilled past the edge, and sitting among the metadata it
          read as something to be read rather than pressed. Above the number,
          with the whole width of the row behind it, nothing can crowd it. */}
      <span className="row-actions">
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
          {/* A flame, where a triangle said nothing — it read as a play button
              on its side rather than as a vote. One shape either way: only the
              fill says whether the vote is cast, so the row never changes width
              when it is clicked. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
              fill={voted ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* Hidden at zero rather than showing a 0 on every row: an empty count
            is noise, and the flame alone already invites the first vote. Text
            and not a button — it used to open the list of people who had made
            their vote public, and that panel was pulled until it can be drawn
            properly. */}
        {votes > 0 && (
          <span className="row-votes" aria-label={`${votes} vote${votes > 1 ? 's' : ''}`}>
            {votes}
          </span>
        )}
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
          {/* One shape either way; only the fill says whether it is set, so the
              row does not change width when it is clicked. */}
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
      </span>
    </div>
  )
}
