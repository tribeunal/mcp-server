import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { UpdateTribeSchema, DeleteTribeSchema, RemoveTribeMemberSchema } from '../src/tools/tribes.js';
import { TribeunalAPIClient, type TribeunalAPIClient as TribeunalAPIClientType } from '../src/client/api-client.js';

const TRIBE_UUID = '1f185d65-4764-614a-8052-1da3f306fec7';

/** Fake client recording whatever the dispatcher hands the API layer. */
function fakeClient(record: {
  updateArgs?: { tribeId: string; body: Record<string, unknown> };
  deletedId?: string;
  removeArgs?: { tribeId: string; username: string };
} = {}): TribeunalAPIClientType {
  return {
    updateTribe: async (tribeId: string, body: Record<string, unknown>) => {
      record.updateArgs = { tribeId, body };
      return { uuid: tribeId, name: body.name ?? 'Deep Sea Welders', type: body.type ?? 1 };
    },
    deleteTribe: async (tribeId: string) => {
      record.deletedId = tribeId;
      return null;
    },
    removeTribeMember: async (tribeId: string, username: string) => {
      record.removeArgs = { tribeId, username };
      return { removed: true, tribe: { uuid: tribeId }, user: { uuid: 'user-uuid', username } };
    },
  } as unknown as TribeunalAPIClientType;
}

// --- update_tribe: visibility -> type mapping ----------------------------------

test('update_tribe maps visibility "private" to the backend type 2', async () => {
  const record: { updateArgs?: { tribeId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_tribe', {
    tribeId: TRIBE_UUID,
    visibility: 'private',
  });

  assert.equal(record.updateArgs?.tribeId, TRIBE_UUID);
  assert.deepEqual(record.updateArgs?.body, { type: 2 });
});

test('update_tribe maps visibility "public" to the backend type 1', async () => {
  const record: { updateArgs?: { tribeId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_tribe', {
    tribeId: TRIBE_UUID,
    visibility: 'public',
  });

  assert.deepEqual(record.updateArgs?.body, { type: 1 });
});

test('update_tribe forwards name/description/intro alongside a visibility change', async () => {
  const record: { updateArgs?: { tribeId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_tribe', {
    tribeId: TRIBE_UUID,
    name: 'New name',
    description: 'New description',
    intro: 'New intro',
    visibility: 'private',
  });

  assert.deepEqual(record.updateArgs?.body, {
    name: 'New name',
    description: 'New description',
    intro: 'New intro',
    type: 2,
  });
});

test('update_tribe omits type entirely when visibility is not given', async () => {
  const record: { updateArgs?: { tribeId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_tribe', {
    tribeId: TRIBE_UUID,
    name: 'New name',
  });

  assert.deepEqual(record.updateArgs?.body, { name: 'New name' });
  assert.equal('type' in (record.updateArgs?.body ?? {}), false);
});

// --- update_tribe: zod rejections -----------------------------------------------

test('update_tribe rejects a call with none of name/description/intro/visibility', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_tribe', { tribeId: TRIBE_UUID }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('update_tribe rejects a non-UUID tribeId', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_tribe', { tribeId: 'some-slug', name: 'x' }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('UpdateTribeSchema requires a tribeId', () => {
  assert.throws(() => UpdateTribeSchema.parse({ name: 'x' } as never));
});

// --- update_tribe: merge-patch content type (client-level, observable) ---------

test('TribeunalAPIClient.updateTribe sends application/merge-patch+json', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string; body?: unknown; headers?: Record<string, string> } = {};
  (client as any).client.patch = async (path: string, body: unknown, config: { headers: Record<string, string> }) => {
    record.path = path;
    record.body = body;
    record.headers = config.headers;
    return { data: { uuid: TRIBE_UUID } };
  };

  await client.updateTribe(TRIBE_UUID, { type: 2 });

  assert.equal(record.path, `/tribes/${TRIBE_UUID}`);
  assert.deepEqual(record.body, { type: 2 });
  assert.equal(record.headers?.['Content-Type'], 'application/merge-patch+json');
});

test('TribeunalAPIClient.updateCase sends plain application/json (not merge-patch)', async () => {
  // Contrast case: the case PATCH op uses deserialize:false and needs no
  // merge-patch header, unlike the tribe PATCH above.
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { headers?: Record<string, string> } = {};
  (client as any).client.patch = async (_path: string, _body: unknown, config: { headers: Record<string, string> }) => {
    record.headers = config.headers;
    return { data: { uuid: 'case-uuid' } };
  };

  await client.updateCase('case-uuid', { title: 'x' });
  assert.equal(record.headers?.['Content-Type'], 'application/json');
});

// --- delete_tribe: request path --------------------------------------------------

test('delete_tribe forwards the tribeId and reports deletion', async () => {
  const record: { deletedId?: string } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_delete_tribe', { tribeId: TRIBE_UUID });

  assert.equal(record.deletedId, TRIBE_UUID);
  const parsed = JSON.parse(result.content[0].text as string);
  assert.deepEqual(parsed, { deleted: true, uuid: TRIBE_UUID });
});

test('delete_tribe rejects a non-UUID tribeId before any request', async () => {
  const record: { deletedId?: string } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_delete_tribe', { tribeId: '12345' }),
    /Invalid parameters/,
  );
  assert.equal(record.deletedId, undefined);
});

test('DeleteTribeSchema requires a tribeId', () => {
  assert.throws(() => DeleteTribeSchema.parse({} as never));
});

// --- remove_tribe_member: request path -------------------------------------------

test('remove_tribe_member forwards tribeId and username', async () => {
  const record: { removeArgs?: { tribeId: string; username: string } } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_remove_tribe_member', {
    tribeId: TRIBE_UUID,
    username: 'alice',
  });

  assert.deepEqual(record.removeArgs, { tribeId: TRIBE_UUID, username: 'alice' });
  const parsed = JSON.parse(result.content[0].text as string);
  assert.equal(parsed.removed, true);
});

test('remove_tribe_member rejects a missing username', async () => {
  const record: { removeArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_remove_tribe_member', { tribeId: TRIBE_UUID }),
    /Invalid parameters/,
  );
  assert.equal(record.removeArgs, undefined);
});

test('remove_tribe_member rejects a non-UUID tribeId', async () => {
  const record: { removeArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_remove_tribe_member', { tribeId: 'slug', username: 'alice' }),
    /Invalid parameters/,
  );
  assert.equal(record.removeArgs, undefined);
});

test('RemoveTribeMemberSchema requires tribeId and username', () => {
  assert.throws(() => RemoveTribeMemberSchema.parse({ tribeId: TRIBE_UUID } as never));
  assert.throws(() => RemoveTribeMemberSchema.parse({ username: 'alice' } as never));
});

// --- remove_tribe_member: username URL-encoding (client-level, observable) ------

test('TribeunalAPIClient.removeTribeMember URL-encodes a username with reserved characters', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string } = {};
  (client as any).client.delete = async (path: string) => {
    record.path = path;
    return { data: { removed: true } };
  };

  await client.removeTribeMember(TRIBE_UUID, 'alice+bob@example.com');

  assert.equal(record.path, `/tribes/${TRIBE_UUID}/members/${encodeURIComponent('alice+bob@example.com')}`);
  assert.match(record.path!, /alice%2Bbob%40example\.com/);
});

// --- catalog wiring -----------------------------------------------------------

test('update_tribe, delete_tribe and remove_tribe_member carry the expected annotations', () => {
  const update = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_update_tribe');
  const del = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_delete_tribe');
  const remove = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_remove_tribe_member');
  assert.ok(update);
  assert.ok(del);
  assert.ok(remove);

  assert.equal((update!.annotations as { destructiveHint?: boolean }).destructiveHint, false);
  assert.equal((update!.annotations as { idempotentHint?: boolean }).idempotentHint, true);
  assert.equal((del!.annotations as { destructiveHint?: boolean }).destructiveHint, true);
  assert.equal((remove!.annotations as { destructiveHint?: boolean }).destructiveHint, true);
});
