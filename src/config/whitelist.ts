// Server-side whitelist of privileged emails. This is the authoritative source.
// The client mirrors these in src/constants/*.js for UX (routing, labels) but
// all role decisions are enforced here on the server.

export const ADMIN_ALLOWED_EMAILS = [
    'admin@test.com',
];

export const OWNER_ALLOWED_EMAILS = [
    'bhuvanannappa@gmail.com',
];

export const isAdminEmail = (email?: string): boolean =>
    !!email && ADMIN_ALLOWED_EMAILS.includes(email.toLowerCase().trim());

export const isOwnerEmail = (email?: string): boolean =>
    !!email && OWNER_ALLOWED_EMAILS.includes(email.toLowerCase().trim());
