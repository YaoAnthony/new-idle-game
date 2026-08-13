// hooks/useThemeSync.ts
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '../Redux/store'
import { setTheme } from '../Redux/Features/themeSlice'

export function useThemeSync() {
    const mode = useSelector((s: RootState) => s.theme.mode)
    const dispatch = useDispatch()

    useEffect(() => {
        document.documentElement.classList.add('dark')
        document.documentElement.style.colorScheme = 'dark'
        localStorage.setItem('theme', 'dark')

        if (mode !== 'dark') {
            dispatch(setTheme('dark'))
        }
    }, [dispatch, mode])
}
