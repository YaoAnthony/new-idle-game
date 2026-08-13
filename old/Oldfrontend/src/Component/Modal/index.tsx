"use client"

import { CloseOutlined } from "@ant-design/icons"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef } from "react"

// utils
import { useClickOutside } from "./hook"

import { dialogInitialState, dialogOpenState } from "./motion"

import { colors } from "../../style"


interface ModalProps {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
    title?: string,
    hasCloseButton?: boolean
}
/**
 * This example shows how to use the `motion.dialog`
 * component.
 */

export default function Modal({ isOpen, onClose, children, title, hasCloseButton = true }: ModalProps) {

    const ref = useRef<HTMLDialogElement>(null)

    /**
     * Use the dialog element's imperative API to open and close the dialog
     * when the component mounts and unmounts. This enables exit animations
     * and maintains the dialog's natural accessibility behaviour.
     */
    useEffect(() => {
        if (!ref.current) return
        
        const dialogRef = ref.current;
        if (!dialogRef.open) {
            dialogRef.showModal();
            console.log("dialogRef", dialogRef);
        }

        return () => dialogRef.close();
    }, [ref])

    useClickOutside(ref, onClose)

    return (
        <AnimatePresence>
            {isOpen && <>
                <motion.div
                    className={`${colors.text.primary} fixed inset-0 z-[9999999] backdrop-blur-sm`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                ></motion.div>
                <div className="fixed inset-0 z-[10000000] flex items-center justify-center">
                    <motion.dialog
                        initial={dialogInitialState}
                        animate={dialogOpenState}
                        exit={dialogInitialState}
                        ref={ref}
                        className={`relative z-[10000000] min-w-[300px] rounded-[10px] border ${colors.bg.auth}`}
                        style={{
                            borderColor: "var(--border)",
                            transformPerspective: 500,
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        open 
                        /**
                         * The onCancel event is triggered when the user
                         * presses the Esc key. We prevent the default and
                         * close the dialog via the provided callback that
                         * first sets React state to false.
                         *
                         * AnimatePresence will take care of our exit animation
                         * before actually closing the dialog.
                         */
                        onCancel={(event) => {
                            event.preventDefault()
                            onClose();
                        }}
                        /**
                         * However, if the Esc key is pressed twice, the
                         * close method will always fire, and it isn't cancellable.
                         * So we listen for this and make sure the React
                         * state is updated to false.
                         */
                        onClose={onClose}
                    >
                        {title && <h2 className="title">{title}</h2>}
                        <div className=" text-white">
                            {children}
                        </div>

                        <button
                            className={`absolute top-4 right-4 text-white cursor-pointer border-none text-xl ${hasCloseButton ? "" : "hidden"}`}
                            aria-label="Close"
                            onClick={onClose}
                        >
                            <CloseOutlined />
                        </button>
                        <StyleSheet />
                    </motion.dialog>
                </div>
            </>
            }
        </AnimatePresence>
    )
}


/**
 * ==============   Styles   ================
 */
function StyleSheet() {
    return (
        <style>{`
        .openButton, .controls button {
            background-color: #ff0088;
            color: #f5f5f5;
            font-size: 16px;
            padding: 10px 20px;
            border-radius: 10px;
        }

        .controls {
            border-top: 1px solid var(--divider);
            padding-top: 20px;
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .controls button.cancel {
            background-color: var(--divider);
        }

        .modal {
            border-radius: 10px;
            border: 1px solid var(--border);
            background-color: var(--layer);
            position: relative;
            z-index: 10000000;
            padding: 20px;
            min-width: 300px;
        }

        .modal p {
            margin: 0;
        }

        .modal::backdrop {
            display: none;
        }

        .title {
            font-size: 24px;
            margin: 0 0 20px;
        }

        .closeButton {
            position: absolute;
            top: 20px;
            right: 20px;
        }

        .overlay {
            background: rgba(0, 0, 0, 0.5);
            position: fixed;
            inset: 0;
            z-index: 9999999;
            backdrop-filter: blur(3px);
        }
    `}</style>
    )
}
