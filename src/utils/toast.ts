import 'toastify-js/src/toastify.css'
import Toastify from 'toastify-js'

export type ToastType = 'info' | 'success' | 'error'

const themes: Record<ToastType, { background: string; color: string }> = {
  info: { background: 'rgba(16,16,20,0.92)', color: 'rgba(255,255,255,0.6)' },
  success: { background: 'rgba(52,211,153,0.12)', color: '#6ee7b7' },
  error: { background: 'rgba(248,113,113,0.12)', color: '#fca5a5' },
}

export function toast(message: string, type: ToastType = 'info') {
  const t = themes[type] ?? themes.info
  return Toastify({
    text: message,
    duration: 2200,
    gravity: 'top',
    position: 'center',
    stopOnFocus: true,
    style: {
      borderRadius: '16px',
      background: t.background,
      color: t.color,
      fontSize: '13px',
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '10px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(20px)',
    },
  }).showToast()
}
