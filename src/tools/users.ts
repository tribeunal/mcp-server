import { z } from 'zod';

// User schema. userId accepts a UUID or a username (the backend resolves
// either), so no UUID pattern is enforced here — unlike case/tribe/webhook
// identifiers, which ARE uuid-only. Omitted, the tool looks up the caller's
// own account.
export const GetUserSchema = z.object({
  userId: z.string().min(1).optional()
    .describe('User UUID or username to look up — a username resolves too, so no UUID pattern is enforced. Omit entirely to get your own account (GET /users/me).'),
});
