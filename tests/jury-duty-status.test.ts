import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchToolCall, TOOL_DEFINITIONS } from '../src/core/tools.js';
import { GetJuryDutyStatusSchema, StartJuryDutySchema, CancelJuryDutySchema } from '../src/tools/jury-duty.js';
import { TribeunalAPIClient, type TribeunalAPIClient as TribeunalAPIClientType } from '../src/client/api-client.js';

const rawAllowance = {
  daily_max: 5,
  used_today: 2,
  remaining_today: 3,
  can_use: true,
  usage_percentage: 40,
  reset_time: '2026-09-16T00:00:00+00:00',
  active_jury_duties: 1,
  max_active_jury_duties: 3,
  can_accept_more_juries: true,
  active_jury_usage_percentage: 33,
  user_level: 2,
};

const rawAssignment = {
  uuid: '8415a252-5e41-4db6-bd5d-ee5b5ad95dd4',
  title: 'A seated case',
  url: 'https://tribeunal.test/cases/a-seated-case',
  state: 'open',
  juryType: 'invited',
  endsAt: '2026-09-20T00:00:00+00:00',
};

function fakeClient(record: {
  indexArgs?: { page?: number; limit?: number };
  historyArgs?: number;
  historyCalled?: boolean;
} = {}, overrides: {
  status?: Record<string, unknown>;
  index?: Record<string, unknown>;
  history?: Record<string, unknown>;
} = {}): TribeunalAPIClientType {
  return {
    getJuryDutyStatus: async () => ({
      request: null,
      allowance: rawAllowance,
      ...overrides.status,
    }),
    getJuryDutyIndex: async (page?: number, limit?: number) => {
      record.indexArgs = { page, limit };
      return {
        current_assignments: [rawAssignment],
        assignments_total: 1,
        page: page ?? 1,
        limit: limit ?? 10,
        allowance: rawAllowance,
        ...overrides.index,
      };
    },
    getJuryDutyHistory: async (days: number) => {
      record.historyCalled = true;
      record.historyArgs = days;
      return {
        history: [{ date: '2026-09-14', usedCount: 1, maxAllowed: 5, remainingCount: 4 }],
        ...overrides.history,
      };
    },
    startJuryDuty: async () => ({ request: { status: 'waiting', requestedAt: '2026-09-15T00:00:00+00:00' }, allowance: { remaining_today: 3 } }),
    cancelJuryDuty: async () => ({ message: 'cancelled', request: { status: 'cancelled' } }),
  } as unknown as TribeunalAPIClientType;
}

// --- composition ---------------------------------------------------------------

test('get_jury_duty_status composes status+index into camelCase keys', async () => {
  const result = await dispatchToolCall(fakeClient(), 'tribeunal_get_jury_duty_status', {});
  const parsed = JSON.parse(result.content[0].text as string);

  assert.deepEqual(parsed.allowance, {
    dailyMax: 5,
    usedToday: 2,
    remainingToday: 3,
    canUseDailyAllowance: true,
    resetAt: '2026-09-16T00:00:00+00:00',
    activeJuries: 1,
    maxActiveJuries: 3,
    canAcceptMoreJuries: true,
    canStartSearch: true,
    userLevel: 2,
  });

  assert.deepEqual(parsed.assignments, {
    cases: [rawAssignment],
    total: 1,
    page: 1,
    limit: 10,
  });

  assert.equal(parsed.request, null);
  assert.equal('history' in parsed, false, 'history is omitted entirely when historyDays is not given');
});

test('get_jury_duty_status includes a waiting request with its queue position', async () => {
  const result = await dispatchToolCall(
    fakeClient({}, {
      status: {
        request: { status: 'waiting', requestedAt: '2026-09-15T00:00:00+00:00' },
        queue: { position: 2, total_waiting: 5, estimated_wait_time: 120 },
      },
    }),
    'tribeunal_get_jury_duty_status',
    {},
  );
  const parsed = JSON.parse(result.content[0].text as string);

  assert.deepEqual(parsed.request, {
    status: 'waiting',
    requestedAt: '2026-09-15T00:00:00+00:00',
    queue: { position: 2, totalWaiting: 5, estimatedWaitS: 120 },
  });
});

test('get_jury_duty_status fetches and maps history only when historyDays is given', async () => {
  const record: { historyCalled?: boolean; historyArgs?: number } = {};
  const result = await dispatchToolCall(fakeClient(record), 'tribeunal_get_jury_duty_status', { historyDays: 7 });
  const parsed = JSON.parse(result.content[0].text as string);

  assert.equal(record.historyCalled, true);
  assert.equal(record.historyArgs, 7);
  assert.deepEqual(parsed.history, [{ date: '2026-09-14', used: 1, max: 5, remaining: 4 }]);
});

test('get_jury_duty_status does not call getJuryDutyHistory when historyDays is omitted', async () => {
  const record: { historyCalled?: boolean } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_get_jury_duty_status', {});
  assert.equal(record.historyCalled, undefined);
});

// --- canStartSearch logic -------------------------------------------------------

test('canStartSearch is true only when both can_use and can_accept_more_juries are true', async () => {
  const cases: Array<[boolean, boolean, boolean]> = [
    [true, true, true],
    [false, true, false],
    [true, false, false],
    [false, false, false],
  ];
  for (const [canUse, canAccept, expected] of cases) {
    const result = await dispatchToolCall(
      fakeClient({}, { status: { allowance: { ...rawAllowance, can_use: canUse, can_accept_more_juries: canAccept } } }),
      'tribeunal_get_jury_duty_status',
      {},
    );
    const parsed = JSON.parse(result.content[0].text as string);
    assert.equal(
      parsed.allowance.canStartSearch,
      expected,
      `can_use=${canUse} can_accept_more_juries=${canAccept} should give canStartSearch=${expected}`,
    );
  }
});

// --- pagination params passed ----------------------------------------------------

test('get_jury_duty_status forwards assignmentsPage/assignmentsLimit to getJuryDutyIndex', async () => {
  const record: { indexArgs?: { page?: number; limit?: number } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_get_jury_duty_status', {
    assignmentsPage: 3,
    assignmentsLimit: 25,
  });

  assert.deepEqual(record.indexArgs, { page: 3, limit: 25 });
});

test('get_jury_duty_status defaults assignmentsPage/assignmentsLimit to 1 and 10', async () => {
  const record: { indexArgs?: { page?: number; limit?: number } } = {};
  await dispatchToolCall(fakeClient(record), 'tribeunal_get_jury_duty_status', {});
  assert.deepEqual(record.indexArgs, { page: 1, limit: 10 });
});

// --- zod rejections --------------------------------------------------------------

test('GetJuryDutyStatusSchema rejects historyDays out of range', () => {
  assert.throws(() => GetJuryDutyStatusSchema.parse({ historyDays: 0 }));
  assert.throws(() => GetJuryDutyStatusSchema.parse({ historyDays: 31 }));
});

test('get_jury_duty_status rejects an out-of-range historyDays', async () => {
  await assert.rejects(
    () => dispatchToolCall(fakeClient(), 'tribeunal_get_jury_duty_status', { historyDays: 0 }),
    /Invalid parameters/,
  );
});

// --- start / cancel jury duty ----------------------------------------------------

test('start_jury_duty dispatches to startJuryDuty and reports status', async () => {
  StartJuryDutySchema.parse({});
  const result = await dispatchToolCall(fakeClient(), 'tribeunal_start_jury_duty', {});
  assert.match(result.content[0].text as string, /waiting/);
});

test('cancel_jury_duty dispatches to cancelJuryDuty and reports the outcome', async () => {
  CancelJuryDutySchema.parse({});
  const result = await dispatchToolCall(fakeClient(), 'tribeunal_cancel_jury_duty', {});
  assert.match(result.content[0].text as string, /cancelled/i);
});

// --- catalog wiring ----------------------------------------------------------------

test('get_jury_duty_status is advertised as read-only and idempotent', () => {
  const def = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_get_jury_duty_status');
  assert.ok(def);
  const a = def!.annotations as { readOnlyHint?: boolean; idempotentHint?: boolean; destructiveHint?: boolean };
  assert.equal(a.readOnlyHint, true);
  assert.equal(a.idempotentHint, true);
  assert.equal(a.destructiveHint, false);
});

test('cancel_jury_duty is advertised as destructive; start_jury_duty is not', () => {
  const start = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_start_jury_duty');
  const cancel = TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_cancel_jury_duty');
  assert.equal((start!.annotations as { destructiveHint?: boolean }).destructiveHint, false);
  assert.equal((cancel!.annotations as { destructiveHint?: boolean }).destructiveHint, true);
});

test('there is no jury_duty_accept tool — a matched seat needs no acceptance', () => {
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_accept'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_reject'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_dashboard'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_allowance'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_history'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_status'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_start'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_jury_duty_cancel'), undefined);
});

test('there is no get_vote_stats or get_current_user tool', () => {
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_get_vote_stats'), undefined);
  assert.equal(TOOL_DEFINITIONS.find((d) => d.name === 'tribeunal_get_current_user'), undefined);
});

// --- HTTP path/params (client-level, observable) --------------------------------

test('TribeunalAPIClient.getJuryDutyIndex GETs /jury-duty/index with {page, limit} params', async () => {
  const client = new TribeunalAPIClient({ baseURL: 'https://tribeunal.test/api' });
  const record: { path?: string; params?: unknown } = {};
  (client as any).client.get = async (path: string, config: { params?: unknown }) => {
    record.path = path;
    record.params = config?.params;
    return { data: { current_assignments: [], assignments_total: 0, page: 3, limit: 25 } };
  };

  await client.getJuryDutyIndex(3, 25);

  assert.equal(record.path, '/jury-duty/index');
  assert.deepEqual(record.params, { page: 3, limit: 25 });
});
