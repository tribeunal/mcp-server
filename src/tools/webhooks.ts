import { z } from 'zod';

import { webhookUuid } from './uuid.js';

/**
 * The complete catalog the backend accepts. It is spelled out rather than left
 * as a free string so a typo is refused here, with the valid names in the error,
 * instead of arriving as an opaque 400 invalid_events.
 */
export const WEBHOOK_EVENTS = [
  'case.opened',
  'case.closed',
  'vote.cast',
  'vote.revoked',
  'comment.created',
  'evidence.marked',
  'evidence.unmarked',
  'jury.joined',
  'ping',
] as const;

// The URL is checked again server-side (and once more at delivery): it must be an
// absolute https URL that does not resolve to a private, loopback, link-local or
// CGNAT address, and must not carry credentials. Checking the scheme here turns
// the most common mistake into an immediate, readable failure.
export const CreateWebhookSchema = z.object({
  url: z
    .string()
    .url()
    .startsWith('https://', 'Webhook URLs must be absolute https URLs.')
    .max(2048)
    .describe('HTTPS URL that will receive the signed POST requests'),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1)
    .describe(`Events to subscribe to. One or more of: ${WEBHOOK_EVENTS.join(', ')}`),
});

export const ListWebhooksSchema = z.object({});

export const DeleteWebhookSchema = z.object({
  webhookId: webhookUuid('Webhook endpoint UUID to delete (from tribeunal_create_webhook or tribeunal_list_webhooks)'),
});
