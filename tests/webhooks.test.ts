import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { CreateWebhookSchema, DeleteWebhookSchema, WEBHOOK_EVENTS } from '../src/tools/webhooks.js';
import { type TribeunalAPIClient } from '../src/client/api-client.js';

/** Fake client recording whatever the dispatcher hands the API layer. */
function fakeClient(record: {
  createData?: { url: string; events: string[] };
  deletedId?: string;
  listResult?: Record<string, unknown>;
}): TribeunalAPIClient {
  return {
    createWebhook: async (data: { url: string; events: string[] }) => {
      record.createData = data;
      return {
        uuid: '01a03e2c-a314-7884-88d7-15faa67e2101',
        url: data.url,
        events: data.events,
        active: true,
        secret: 'cc41b148ee76b655032cf5cbd57653dfb027abe8a0960a65e21469c9d4e91b82',
      };
    },
    listWebhooks: async () =>
      record.listResult ?? {
        total: 1,
        items: [
          {
            uuid: '01a03e2c-a314-7884-88d7-15faa67e2101',
            url: 'https://example.com/hook',
            events: ['case.closed'],
            active: true,
            lastStatusCode: 200,
            failureCount: 0,
          },
        ],
      },
    deleteWebhook: async (webhookId: string) => {
      record.deletedId = webhookId;
      return null;
    },
  } as unknown as TribeunalAPIClient;
}

const validUrl = 'https://example.com/hooks/tribeunal';

// --- create round-trip -------------------------------------------------------

test('create_webhook forwards url and events, and shows the secret once', async () => {
  const record: Record<string, never> = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_create_webhook', {
    url: validUrl,
    events: ['case.closed', 'vote.cast'],
  });

  const sent = (record as { createData?: { url: string; events: string[] } }).createData;
  assert.equal(sent?.url, validUrl);
  assert.deepEqual(sent?.events, ['case.closed', 'vote.cast']);

  const text = result.content[0].text as string;
  assert.match(
    text,
    /not shown again/i,
    'the create output must warn that the secret is shown only once — an agent that scrolls past it cannot recover it without rotating',
  );
  assert.match(text, /cc41b148ee76b655032cf5cbd57653dfb027abe8a0960a65e21469c9d4e91b82/);
  assert.match(text, /X-Tribeunal-Signature/, 'the output should say how to verify a delivery');
});

test('create_webhook rejects a non-https URL before it reaches the API', async () => {
  assert.throws(() => CreateWebhookSchema.parse({ url: 'http://example.com/x', events: ['ping'] }));
  assert.throws(() => CreateWebhookSchema.parse({ url: 'not-a-url', events: ['ping'] }));
});

test('create_webhook rejects an unknown event name with the catalog in the error', async () => {
  assert.throws(() => CreateWebhookSchema.parse({ url: validUrl, events: ['bogus.event'] }));
  assert.throws(() => CreateWebhookSchema.parse({ url: validUrl, events: [] }));

  // Every catalogued name is accepted, so the enum cannot silently drift from
  // the backend's list.
  for (const event of WEBHOOK_EVENTS) {
    assert.doesNotThrow(() => CreateWebhookSchema.parse({ url: validUrl, events: [event] }));
  }
});

// --- list round-trip ---------------------------------------------------------

test('list_webhooks prints the endpoints it is given', async () => {
  const record: Record<string, never> = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_list_webhooks', {});
  const text = result.content[0].text as string;

  assert.match(text, /01a03e2c-a314-7884-88d7-15faa67e2101/);
  assert.match(text, /https:\/\/example\.com\/hook/);
  assert.doesNotMatch(text, /secret/i, 'the list surface must never carry a signing secret');
});

test('list_webhooks says so plainly when there are none', async () => {
  const record = { listResult: { total: 0, items: [] } };
  const result = await dispatchToolCall(
    fakeClient(record as never),
    'tribeunal_list_webhooks',
    {},
  );

  assert.match(result.content[0].text as string, /No webhook endpoints registered/i);
});

// --- delete round-trip -------------------------------------------------------

test('delete_webhook forwards the uuid and confirms the secret is gone', async () => {
  const record: Record<string, never> = {};
  const id = '01a03e2c-a314-7884-88d7-15faa67e2101';
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_delete_webhook', {
    webhookId: id,
  });

  assert.equal((record as { deletedId?: string }).deletedId, id);
  assert.match(result.content[0].text as string, /deleted/i);
});

test('delete_webhook rejects a non-uuid id instead of 404ing server-side', async () => {
  assert.throws(() => DeleteWebhookSchema.parse({ webhookId: '42' }));
  assert.throws(() => DeleteWebhookSchema.parse({ webhookId: 'my-webhook' }));
});

// --- catalog wiring ----------------------------------------------------------

test('all three webhook tools are advertised with input schemas', () => {
  for (const name of [
    'tribeunal_create_webhook',
    'tribeunal_list_webhooks',
    'tribeunal_delete_webhook',
  ]) {
    const def = TOOL_DEFINITIONS.find((t) => t.name === name);
    assert.ok(def, `${name} must be in TOOL_DEFINITIONS`);
    assert.equal(typeof def?.description, 'string');
    assert.equal(def?.inputSchema?.type, 'object');
  }

  const destructive = TOOL_DEFINITIONS.find((t) => t.name === 'tribeunal_delete_webhook');
  assert.equal(
    (destructive?.annotations as { destructiveHint?: boolean })?.destructiveHint,
    true,
    'deleting an endpoint destroys its secret irrecoverably and must be annotated destructive',
  );
});
