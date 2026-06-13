import { motion, AnimatePresence } from 'framer-motion'

export default function ConfirmDialog({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel, danger = false }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="bg-white rounded-2xl shadow-cardHover p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading font-bold text-lg text-ink mb-2">{title}</h3>
            <p className="text-sm text-charcoal/80 mb-5">{message}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={onCancel}>{cancelText}</button>
              <button
                className={danger ? 'btn-accent' : 'btn-primary'}
                onClick={onConfirm}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
