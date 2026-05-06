import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { X } from 'lucide-react'

/**
 * Reusable Modal — handles:
 * ✅ Click outside to close
 * ✅ ESC key to close
 * ✅ Body scroll lock
 * ✅ Bottom sheet on mobile, centered on desktop
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth,
  position,
}) {
  const overlayRef = useRef(null)

  // ESC key handler
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  // Click outside = click on overlay background
  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  function handleOverlayKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target === overlayRef.current) onClose()
    }
  }

  const positionClass = position === 'bottom'
    ? 'items-end sm:items-center'
    : 'items-center'

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      tabIndex="0"
      className={`fixed inset-0 z-50 bg-black/70 flex ${positionClass} justify-center p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`bg-slate-900 border border-slate-800 rounded-2xl w-full ${maxWidth} max-h-[92vh] overflow-y-auto`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
            <h2 className="text-base font-bold text-slate-100">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

Modal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
  maxWidth: PropTypes.string,
  position: PropTypes.oneOf(['bottom', 'center']),
}

Modal.defaultProps = {
  title: undefined,
  children: null,
  maxWidth: 'max-w-sm',
  position: 'bottom',
}
