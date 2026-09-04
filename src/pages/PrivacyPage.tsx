import { Link } from '../lib/Link'
import { ACCOUNT_PATH } from '../lib/router'
import SiteMenu from './SiteMenu'
import './CatalogPage.css'

// A privacy notice owes its reader a way to reach whoever is responsible, so
// this address has to actually receive mail: one that bounces is worse than
// none, and Google may write to it while verifying the brand. A mailbox opened
// for the site rather than a personal one, since publishing it invites spam.
// Emptying it hides the block below rather than printing a dead link.
const CONTACT_EMAIL = 'vlfmusic.contact@gmail.com'

const LAST_UPDATED = '4 septembre 2026'

// Everything this site does with anyone's data, in the order a person actually
// wonders about it: what happens if I only look around, what changes if I sign
// in, who can see it, and how do I make it stop. Written in the same voice as
// the glossary — a notice nobody reads protects nobody.
export default function PrivacyPage() {
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
          <h1>Confidentialité</h1>
          <p>Ce que ce site sait de toi, qui peut le voir, et comment tout effacer.</p>
        </div>
      </div>

      <main className="catalog">
        <Link to="/" className="back-link">
          <span className="back-arrow" aria-hidden="true">
            ←
          </span>
          Retour au catalogue
        </Link>

        <section className="glossary-section">
          <h2>Sans compte</h2>
          <p className="glossary-intro">
            Tu peux parcourir tout le catalogue sans compte. Il n’y a sur ce site{' '}
            <strong>aucune mesure d’audience, aucun traceur, aucun cookie</strong> — pas de Google Analytics, pas de
            pixel, rien qui suive qui que ce soit d’une page à l’autre.
          </p>
          <p className="glossary-intro">
            Trois choses techniques méritent quand même d’être dites, parce qu’elles transmettent ton adresse IP à
            quelqu’un d’autre — comme le fait n’importe quelle page web :
          </p>
          <dl className="glossary-help">
            <div>
              <dt>Les polices de caractères</dt>
              <dd>
                Elles sont chargées depuis les serveurs de Google Fonts, qui voient donc ton adresse IP le temps du
                téléchargement.
              </dd>
            </div>
            <div>
              <dt>Le nombre de votes</dt>
              <dd>
                Il est lu sur une base de données hébergée par Supabase. La requête est anonyme et ne demande aucun
                compte ; rien n’y est enregistré à ton sujet.
              </dd>
            </div>
            <div>
              <dt>L’hébergement</dt>
              <dd>Le site est servi par GitHub Pages, qui journalise les accès comme tout serveur web.</dd>
            </div>
          </dl>
        </section>

        <section className="glossary-section">
          <h2>Avec un compte</h2>
          <p className="glossary-intro">
            La connexion passe uniquement par Google. <strong>Aucun mot de passe n’existe</strong> : il n’y en a aucun
            à inventer ici, aucun de stocké ici, et donc aucun à se faire voler. Il n’y a même pas de formulaire
            d’inscription.
          </p>
          <p className="glossary-intro">Voici tout ce qui est conservé, et rien d’autre :</p>
          <dl className="glossary-help">
            <div>
              <dt>Un identifiant de compte</dt>
              <dd>Un numéro, créé à la première connexion. C’est lui qui rattache tes favoris et tes votes à toi.</dd>
            </div>
            <div>
              <dt>Ton adresse e-mail</dt>
              <dd>
                Transmise par Google au moment de la connexion. Elle n’apparaît nulle part sur le site en dehors de
                ta propre page <Link to={ACCOUNT_PATH}>Mon compte</Link>, qui te la rappelle pour que tu saches sur
                quel compte tu es, et elle n’est montrée à <strong>aucun autre visiteur</strong>. Elle sert à
                reconnaître ton compte, et à rien d’autre.
              </dd>
            </div>
            <div>
              <dt>Un pseudo, si tu en choisis un</dt>
              <dd>Facultatif. Tu peux le changer ou le retirer quand tu veux.</dd>
            </div>
            <div>
              <dt>Tes favoris</dt>
              <dd>
                Les playlists que tu as mises de côté. Personne d’autre ne peut lire cette liste — c’est la base de
                données qui refuse la requête, pas seulement l’interface qui ne l’affiche pas.
              </dd>
            </div>
            <div>
              <dt>Tes votes</dt>
              <dd>Les playlists pour lesquelles tu as voté, et la date.</dd>
            </div>
          </dl>
          <p className="glossary-intro">
            Pas de nom, pas de photo, pas d’historique de navigation, aucune playlist importée depuis ton compte
            Spotify. Se connecter ici ne donne à ce site aucun accès à ton compte Spotify.
          </p>
        </section>

        <section className="glossary-section">
          <h2>Ce qui est public</h2>
          <p className="glossary-intro">
            Uniquement le <strong>nombre</strong> de votes affiché à côté d’une playlist. Le lien entre une personne et
            un vote n’est lisible par personne d’autre que cette personne. Là encore ce n’est pas une politesse
            d’affichage : c’est la base de données qui refuse la lecture, y compris à une requête fabriquée à la main.
          </p>
        </section>

        <section className="glossary-section">
          <h2>Effacer ton compte</h2>
          <p className="glossary-intro">
            Depuis <Link to={ACCOUNT_PATH}>Mon compte</Link>, un bouton supprime le compte et tout ce qu’il contient :
            favoris, votes, pseudo, et le compte lui-même. C’est immédiat, définitif, et rien n’est mis de côté. Les
            compteurs de votes baissent d’autant.
          </p>
          <p className="glossary-intro">
            Tant que tu ne le fais pas, tes données restent — c’est ce qui te permet de retrouver tes favoris à la
            prochaine visite. Il n’y a pas d’effacement automatique au bout d’un délai.
          </p>
        </section>

        <section className="glossary-section">
          <h2>Tes droits</h2>
          <p className="glossary-intro">
            Le règlement européen te donne le droit d’accéder à tes données, de les corriger, de les effacer, de les
            récupérer et de t’opposer à leur traitement. Sur ce site, la page <Link to={ACCOUNT_PATH}>Mon compte</Link>{' '}
            te permet de faire l’essentiel toi-même, tout de suite et sans avoir à le demander à qui que ce soit : voir
            ce qui est enregistré, changer ton pseudo, et tout supprimer.
          </p>
          {CONTACT_EMAIL && (
            <p className="glossary-intro">
              Pour le reste, ou pour toute question, écris à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          )}
        </section>

        <section className="glossary-section">
          <h2>À qui les données sont confiées</h2>
          <dl className="glossary-help">
            <div>
              <dt>Supabase</dt>
              <dd>Héberge la base de données et gère la connexion. C’est là que vivent les comptes.</dd>
            </div>
            <div>
              <dt>GitHub Pages</dt>
              <dd>Héberge le site lui-même, qui n’est qu’un ensemble de fichiers.</dd>
            </div>
            <div>
              <dt>Google</dt>
              <dd>Assure la connexion, et fournit les polices de caractères.</dd>
            </div>
            <div>
              <dt>Spotify</dt>
              <dd>
                Les playlists sont chez eux : ouvrir l’une d’elles t’y envoie, et c’est alors leur propre politique qui
                s’applique.
              </dd>
            </div>
          </dl>
        </section>

        <section className="glossary-section">
          <h2>Cookies</h2>
          <p className="glossary-intro">
            Ce site ne dépose <strong>aucun cookie</strong>. Une fois connecté, un jeton de session est rangé dans le
            stockage local de ton navigateur : c’est ce qui t’évite de te reconnecter à chaque visite. Il ne sert qu’à
            prouver à la base que c’est bien toi, et se déconnecter l’efface.
          </p>
          <p className="glossary-intro">C’est pour cette raison qu’il n’y a aucun bandeau à cliquer en arrivant.</p>
        </section>

        <p className="privacy-updated">Dernière mise à jour : {LAST_UPDATED}.</p>
      </main>
    </div>
  )
}
