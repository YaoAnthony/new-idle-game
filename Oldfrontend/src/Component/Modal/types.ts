/**
 * ==============   Types   ================
 */
export interface Dialog {
    isOpen: boolean
    open: () => void
    close: () => void
    ref: React.RefObject<HTMLDialogElement | null>
}