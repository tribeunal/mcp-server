import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { UpdateCommentSchema, DeleteCommentSchema } from '../src/tools/comments.js';
import { TribeunalAPIClient, type TribeunalAPIClient as TribeunalAPIClientType } from '../src/client/api-client.js';

const COMMENT_UUID = '01a03e2c-a314-7884-88d7-15faa67e2101';

/** Fake client recording whatever the dispatcher hands the API layer. */
function fakeClient(record: {
  updateArgs?: { commentId: string; text: string };
  deletedId?: string;
} = {}): TribeunalAPIClientType {
  return {
    updateComment: async (commentId: string, text: string) => {
      record.updateArgs = { commentId, text };
      return { uuid: commentId, text, editedAt: '2026-09-15T00:00:00+00:00' };
    },
    deleteComment: async (commentId: string) => {
      record.deletedId = commentId;
      return null;
    },
  } as unknown as TribeunalAPIClientType;
}

// --- update_comment: request path/body ----------------------------------------

test('update_comment forwards commentId and the new text', async () => {
  const record: { updateArgs?: { commentId: string; text: string } } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_update_comment', {
    commentId: COMMENT_UUID,
    text: 'A revised analysis.',
  });

  assert.deepEqual(record.updateArgs, { commentId: COMMENT_UUID, text: 'A revised analysis.' });
  const parsed = JSON.parse(result.content[0].text as string);
  assert.equal(parsed.editedAt, '2026-09-15T00:00:00+00:00');
});

test('update_comment rejects an empty text', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_comment', { commentId: COMMENT_UUID, text: '' }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('update_comment rejects a non-UUID commentId', async () => {
  const record: { updateArgs?: unknown } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_update_comment', { commentId: '42', text: 'x' }),
    /Invalid parameters/,
  );
  assert.equal(record.updateArgs, undefined);
});

test('UpdateCommentSchema requires both commentId and text', () => {
  assert.throws(() => UpdateCommentSchema.parse({ commentId: COMMENT_UUID } as never));
  assert.throws(() => UpdateCommentSchema.parse({ text: 'x' } as never));
});

// --- delete_comment: request path ----------------------------------------------

test('delete_comment forwards the commentId and reports deletion', async () => {
  const record: { deletedId?: string } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_delete_comment', { commentId: COMMENT_UUID });

  assert.equal(record.deletedId, COMMENT_UUID);
  const parsed = JSON.parse(result.content[0].text as string);
  assert.deepEqual(parsed, { deleted: true, uuid: COMMENT_UUID });
});

test('delete_comment rejects a non-UUID commentId before any request', async () => {
  const record: { deletedId?: string } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_delete_comment', { commentId: 'not-a-uuid' }),
    /Invalid parameters/,
  );
  assert.equal(record.deletedId, undefined);
});

test('DeleteCommentSchema requires a commentId', () => {
  assert.throws(() => DeleteCommentSchema.parse({} as never));
});

// --- catalog wiring -------------------------------------------------------------

test('update_comment and delete_comment are advertised with the expected annotations', () => {
  const update = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_update_comment');
  const del = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_delete_comment');
  assert.ok(update);
  assert.ok(del);

  const ua = update!.annotations as { destructiveHint?: boolean; idempotentHint?: boolean };
  assert.equal(ua.destructiveHint, false);
  assert.equal(ua.idempotentHint, true);

  const da = del!.annotations as { destructiveHint?: boolean };
  assert.equal(da.destructiveHint, true);
});

// --- HTTP path/verb (client-level, observable) ----------------------------------

test('TribeunalAPIClient.updateComment PATCHes /comments/{id} with {text}', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string; body?: unknown } = {};
  (client as any).client.patch = async (path: string, body: unknown) => {
    record.path = path;
    record.body = body;
    return { data: { uuid: COMMENT_UUID } };
  };

  await client.updateComment(COMMENT_UUID, 'A revised analysis.');

  assert.equal(record.path, `/comments/${COMMENT_UUID}`);
  assert.deepEqual(record.body, { text: 'A revised analysis.' });
});

test('TribeunalAPIClient.deleteComment DELETEs /comments/{id}', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string } = {};
  (client as any).client.delete = async (path: string) => {
    record.path = path;
    return { data: null };
  };

  await client.deleteComment(COMMENT_UUID);

  assert.equal(record.path, `/comments/${COMMENT_UUID}`);
});
