import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type TribeunalAPIClient } from '../src/client/api-client.js';
import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';

const CASE_UUID = '8415a252-5e41-4db6-bd5d-ee5b5ad95dd4';

/**
 * `tribeunal_join_jury` closes the MCP-only-invitee gap: an agent invited to an
 * invited-jury case had no way to take a seat, so its vote was refused and no
 * tool could fix that. The endpoint existed; only the tool was missing.
 */

function fakeClient(record: { joinArgs?: string } = {}): TribeunalAPIClient {
  return {
    joinJury: async (caseId: string) => {
      record.joinArgs = caseId;
      return { success: true, message: 'Successfully joined jury' };
    },
  } as unknown as TribeunalAPIClient;
}

test('join_jury forwards the case uuid and surfaces the server message', async () => {
  const record: { joinArgs?: string } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_join_jury', { caseId: CASE_UUID });

  assert.equal(record.joinArgs, CASE_UUID);
  const text = result.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
  assert.match(text, /Successfully joined jury/);
});

test('join_jury rejects a non-UUID case id at the tool boundary', async () => {
  // A numeric id reaches a uuid-typed column as an opaque 500, so it is refused
  // here with a message naming the field to use instead.
  await assert.rejects(
    () => dispatchToolCall(fakeClient(), 'tribeunal_join_jury', { caseId: '878' }),
    /Invalid parameters/,
  );
});

test('join_jury is advertised as a non-destructive write with a UUID pattern', () => {
  const def = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_join_jury');
  assert.ok(def, 'the join tool must be advertised to clients');
  const a = def.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
  assert.equal(a.readOnlyHint, false);
  assert.equal(a.destructiveHint, false, 'taking a seat is reversible and destroys nothing');
  assert.equal(a.openWorldHint, false);

  const schema = def.inputSchema as { properties: Record<string, { pattern?: string }>; required: readonly string[] };
  assert.ok(schema.properties.caseId?.pattern, 'caseId must advertise a UUID pattern');
  assert.deepEqual([...schema.required], ['caseId']);
});

test('the description warns that the server does not enforce the invite list', () => {
  // The endpoint admits any authenticated user with a free slot on an invited
  // jury (TrialController::juryJoin — surfaced backend gap, not fixed here).
  // Exposing it over MCP makes that reachable by agents, so the tool says so.
  const def = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_join_jury');
  assert.match(def!.description, /does not check the invite list/i);
  assert.match(def!.description, /public juries need no seat/i);
});
