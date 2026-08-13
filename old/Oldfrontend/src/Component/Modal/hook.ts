import { useEffect } from "react"

export function useClickOutside(
    ref: React.RefObject<HTMLDialogElement | null>,
    close: VoidFunction
) {
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && checkClickOutside(event, ref.current)) {
                close()
            }
        }

        // 修改此处监听事件类型为 "mousedown"
        document.addEventListener("mousedown", handleClickOutside as EventListener)

        return () => {
            document.removeEventListener("mousedown", handleClickOutside as EventListener)
        }
    }, [ref, close])
}

function checkClickOutside(event: MouseEvent, element: HTMLDialogElement) {
    const { top, left, width, height } = element.getBoundingClientRect()

    return (
        event.clientX < left ||
        event.clientX > left + width ||
        event.clientY < top ||
        event.clientY > top + height
    )
}
