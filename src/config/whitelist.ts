// Server-side owner whitelist. This is the authoritative source; the client
// mirrors it only for immediate routing and all permissions are enforced here.

export const OWNER_ALLOWED_EMAILS: string[] = [
    'owner.test@gmail.com',
];

export const isOwnerEmail = (email?: string): boolean =>
    !!email && OWNER_ALLOWED_EMAILS.includes(email.toLowerCase().trim());
