import { AuthMethod } from '../types';

export const getAuthMethodFromToken = (token: string): AuthMethod => {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        const methods = Array.isArray(payload?.amr)
            ? payload.amr.map((entry: unknown) => (
                typeof entry === 'string'
                    ? entry
                    : typeof entry === 'object' && entry !== null && 'method' in entry
                        ? String((entry as { method: unknown }).method)
                        : ''
            ))
            : [];
        if (methods.includes('password')) return 'password';
        if (methods.some((method: string) => ['oauth', 'sso'].includes(method))) return 'oauth';
        if (methods.some((method: string) => ['otp', 'magiclink'].includes(method))) return 'otp';
        return 'unknown';
    } catch {
        return 'unknown';
    }
};

