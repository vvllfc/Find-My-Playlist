import { useMemo } from 'react'
import { useCatalog } from '../lib/useCatalog'
import { Link } from '../lib/Link'
import { listAllTags, type TagEntry } from '../lib/catalog'
import SiteMenu from './SiteMenu'
import './CatalogPage.css'

// How the site works, in the words of someone who already knows the answer —
// the questions the catalog itself can't answer by being looked at.
const NAVIGATION_HELP = [
  {
    title: 'Les dossiers',
    body: "Les playlists sont rangées par genre. Un genre assez fourni se divise en sous-dossiers, et parfois en sous-sous-dossiers quand les noms le disent d'eux-mêmes.",
  },
  {
    title: "L'ordre des playlists",
    body: 'Dans chaque dossier, elles sont rangées par tempo : toujours du plus chill au plus NRV.',
  },
  {
    title: 'Les tags',
    body: "Sous chaque playlist, les tags sont cliquables : un clic filtre la liste, un deuxième l'enlève. Leur sens est détaillé plus bas.",
  },
  {
    title: 'La recherche',
    body: "Elle cherche dans les noms et les descriptions, à travers tout le catalogue — pas seulement le dossier ouvert.",
  },
  {
    title: 'Au hasard',
    body: "« Surprends-moi » tire une playlist au hasard et l'affiche. « Playlist aléatoire », dans un dossier, en ouvre une directement dans Spotify.",
  },
  {
    title: 'Les coups de cœur',
    body: 'Une playlist encadrée de violet avec un cœur dans le coin est un coup de cœur.',
  },
  {
    title: 'Ouvrir une playlist',
    body: "Un clic n'importe où sur une ligne (sauf sur un tag) ouvre la playlist dans Spotify.",
  },
]

export default function GlossaryPage() {
  const { catalog, error } = useCatalog()
  const tags = useMemo(() => (catalog ? listAllTags(catalog) : []), [catalog])
  const genres = tags.filter((entry) => entry.isGenre)
  const refinements = tags.filter((entry) => !entry.isGenre)

  return (
    <div className="catalog-page">
      <div className="hero-zone">
        <div className="hero-inner">
          <SiteMenu />
          <p className="kicker">VLF Music</p>
          <h1>Glossaire</h1>
          <p>Comment le site est rangé, et ce que veut dire chaque tag.</p>
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
        {!error && !catalog && <p className="catalog-loading">Chargement…</p>}

        <section className="glossary-section">
          <h2>Se repérer</h2>
          <dl className="glossary-help">
            {NAVIGATION_HELP.map((item) => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>{item.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        {catalog && (
          <>
            <TagSection
              title="Les genres"
              intro="Les grandes familles — ce sont elles qui donnent les dossiers."
              entries={genres}
            />
            <TagSection
              title="Les autres tags"
              intro="Tempo, époque, présence de voix, sous-genres : ce qui distingue deux playlists d'un même dossier."
              entries={refinements}
            />
          </>
        )}
      </main>
    </div>
  )
}

function TagSection({ title, intro, entries }: { title: string; intro: string; entries: TagEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="glossary-section">
      <h2>
        {title} <span className="glossary-count">{entries.length}</span>
      </h2>
      <p className="glossary-intro">{intro}</p>
      <dl className="glossary-tags">
        {entries.map((entry) => (
          <div key={entry.tag}>
            <dt>
              <span className="chip">{entry.tag}</span>
              <span className="glossary-uses">
                {entry.count} playlist{entry.count > 1 ? 's' : ''}
              </span>
            </dt>
            {/* No placeholder where nothing is written yet — an empty row reads
                as a gap to fill, which is only true for whoever writes them. */}
            {entry.description && <dd>{entry.description}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}
