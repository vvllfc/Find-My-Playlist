import { Fragment, useMemo } from 'react'
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
    title: 'Le compte',
    body: "Se connecter passe par Google, et rien d'autre. Il n'y a aucun mot de passe à créer ici : le site n'en voit jamais un et n'en garde aucune trace, donc il n'y a rien à perdre ni à faire fuiter. Un compte sert à garder des favoris et à voter — tout le reste du catalogue se consulte sans. La page « Mon compte » sert à choisir un pseudo, à décider si tes votes le portent en public, et à tout effacer si tu le souhaites.",
  },
  {
    title: 'Mes favoris',
    body: "Le signet au bout d'une ligne met une playlist de côté, et le menu les rassemble sur une page. À ne pas confondre avec le cœur violet, qui est un choix de la maison : les favoris sont personnels, et personne d'autre ne peut les voir — pas même moi.",
  },
  {
    title: 'Les votes',
    body: "La flèche au bout d'une ligne vote pour une playlist, un vote par personne et par playlist. Le total est visible de tout le monde, y compris sans compte, et cliquer dessus montre qui a voté — mais uniquement les gens qui l'ont demandé dans « Mon compte ». Par défaut un vote est anonyme, et il le reste tant que personne ne change ce réglage. « Les plus votées », au-dessus de la liste, range par ce total ; l'enlever rend l'ordre habituel, du plus chill au plus NRV.",
  },
  {
    title: 'Ouvrir une playlist',
    body: "Un clic n'importe où sur une ligne ouvre la playlist dans Spotify — sauf sur un tag, sur le signet ou sur la flèche de vote, qui font ce qu'ils disent.",
  },
]

// Single source for both the sections and the contents list above them, so the
// two can't drift apart as sections are added.
const SECTIONS = {
  help: {
    id: 'se-reperer',
    title: 'Se repérer',
    intro: 'Comment le catalogue est rangé, et à quoi sert chaque bouton.',
  },
  genres: {
    id: 'les-genres',
    title: 'Les genres',
    intro: 'Les grandes familles — ce sont elles qui donnent les dossiers.',
  },
  refinements: {
    id: 'les-tags',
    title: 'Les tags',
    intro: "Tempo, époque, présence de voix, sous-genres : ce qui distingue deux playlists d'un même dossier.",
  },
}

type Section = (typeof SECTIONS)[keyof typeof SECTIONS]

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
          <p className="kicker">
            <Link to="/" className="kicker-link">
              VLF Music
            </Link>
          </p>
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

        {/* Plain anchors: the browser's own jump, so they work from the
            keyboard and can be opened or copied like any other link. Only
            once the catalog is in, since two of the three targets are built
            from it and a link to nothing scrolls nowhere. */}
        {catalog && (
          <nav className="glossary-toc" aria-labelledby="sommaire">
            <p className="glossary-toc-title" id="sommaire">
              Sommaire
            </p>
            {Object.values(SECTIONS).map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
        )}

        <section className="glossary-section" id={SECTIONS.help.id}>
          <h2>{SECTIONS.help.title}</h2>
          <p className="glossary-intro">{SECTIONS.help.intro}</p>
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
            <TagSection section={SECTIONS.genres} entries={genres} />
            <TagSection section={SECTIONS.refinements} entries={refinements} />
          </>
        )}
      </main>
    </div>
  )
}

function TagSection({ section, entries }: { section: Section; entries: TagEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="glossary-section" id={section.id}>
      <h2>
        {section.title} <span className="glossary-count">{entries.length}</span>
      </h2>
      <p className="glossary-intro">{section.intro}</p>
      {/* Two columns rather than a stack: the tag on the left, what it means
          on the right, so a meaning can be found by running down one column
          instead of reading every entry. dt/dd are direct children of the grid
          so the pairs line up as rows. */}
      <dl className="glossary-tags">
        {entries.map((entry) => (
          <Fragment key={entry.tag}>
            <dt>
              <span className="chip">{entry.tag}</span>
            </dt>
            {/* Rendered even when empty, so the rows keep their alignment —
                and so a tag still waiting for a definition is visible as one. */}
            <dd>{entry.description}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  )
}
