import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const WIDTHS = { sm: 'max-w-md', md: 'max-w-lg' }

// A window on top of the page. Every window in the app is one of these, so they all
// behave the same way for people who use a keyboard or a screen reader:
//   * focus moves into the window when it opens, and back to where it was on closing
//   * Tab stays inside the window instead of wandering to the page behind it
//   * Escape, the × button, or a click outside closes it
//   * the page behind does not scroll while the window is open
export default function Modal({ label, onClose, size = 'md', children }) {
  const panel = useRef(null)

  // Keep the latest onClose without re-running the set-up below on every render.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const node = panel.current
    const opener = document.activeElement

    // Start on the first field. A window without fields gets the focus itself.
    const start = node.querySelector('input, select, textarea') ?? node
    start.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = [...node.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return event.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      const outside = !node.contains(document.activeElement) || document.activeElement === node

      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [])

  // Rendered at the end of <body>, so it sits above everything on the page.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm overflow-y-auto font-sans text-slate-800">
      <div
        className="min-h-full flex items-center justify-center p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={`bg-white rounded-3xl w-full ${WIDTHS[size]} p-6 sm:p-8 shadow-2xl relative outline-none animate-in fade-in zoom-in-95 duration-150`}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-5 w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 font-bold text-xl transition cursor-pointer"
          >
            &times;
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
