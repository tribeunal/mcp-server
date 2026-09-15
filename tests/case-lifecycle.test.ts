import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { UpdateCaseSchema, DeleteCaseSchema } from '../src/tools/cases.js';
import { TribeunalAPIClient, type TribeunalAPIClient as TribeunalAPIClientType } from '../src/client/api-client.js';

const CASE_UUID = '8415a252-5e41-4db6-bd5d-ee5b5ad95dd4';

/** Fake client recording whatever the dispatcher hands the API layer. */
function fakeClient(record: {
  updateArgs?: { caseId: string; body: Record<string, unknown> };
  deletedId?: string;
} = {}): TribeunalAPIClientType {
  return {
    updateCase: async (caseId: string, body: Record<string, unknown>) => {
      record.updateArgs = { caseId, body };
      return { uuid: caseId, title: body.title ?? 'Old title', description: body.description ?? 'Old description', state: 'open' };
    },
    deleteCase: async (caseId: string) => {
      record.deletedId = caseId;
      return null;
    },
  } as unknown as TribeunalAPIClientType;
}

// --- update_case: request body -----------------------------------------------

test('update_case forwards caseId and only the given fields as the PATCH body', async () => {
  const record: { updateArgs?: { caseId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_case', {
    caseId: CASE_UUID,
    title: 'A sharper title',
  });

  assert.equal(record.updateArgs?.caseId, CASE_UUID);
  assert.deepEqual(record.updateArgs?.body, { title: 'A sharper title' });
});

test('update_case forwards title and description together', async () => {
  const record: { updateArgs?: { caseId: string; body: Record<string, unknown> } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_update_case', {
    caseId: CASE_UUID,
    title: 'A sharper title',
    description: 'More context.',
  });

  assert.deepEqual(record.updateArgs?.body, { title: 'A sharper title', description: 'More context.' });
});

test('update_case returns the updated case as JSON', async () => {
  const result = await dispatchToolCall(fakeClient(), 'tribeunal_update_case', {
    caseId: CASE_UUID,
    description: 'More context.',
  });
  const parsed = JSON.parse(result.content[0].text as string);
  assert.equal(parsed.uuid, CASE_UUID);
});

// --- update_case: zod rejections ----------------------------------------------

test('update_case rejects a call with neither title nor description', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_case', { caseId: CASE_UUID }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined, 'nothing may reach the API client');
});

test('update_case rejects a non-UUID caseId before any request', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_case', { caseId: '878', title: 'x' }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('UpdateCaseSchema rejects missing caseId', () => {
  assert.throws(() => UpdateCaseSchema.parse({ title: 'x' } as never));
});

// --- delete_case: request path ------------------------------------------------

test('delete_case forwards the caseId and reports deletion', async () => {
  const record: { deletedId?: string } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_delete_case', { caseId: CASE_UUID });

  assert.equal(record.deletedId, CASE_UUID);
  const parsed = JSON.parse(result.content[0].text as string);
  assert.deepEqual(parsed, { deleted: true, uuid: CASE_UUID });
});

test('delete_case rejects a non-UUID caseId before any request', async () => {
  const record: { deletedId?: string } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_delete_case', { caseId: 'not-a-uuid' }),
    /Invalid parameters/,
  );
  assert.equal(record.deletedId, undefined);
});

test('DeleteCaseSchema rejects a missing caseId', () => {
  assert.throws(() => DeleteCaseSchema.parse({} as never));
});

// --- catalog wiring -------------------------------------------------------------

test('update_case and delete_case are advertised with the expected annotations', () => {
  const update = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_update_case');
  const del = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_delete_case');
  assert.ok(update);
  assert.ok(del);

  const ua = update!.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  assert.equal(ua.readOnlyHint, false);
  assert.equal(ua.destructiveHint, false, 'overwriting a field is not destructive per the house rule');
  assert.equal(ua.idempotentHint, true);

  const da = del!.annotations as { destructiveHint?: boolean };
  assert.equal(da.destructiveHint, true, 'deleting a case destroys it permanently');
});

// --- HTTP path/verb (client-level, observable) ----------------------------------

test('TribeunalAPIClient.updateCase PATCHes /cases/{uuid} with plain JSON', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string; body?: unknown; headers?: Record<string, string> } = {};
  (client as any).client.patch = async (path: string, body: unknown, config: { headers: Record<string, string> }) => {
    record.path = path;
    record.body = body;
    record.headers = config.headers;
    return { data: { uuid: CASE_UUID } };
  };

  await client.updateCase(CASE_UUID, { title: 'A sharper title' });

  assert.equal(record.path, `/cases/${CASE_UUID}`);
  assert.deepEqual(record.body, { title: 'A sharper title' });
  assert.equal(record.headers?.['Content-Type'], 'application/json');
});

test('TribeunalAPIClient.deleteCase DELETEs /cases/{uuid}', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string } = {};
  (client as any).client.delete = async (path: string) => {
    record.path = path;
    return { data: null };
  };

  await client.deleteCase(CASE_UUID);

  assert.equal(record.path, `/cases/${CASE_UUID}`);
});
