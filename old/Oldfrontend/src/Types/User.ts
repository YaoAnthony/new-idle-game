// types/User.ts
export interface User {
    _id: string;
    username: string;
    isVerified: boolean;
    email: string;
    subscription: subscription;
    image_url: string;

    profile: string;
}

export interface subscription {
    level: 'free' | 'individual' | 'enterprise';
    subscribedAt: Date | null; 
    expiryDate: Date | null;
    renewalPeriod: 'monthly' | 'yearly' | null;
}

import { Profile } from "./Profile";

export interface PopulatedUser extends Omit<User, 'profile'> {
    profile: Profile;
}
