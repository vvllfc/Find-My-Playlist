import { useCallback, type MouseEvent, type ReactNode } from 'react'
import { navigate } from './router'

// A real <a href> — middle-click, copy-link and open-in-new-tab all keep
// working — that routes in place on a plain left click.
export function Link({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(to)
      window.scrollTo(0, 0)
    },
    [to],
  )

  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  )
}
