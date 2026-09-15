import { z } from 'zod';
import { caseUuid, sideUuid, evidenceUuid } from './uuid.js';

// Voting & evidence schemas (case vocabulary). Case and side identifiers are
// UUIDs only (see ./uuid.ts) — the backend resolves both by `uuid`.

export const CastVoteSchema = z.object({
  caseId: caseUuid('Case UUID to vote on.'),
  sideId: sideUuid('The side\'s uuid, from the case\'s sides[] array in tribeunal_get_case.'),
  comment: z.string().max(2000).optional().describe('Optional rationale, up to 2000 characters, stored as a vote-linked comment visible in the activity feed and markable as evidence.'),
});

export const RevokeVoteSchema = z.object({
  caseId: caseUuid('Case UUID.'),
  sideId: sideUuid("Must belong to this case; the API resolves your actual vote by case and caller alone, so this need not equal the side you voted for."),
});

export const RateEvidenceSchema = z.object({
  evidenceId: evidenceUuid('Case-file evidence UUID from tribeunal_list_evidence\'s uuid field (kind: file) — not a comment id.'),
  rating: z.number().int().min(-1).max(1).describe('Rating value: 1 up, 0 irrelevant, -1 down.'),
  sideId: sideUuid('Optional side UUID (from tribeunal_get_case) recording which side this rating supports; must belong to the same case as the evidence, else 400 side_trial_mismatch / 404 side_not_found.').optional(),
});
