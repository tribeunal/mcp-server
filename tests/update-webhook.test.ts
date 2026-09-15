import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { UpdateWebhookSchema } from '../src/tools/webhooks.js';
import { TribeunalAPIClient, type TribeunalAPIClient as TribeunalAPIClientType } from '../src/client/api-client.js';

const WEBHOOK_UUID = '01a03e2c-a314-7884-88d7-15faa67e2101';

function fakeClient(record: { updateArgs?: { webhookId: string; body: Record<string, unknown> } } = {}): TribeunalAPIClientType {
  return {
    updateWebhookDelivery: async (webhookId: string, body: Record<string, unknown>) => {
      record.updateArgs = { webhookId, body };
      return { uuid: webhookId, events: body.events ?? ['case.closed'], active: body.active ?? true };
    },
  } as unknown as TribeunalAPIClientType;
}

// --- request body ----------------------------------------------------------------

test('update_webhook forwards events only when events alone is given', async () => {
  const record: { updateArgs?: { webhookId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_webhook', {
    webhookId: WEBHOOK_UUID,
    events: ['case.closed', 'vote.cast'],
  });

  assert.equal(record.updateArgs?.webhookId, WEBHOOK_UUID);
  assert.deepEqual(record.updateArgs?.body, { events: ['case.closed', 'vote.cast'] });
});

test('update_webhook forwards active only when active alone is given', async () => {
  const record: { updateArgs?: { webhookId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_webhook', {
    webhookId: WEBHOOK_UUID,
    active: false,
  });

  assert.deepEqual(record.updateArgs?.body, { active: false });
});

test('update_webhook forwards events and active together', async () => {
  const record: { updateArgs?: { webhookId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_webhook', {
    webhookId: WEBHOOK_UUID,
    events: ['ping'],
    active: true,
  });

  assert.deepEqual(record.updateArgs?.body, { events: ['ping'], active: true });
});

test('update_webhook returns the updated endpoint as JSON', async () => {
  const result = await dispatchToolCall(fakeClient(), 'tribeunal_update_webhook', {
    webhookId: WEBHOOK_UUID,
    active: false,
  });
  const parsed = JSON.parse(result.content[0].text as string);
  assert.equal(parsed.uuid, WEBHOOK_UUID);
  assert.equal(parsed.active, false);
});

// --- zod rejections ----------------------------------------------------------------

test('update_webhook rejects a call with neither events nor active', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_webhook', { webhookId: WEBHOOK_UUID }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('update_webhook rejects an unknown event name', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_webhook', { webhookId: WEBHOOK_UUID, events: ['bogus.event'] }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('update_webhook rejects a non-UUID webhookId', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_webhook', { webhookId: '42', active: true }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('UpdateWebhookSchema requires a webhookId', () => {
  assert.throws(() => UpdateWebhookSchema.parse({ active: true } as never));
});

test('UpdateWebhookSchema rejects an empty events array', () => {
  assert.throws(() => UpdateWebhookSchema.parse({ webhookId: WEBHOOK_UUID, events: [] }));
});

// --- catalog wiring -----------------------------------------------------------

test('update_webhook is advertised as a non-destructive, idempotent write', () => {
  const def = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_update_webhook');
  assert.ok(def);
  const a = def!.annotations as { destructiveHint?: boolean; idempotentHint?: boolean; readOnlyHint?: boolean };
  assert.equal(a.readOnlyHint, false);
  assert.equal(a.destructiveHint, false);
  assert.equal(a.idempotentHint, true);
});

test('update_webhook says the URL and secret cannot be changed here', () => {
  const def = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_update_webhook');
  assert.match(def!.description, /url|secret/i);
  assert.match(def!.description, /create_webhook/);
});

// --- HTTP path/verb (client-level, observable) ----------------------------------

test('TribeunalAPIClient.updateWebhookDelivery PATCHes /webhooks/{uuid}/delivery', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string; body?: unknown } = {};
  (client as any).client.patch = async (path: string, body: unknown) => {
    record.path = path;
    record.body = body;
    return { data: { uuid: WEBHOOK_UUID } };
  };

  await client.updateWebhookDelivery(WEBHOOK_UUID, { active: false });

  assert.equal(record.path, `/webhooks/${WEBHOOK_UUID}/delivery`);
  assert.deepEqual(record.body, { active: false });
});
