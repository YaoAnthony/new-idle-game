// store/userSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// type
import type { User } from "../../Types/User";
import { AuthToken } from "../../Types/Auth";

type AuthState = {
    isLoggedIn: boolean;
    user: User | null;
    accessToken: string | null;
    expiresAt: number | null;
};

const initialState: AuthState = {
    isLoggedIn: false,
    user: null,
    accessToken: null,
    expiresAt: null,
};

const userSlice = createSlice({
    name: "user",
    initialState,
    reducers: {
        setUser(state, action: PayloadAction<User>) {
            state.isLoggedIn = true;
            state.user = action.payload;
        },
        setToken(state, action: PayloadAction<AuthToken>) {
            state.accessToken = action.payload.accessToken;
            state.expiresAt = action.payload.expiresAt;
        },
        logout(state) {
            state.isLoggedIn = false;
            state.user = null;
            state.accessToken = null;
        },

    },
});

export const { setUser, setToken, logout } = userSlice.actions;
export default userSlice.reducer;
