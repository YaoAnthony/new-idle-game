// Redux/Features/themeSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit"

const getInitialTheme = (): "dark" | "light" => {
  localStorage.setItem("theme", "dark")
  return "dark"
}

interface ThemeState {
  mode: "dark" | "light"
}

const initialState: ThemeState = {
  mode: getInitialTheme(),
}

export const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<"dark" | "light">) => {
      state.mode = action.payload
      localStorage.setItem("theme", action.payload)
    },
    toggleTheme: (state) => {
      state.mode = "dark"
      localStorage.setItem("theme", "dark")
    },
  },
})

export const { setTheme, toggleTheme } = themeSlice.actions
export default themeSlice.reducer
