/**
 * Token payload for a user.
 */
export type AuthToken = {
    accessToken: string;
    expiresAt: number;
};

/**
 * Error type for the authentication process.
 */
export type AuthError = {
    status: number;
    error: {
        message: string;
    };
};

