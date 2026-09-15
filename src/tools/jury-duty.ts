import { z } from 'zod';
import { caseUuid, tribeUuid } from './uuid.js';

// Jury Duty Status (consolidated: request + assignments + allowance, with
// optional history) and queue management.
export const GetJuryDutyStatusSchema = z.object({
  historyDays: z.number().int().min(1).max(30).optional()
    .describe('1–30; when given, includes a history[] of {date, used, max, remaining} for that many past days. Omit to skip fetching history.'),
  assignmentsPage: z.number().int().min(1).default(1)
    .describe('Page number (≥1) into assignments.cases, default 1.'),
  assignmentsLimit: z.number().int().min(1).max(50).default(10)
    .describe('Assignments page size, 1–50, default 10.'),
});

export const StartJuryDutySchema = z.object({});
export const CancelJuryDutySchema = z.object({});

// Seating yourself on a case's jury. The caller is the subject, so a case UUID
// is the whole input.
export const JoinJurySchema = z.object({
  caseId: caseUuid('Case UUID of the jury to join (from tribeunal_get_case, tribeunal_search_cases, or a jury invitation).'),
});

// Freeing your own jury seat. The caller is the subject, so a case UUID is the
// whole input.
export const LeaveJurySchema = z.object({
  caseId: caseUuid("Case UUID of the jury seat to give up (from tribeunal_get_case, tribeunal_get_jury_duty_status's assignments, or tribeunal_search_cases) — not a memberId."),
});

// Jury invitations (case owner). Either an explicit invitees list or a tribeId
// (invite the whole tribe — every member plus the chieftain) is required; both may
// be given and are unioned, with the backend deduping. The refine enforces the
// at-least-one rule the endpoint returns `no_invitees` for.
export const InviteJurorsSchema = z.object({
  caseId: caseUuid('Case UUID (from tribeunal_get_case or tribeunal_search_cases) — must be a case you own or administer.'),
  invitees: z.array(z.string().min(1)).min(1).max(50).optional()
    .describe('1–50 usernames or email addresses to invite. Optional if tribeId is given; at least one of the two is required. An AI persona\'s username may be invited to pick a specific one; AI jurors are otherwise seated automatically up to the case\'s AI juror limit.'),
  tribeId: tribeUuid('Tribe UUID (from tribeunal_list_tribes or tribeunal_get_tribe) to invite every current member plus the chieftain. You must belong to, own, or administer the tribe.').optional(),
}).refine((v) => (v.invitees !== undefined && v.invitees.length > 0) || v.tribeId !== undefined, {
  message: 'Provide invitees and/or a tribeId to invite jurors',
});
