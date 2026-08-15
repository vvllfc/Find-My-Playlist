import { useEffect, useRef, useState } from 'react'
import { Link } from '../lib/Link'
import { GLOSSARY_PATH } from '../lib/router'

// The site's only navigation outside the folder hierarchy, parked in the
// corner of the hero. Deliberately a menu rather than a row of links: there is
// one entry today and the corner shouldn't grow a new word every time another
// appears.
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
          <Link to={GLOSSARY_PATH} className="site-menu-item" role="menuitem">
            Glossaire
          </Link>
        </div>
      )}
    </div>
  )
}
