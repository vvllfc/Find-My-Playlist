import { Link } from '../lib/Link'
import { PRIVACY_PATH } from '../lib/router'

// One mark in the bottom-right corner of every public page. The privacy notice
// has to be reachable from anywhere — it is the page that says what having an
// account costs, and Google checks it answers — but it belongs to no part of
// the site in particular, and a band across the foot of the page announced it
// as a section. In the corner it is found when looked for and ignored
// otherwise, which is exactly the standing it should have.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link to={PRIVACY_PATH}>Confidentialité</Link>
    </footer>
  )
}
