export type UserRole = 'super_admin' | 'owner' | 'member';

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    gym_id?: string;
}
