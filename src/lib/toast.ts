export type ToastKind = 'info' | 'download' | 'check'
export interface ToastDetail {
  message: string
  kind?: ToastKind
  href?: string
}

/**
 * Fire-and-forget toast bus. Any component can call `toast(...)` without
 * threading context; the <Toaster/> mounted in App listens on the window.
 */
export function toast(message: string, opts: Omit<ToastDetail, 'message'> = {}): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>('td-toast', { detail: { message, ...opts } }))
}
