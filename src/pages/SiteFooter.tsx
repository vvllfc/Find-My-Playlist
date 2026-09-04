import { Link } from '../lib/Link'
import { PRIVACY_PATH } from '../lib/router'

// One quiet line at the foot of every public page. The privacy notice has to be
// reachable from anywhere — it is the page that says what having an account
// costs, and Google checks it answers — but it belongs to no part of the site
// in particular, and giving it a place in the menu gave it a weight it does not
// have. Down here it is found when looked for and ignored otherwise, which is
// exactly the standing it should have.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link to={PRIVACY_PATH}>Confidentialité</Link>
    </footer>
  )
}
