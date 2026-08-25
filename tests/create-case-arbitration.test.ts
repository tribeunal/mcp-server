import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { CreateCaseSchema } from '../src/tools/cases.js';
import { GetCaseActivitySchema } from '../src/tools/activity.js';
import type { TribeunalAPIClient } from '../src/client/api-client.js';

/** Fake client that records the createCase arg and returns a canned created case. */
function fakeClient(record: { data?: Record<string, unknown> }): TribeunalAPIClient {
  return {
    createCase: async (data: Record<string, unknown>) => {
      record.data = data;
      return {
        uuid: 'new-uuid',
        slug: 'new-slug',
        url: 'https://tribeunal.test/cases/new-slug',
        arbitrationMode: data.arbitrationMode,
        decisionRequirement: data.decisionRequirement,
        minVotes: data.minVotes,
      };
    },
  } as unknown as TribeunalAPIClient;
}

const baseArgs = {
  title: 'Should the deposit be returned',
  description: 'Context long enough to pass validation.',
  type: 'case' as const,
  sides: [{ name: 'Yes' }, { name: 'No' }],
};

test('the three arbitration fields are forwarded verbatim to createCase', async () => {
  const record: { data?: Record<string, unknown> } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_create_case', {
    ...baseArgs,
    arbitrationMode: true,
    decisionRequirement: 'unanimous',
    minVotes: 3,
  });

  assert.equal(record.data?.arbitrationMode, true);
  assert.equal(record.data?.decisionRequirement, 'unanimous');
  assert.equal(record.data?.minVotes, 3);
});

test('omitting the arbitration fields leaves them out of the body entirely', async () => {
  const record: { data?: Record<string, unknown> } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_create_case', { ...baseArgs });

  // Absent, not defaulted here: the backend owns the defaults (false / 'any' / 0).
  assert.equal('arbitrationMode' in (record.data ?? {}), false);
  assert.equal('decisionRequirement' in (record.data ?? {}), false);
  assert.equal('minVotes' in (record.data ?? {}), false);
});

test('superRefine rejects arbitration combined with anonymous voting', () => {
  const result = CreateCaseSchema.safeParse({
    ...baseArgs,
    arbitrationMode: true,
    minVotes: 2,
    allowsGuestVotes: true,
  });

  assert.equal(result.success, false);
  assert.match(
    result.success ? '' : result.error.issues.map((i) => i.message).join(' '),
    /anonymous voting/i,
  );
});

test('superRefine rejects an arbitration quorum below two', () => {
  const result = CreateCaseSchema.safeParse({
    ...baseArgs,
    arbitrationMode: true,
    minVotes: 1,
  });

  assert.equal(result.success, false);
  assert.match(
    result.success ? '' : result.error.issues.map((i) => i.message).join(' '),
    /quorum/i,
  );
});

test('arbitration with the quorum omitted is accepted — the backend defaults it', () => {
  const result = CreateCaseSchema.safeParse({ ...baseArgs, arbitrationMode: true });

  assert.equal(result.success, true);
});

test('decisionRequirement is a closed set', () => {
  assert.equal(CreateCaseSchema.safeParse({ ...baseArgs, decisionRequirement: 'bogus' }).success, false);
  assert.equal(CreateCaseSchema.safeParse({ ...baseArgs, decisionRequirement: 'qualified' }).success, true);
});

test('the activity schema accepts the new trial_reopened type', () => {
  const result = GetCaseActivitySchema.safeParse({
    caseId: '2bda697d-8a20-4693-bb59-1c99283fb008',
    types: ['trial_reopened'],
  });

  assert.equal(result.success, true);
});

test('explicit false / zero are forwarded, not stripped as defaults', async () => {
  const record: { data?: Record<string, unknown> } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_create_case', {
    ...baseArgs,
    arbitrationMode: false,
    minVotes: 0,
    decisionRequirement: 'any',
  });

  // Caller said so explicitly; only OMITTED fields are the backend's to default.
  assert.equal(record.data?.arbitrationMode, false);
  assert.equal(record.data?.minVotes, 0);
  assert.equal(record.data?.decisionRequirement, 'any');
});

test('the hand-written JSON schema mirrors the zod schema', () => {
  const createCase = TOOL_DEFINITIONS.find((t) => t.name === 'tribeunal_create_case');
  const props = (createCase?.inputSchema as { properties: Record<string, Record<string, unknown>> }).properties;

  for (const field of ['arbitrationMode', 'decisionRequirement', 'minVotes']) {
    assert.ok(props[field], `${field} missing from the hand-written JSON schema`);
  }

  // Presence alone is not the bug this test exists for. The two copies are maintained
  // by hand, so drift shows up as a wrong enum or a wrong bound, which a truthiness
  // check sails straight past.
  assert.equal(props.arbitrationMode.type, 'boolean');
  assert.deepEqual(props.decisionRequirement.enum, ['any', 'simple', 'qualified', 'unanimous']);
  assert.equal(props.minVotes.type, 'integer');
  assert.equal(props.minVotes.minimum, 0);
  assert.equal(props.minVotes.maximum, 100);

  // And the agent-facing text must not diverge between the copies either.
  const zodShape = (CreateCaseSchema as unknown as { _def: { schema: { shape: Record<string, { description?: string }> } } })._def.schema.shape;
  for (const field of ['arbitrationMode', 'decisionRequirement', 'minVotes']) {
    assert.equal(
      props[field].description,
      zodShape[field].description,
      `${field} description has drifted between the zod and JSON schemas`,
    );
  }

  // The activity type list lives in three places; a backend type missing from any one of
  // them is rejected by whichever copy was forgotten.
  const reopenedEnums = TOOL_DEFINITIONS.filter((t) =>
    JSON.stringify(t.inputSchema).includes('trial_reopened'),
  );
  assert.equal(reopenedEnums.length, 2, 'both hand-written activity enums must list trial_reopened');
});
