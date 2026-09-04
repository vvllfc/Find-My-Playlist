import { useEffect, useRef, useState } from 'react'
import { Link } from '../lib/Link'
import { ACCOUNT_PATH, FAVORITES_PATH, GLOSSARY_PATH } from '../lib/router'

// The site's only navigation outside the folder hierarchy, parked in the corner
// of the hero. Deliberately a menu rather than a row of links: the corner
// shouldn't grow a new word every time a page appears.
export default function SiteMenu() {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Escape leaves focus where it started rather than adrift on the page.
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="site-menu" ref={container}>
      <button
        ref={trigger}
        type="button"
        className={open ? 'site-menu-button open' : 'site-menu-button'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        Menu
      </button>
      {open && (
        // Closing on the panel itself covers every way out of it: a link inside
        // is a click in here, and Link routes in place, so the panel would
        // otherwise stay open over the page it just navigated to.
        <div className="site-menu-panel" role="menu" onClick={() => setOpen(false)}>
          <Link to="/" className="site-menu-item" role="menuitem">
            Accueil
          </Link>
          {/* Both entries show whatever the state of the session, because the
              question a visitor is asking is the same either way, and because a
              menu that rearranged itself once the session loaded read as a
              glitch. It also means the menu never announces whether anyone is
              signed in, which is not its business to publish.

              They point straight at their own page even when nobody is signed
              in. Each of those pages turns a signed-out visitor away itself,
              and records where to come back to on the way — which is knowledge
              that belongs to the page, not to a list of links. */}
          <Link to={ACCOUNT_PATH} className="site-menu-item" role="menuitem">
            Mon compte
          </Link>
          <Link to={FAVORITES_PATH} className="site-menu-item" role="menuitem">
            Mes favoris
          </Link>
          {/* Last: a reference one goes looking for, not somewhere to go.
              The privacy notice used to sit below it and was moved to the foot
              of the page, where it carries the weight it actually has. */}
          <Link to={GLOSSARY_PATH} className="site-menu-item" role="menuitem">
            Glossaire
          </Link>
        </div>
      )}
    </div>
  )
}
