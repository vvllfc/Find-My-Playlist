import { useCallback, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { navigate } from './router'

// A real <a href> — middle-click, copy-link and open-in-new-tab all keep
// working — that routes in place on a plain left click.
export function Link({
  to,
  className,
  children,
  ...rest
}: {
  to: string
  className?: string
  children: ReactNode
  // Folder tiles carry data-* attributes so the transition can find them.
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'className' | 'children'>) {
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      // Scrolling happens inside navigate(), so it lands with the page swap
      // rather than yanking the grid mid-animation.
      navigate(to)
    },
    [to],
  )

  return (
    <a href={to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  )
}
