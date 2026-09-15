import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { LeaveJurySchema } from '../src/tools/jury-duty.js';
import { TribeunalAPIClient, type TribeunalAPIClient as TribeunalAPIClientType } from '../src/client/api-client.js';

const CASE_UUID = '8415a252-5e41-4db6-bd5d-ee5b5ad95dd4';

function fakeClient(record: { leaveArgs?: string } = {}, response: Record<string, unknown> = {}): TribeunalAPIClientType {
  return {
    leaveJury: async (caseId: string) => {
      record.leaveArgs = caseId;
      return {
        left: true,
        requeued: false,
        case: { uuid: caseId, title: 'A case', url: 'https://tribeunal.test/cases/a-case' },
        ...response,
      };
    },
  } as unknown as TribeunalAPIClientType;
}

test('leave_jury forwards the case uuid to leaveJury', async () => {
  const record: { leaveArgs?: string } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_leave_jury', { caseId: CASE_UUID });
  assert.equal(record.leaveArgs, CASE_UUID);
});

test('leave_jury reports a plain departure when the seat is not requeued', async () => {
  const result = await dispatchToolCall(fakeClient({}, { requeued: false }), 'tribeunal_leave_jury', { caseId: CASE_UUID });
  const text = result.content[0].text as string;
  const headline = text.split('\n')[0];
  assert.match(headline, /^Left the jury\.$/);
});

test('leave_jury mentions the requeue when the matchmaking search goes back in the queue', async () => {
  const result = await dispatchToolCall(fakeClient({}, { requeued: true }), 'tribeunal_leave_jury', { caseId: CASE_UUID });
  const text = result.content[0].text as string;
  assert.match(text, /requeued/i);
});

test('leave_jury rejects a non-UUID case id at the tool boundary', async () => {
  const record: { leaveArgs?: string } = {};
  await assert.rejects(
    () => dispatchToolCall(fakeClient(record), 'tribeunal_leave_jury', { caseId: '878' }),
    /Invalid parameters/,
  );
  assert.equal(record.leaveArgs, undefined);
});

test('LeaveJurySchema requires a caseId', () => {
  assert.throws(() => LeaveJurySchema.parse({} as never));
});

test('leave_jury is advertised as destructive (a jury seat ceases to exist)', () => {
  const def = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_leave_jury');
  assert.ok(def);
  const a = def!.annotations as { destructiveHint?: boolean; readOnlyHint?: boolean };
  assert.equal(a.readOnlyHint, false);
  assert.equal(a.destructiveHint, true);
});

// --- HTTP path/verb (client-level, observable) ----------------------------------

test('TribeunalAPIClient.leaveJury POSTs /cases/{uuid}/jury/leave', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string } = {};
  (client as any).client.post = async (path: string) => {
    record.path = path;
    return { data: { left: true, requeued: false, case: { uuid: CASE_UUID } } };
  };

  await client.leaveJury(CASE_UUID);

  assert.equal(record.path, `/cases/${CASE_UUID}/jury/leave`);
});
