export type UserRole = 'owner' | 'member';

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
}
