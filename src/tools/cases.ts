import { z } from 'zod';
import { caseUuid } from './uuid.js';

// Case schemas — the single, canonical vocabulary advertised by the server.
// Case identifiers are UUIDs only (see ./uuid.ts): a numeric id or slug is
// rejected here rather than 500-ing backend-side.

export const SearchCasesSchema = z.object({
  query: z.string().optional().describe('Search cases by title or description'),
  status: z.enum(['init', 'jury_selection', 'open', 'closed', 'expired', 'suspended']).optional().describe('Filter by case status (open = accepting votes, jury_selection = still assembling its jury)'),
  type: z.enum(['case', 'advice', 'poll']).optional().describe('Filter by case type — case (binding jury decision), advice (input for the creator), poll (opinion gathering)'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  page: z.number().min(1).default(1).describe('Page number for pagination'),
  limit: z.number().min(1).max(100).default(20).describe('Number of cases to return per page'),
});

export const GetCaseSchema = z.object({
  id: caseUuid('Case UUID (the case\'s `uuid` field)'),
});

export const CreateCaseSchema = z.object({
  title: z.string().min(3).max(200).describe('Case title — the question or statement to be decided'),
  description: z.string().min(10).describe('Context, background, and criteria for the case'),
  type: z.enum(['case', 'advice', 'poll']).describe('Case type — case (binding jury decision), advice (input for the creator), or poll (opinion gathering)'),
  juryType: z.enum(['public', 'invited']).default('public').describe('Who can participate — public (anyone) or invited only'),
  visibility: z.enum(['public', 'private']).default('public').describe('Case visibility — public (anyone can find and read it) or private (only you, your invited jurors and admins). A private case must use an invited jury; omit juryType and it is set to invited automatically. One exception: set allowsGuestVotes on a private case and it becomes a link-poll — still absent from every listing, search and feed, but readable and votable by anyone you send the link to — which takes a public jury instead.'),
  sides: z.array(z.object({
    name: z.string().describe('Option/choice name'),
    description: z.string().optional().describe('Optional description for this choice'),
    image: z.string().url().refine((u) => u.startsWith('https://'), { message: 'Side image URL must use https.' }).optional().describe('Optional https image URL for this choice — fetched and re-encoded server-side (png/jpeg/webp, <= 5 MB). Shown on the choice\'s vote card.'),
  })).min(2).max(10).describe('The choices/options voters pick between (2-10)'),
  caseLength: z.number().min(60).max(2592000).default(86400).describe('Voting duration in seconds (min: 1 minute, max: 30 days, default: 1 day)'),
  maxAiJurorPercentage: z.number().int().min(0).max(100).optional().describe('Maximum percentage of jurors that may be AI personas (0 = none allowed, 100 = all; default 50)'),
  jurorCount: z.number().int().min(2).max(100).optional().describe('Number of jurors the case asks for (2-100, default 12). It gates opening only when openImmediately is false, where the case waits until this many jurors have joined. For a small invited panel, set this to the number of people you invite.'),
  openImmediately: z.boolean().optional().describe('Open the case for voting straight away (default true). Invited jurors are still invited and can view, join and vote while it is already open. Set false to hold the case in jury selection until jurorCount jurors have joined, and only then open it. While it waits, AI jurors are seated automatically within the AI juror limit on an invited jury or a private link-poll.'),
  allowsGuestVotes: z.boolean().optional().describe('Let visitors without a Tribeunal account vote on this case (default false). Guest votes count in full — they enter the tallies, percentages and the verdict exactly like a registered juror\'s. Requires a public jury; visibility may be either, and pairing it with visibility "private" makes a link-poll: unlisted everywhere, but votable by whoever holds the link. Guests are deduplicated per browser, so a returning visitor changes their vote rather than adding one, but someone determined can still vote again from another browser — enable it where reach matters more than strict one-person-one-vote.'),
  arbitrationMode: z.boolean().optional().describe('Bind this case to arbitration rules, for a verdict someone outside the case has to rely on (default false). You cannot vote on, join the jury of, or close early a case you created in this mode — an admin closes it, or it closes at its deadline; evidence marks freeze once it closes so the record it was decided on stops moving; and the early-vote and decisive-vote reward multipliers are switched off, so timing your vote no longer multiplies your payout. Requires minVotes of at least 2 (omit it and 3 is used) and cannot be combined with allowsGuestVotes. Use it when the case settles something with stakes — a dispute, a payout, a contract term — rather than gathering opinion.'),
  decisionRequirement: z.enum(['any', 'simple', 'qualified', 'unanimous']).optional().describe('The weakest outcome this case will accept as a verdict (default "any"). "any" takes whatever the tally gives, down to a plurality. "simple" needs at least half, "qualified" at least 66%, "unanimous" every vote on one side. A case that reaches a stronger result than required still reports the stronger one. On any value other than "any", missing the requirement closes the case with a Void verdict carrying voidReason "requirement_not_met"; an "any" case that merely ties stays Undecided.'),
  minVotes: z.number().int().min(0).max(100).optional().describe('Fewest votes this case needs before it can reach a verdict (0-100, default 0 = no minimum). Close it with fewer and it ends with a Void verdict carrying voidReason "quorum_not_met" rather than deciding on a turnout of one or two.'),
  tags: z.array(z.string()).max(4).optional().describe('Up to 4 tags for categorization'),
}).superRefine((data, ctx) => {
  // A private case is normally visible only to its owner, invited jurors and admins, so
  // it must run an invited jury. The exception is the link-poll: a private case that
  // allows anonymous voting is deliberately open to whoever holds its link, and that
  // audience needs a public jury to vote at all. The handler pre-coerces an omitted
  // juryType, so reaching here with a mismatch means the caller asked for it explicitly.
  const isLinkPoll = data.visibility === 'private'
    && data.allowsGuestVotes === true
    && data.juryType === 'public';

  if (data.visibility === 'private' && data.juryType !== 'invited' && !isLinkPoll) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['juryType'],
      message: 'A private case must use an invited jury (set juryType to "invited"), unless it allows anonymous voting — set allowsGuestVotes to make it a link-poll with a public jury.',
    });
  }

  // Anonymous voting needs a jury anyone can join; a guest holds no seat on an invited
  // panel. Visibility is deliberately not part of this rule. Caught here so the caller
  // gets a named parameter and a reason instead of a bare 400 from the backend, which
  // enforces the same rule in an entity constraint and a DB CHECK.
  if (data.allowsGuestVotes === true && data.juryType !== 'public') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['allowsGuestVotes'],
      message: 'Anonymous voting requires a public jury.',
    });
  }

  // A verdict an outside party is meant to rely on cannot rest on voters nobody can hold
  // to account, nor on a turnout of one. Caught here so the caller gets a named parameter
  // and a reason instead of a bare 400 from the backend, which enforces the same two rules
  // in an entity constraint and a DB CHECK.
  if (data.arbitrationMode === true) {
    if (data.allowsGuestVotes === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowsGuestVotes'],
        message: 'An arbitration case cannot allow anonymous voting — its voters must be accountable.',
      });
    }

    if (data.minVotes !== undefined && data.minVotes < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minVotes'],
        message: 'An arbitration case requires a quorum of at least 2 votes; omit minVotes to use 3.',
      });
    }
  }
});

export const ListEvidenceSchema = z.object({
  caseId: caseUuid('Case UUID to get evidence for'),
});

export const CloseCaseSchema = z.object({
  caseId: caseUuid('Case UUID of the open or jury_selection case to close early (you must be the case owner, or an admin)'),
});
