export type UserRole = 'owner' | 'member';
export type AuthMethod = 'password' | 'oauth' | 'otp' | 'unknown';

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    authMethod: AuthMethod;
}
