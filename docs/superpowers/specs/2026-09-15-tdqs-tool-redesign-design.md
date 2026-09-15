# Tool-surface redesign for TDQS (Glama) — design (rev. 2, after adversarial review)

**Date:** 2026-09-15 · **Status:** build (autonomous session; owner review pending) ·
**Ships as:** `@tribeunal/mcp-server` **2.0.0** (breaking: tools renamed and removed) + app backend
branch `feat/mcp-lifecycle-api` (new endpoints + one FK migration; deploy app → worker image → worker
node before the Worker/npm release).

## 1. Why

Glama's Tool Definition Quality Score for `tribeunal/mcp-server` is **A 3.6/5.0** (2026-09-13, 39 tools).
`overall = 0.7 × descriptionQuality + 0.3 × coherence`; `descriptionQuality = 0.6 × mean(tool) + 0.4 ×
min(tool)`; coherence = mean of Disambiguation 3, Naming 4, Tool count 2, Completeness 3. Tool scores
run 3.4 (`get_vote_stats`) to 4.9 (`mark_evidence`).

Glama's verbatim findings: (1) jury-duty reporting split across status/dashboard/allowance/history;
start/accept/join_jury adjacent; (2) eight `jury_duty_*` names are noun_verb; (3) 39 tools is heavy;
(4) no update/delete for cases, comments, tribes; no leave/remove jury; no remove tribe member.

Per-tool rubric: Purpose 25 %, Usage guidelines 20 % (when / when not / named alternatives),
Behavioral transparency 20 % (graded *relative to annotations*; contradicting an annotation is an
automatic 1), Parameter semantics 15 % (beyond the schema), Conciseness 10 %, Contextual
completeness 10 % (return shape matters — we ship no output schemas).

## 2. Targets

| Dimension | Now | Target | How |
|---|---|---|---|
| Disambiguation | 3 | 5 | one jury-duty status tool; `accept` dropped (a no-op, §2.1); `reject` absorbed by `leave_jury`; `get_vote_stats` dropped (strict subset of `get_case`); `get_current_user` folded into `get_user`; every sibling pair names the other |
| Naming | 4 | 5 | all `tribeunal_<verb>_<noun>`; `set_side_image` → `update_side_image` |
| Tool count | 2 | 2 (band unchanged) | 41 tools: 9 removed, 11 added. 26+ cannot be left without dropping domains; every fold is score-neutral here and is judged on Disambiguation only |
| Completeness | 3 | 5 | update/delete case, comment, tribe; update webhook (events/active); leave jury; remove tribe member; paginated "cases I am seated on" |
| min tool score | 3.4 | ≥ 4.5 | every description follows §6; the weakest survivors get explicit contracts (§4.14) |

### 2.1 Verified facts the design rests on
- `GET /api/jury-duty/status`, `/index`, `/allowance` return the same **11-key** `allowance` block
  (`daily_max, used_today, remaining_today, can_use, usage_percentage, reset_time, active_jury_duties,
  max_active_jury_duties, can_accept_more_juries, active_jury_usage_percentage, user_level`). `/index`
  adds `current_assignments` (hard-coded 3, states open/decision_pending only) + `assignments_total`;
  `/status` adds `request` + `queue` (only while waiting); `/allowance/history?days=` returns per-day rows.
  `start` refuses with 429 `daily_limit` OR `active_jury_limit`, so "can start" = `can_use &&
  can_accept_more_juries`.
- `JuryDutyRequest` statuses: `waiting|assigned|cancelled|expired` (legacy rows may carry other
  strings). `findActiveRequestForUser()` returns only `waiting`. The matchmaker seats on cases in
  `open` **and `jury_selection`** and marks the request `assigned` before accept/reject can run, so
  `accept` changes nothing and `reject`'s requeue branch never fires. `memberId` is returned by no tool.
- `get_case` carries `totalVotes` and per-side `totalVotes`/`votePercentage`; `GET /cases/{uuid}/votes`
  returns exactly that.
- `GET /api/users/{id}` and `/users/me` return the same five keys `{id (uuid), username, created_at,
  profile_url, is_ai}`; `{id}` resolves a UUID **or a username** (regression-locked by
  `ApiTrialTest::testGetUserByUsernameResolvesToUser`). The tribe roster (`/tribes/{uuid}/members`)
  returns usernames, never UUIDs.
- Trial FKs `ON DELETE NO ACTION`: `decision`, `evidence`, `jury_duty_request.assigned_trial_id`,
  `jury_invite.trial_id`, `member`, `reward_transactions`, `side`, `trial_vote`; CASCADE:
  `trial_activity`, `trial_attachment`, `trial_comment`, `trial_decision`, `trial_tag`. Doctrine
  orphan-removes member/side/vote/evidence/comment. `evidence_rating.evidence_id` **and
  `evidence_rating.side_id`** are NO ACTION (side_id nullable). `jury_invite.tribe_id` NO ACTION
  (deleting a tribe used to recruit a jury 500s today). Every new case has `reward_transactions`
  rows (`trial_creation`, `trial_creation_cost`). `revoke_vote` hard-deletes the vote row, so a vote
  count is not a record of past voting — `trial_activity` (`vote`, `vote_revoked`) is.
- Trial has ten states: `init? jury_selection open decision_pending closed decision_failed expired
  suspended reported review` (see `TrialInterface`); the last three are moderation states.
- `ScopeMap::ROUTE_SCOPES` is default-deny for POST/PUT/PATCH/DELETE; reuse an existing scope, never
  mint one. `api_webhooks_update` and `api_webhooks_rotate` are **deliberately unmapped** (URL
  repoint + secret minting would be an escalation of `create:trials`); tests pin that. An ApiResource
  `Patch` with `deserialize:false` needs no `application/merge-patch+json` (the content negotiator
  skips input-format checks when `canDeserialize()` is false); the Tribe `Patch` (default
  deserialization) does need it. Route-name keys work for ApiResource ops only when the op carries an
  explicit `name:`.
- `TrialComment.id` is a UUID; the table has no incoming FKs; `updatedAt` is bumped by mark/unmark;
  comment lookups by malformed id currently 500 (`find()` on a non-UUID) — preflight with
  `Uuid::isValid`. Comments can be posted in any case state. `ArbitrationFreeze::isFrozen(trial)`
  guards evidence on decided arbitration cases.
- `TrialActivitySubscriber` maps domain events → `TrialActivity` rows (`TYPE_*` constants + `TYPES`
  whitelist that the `types=` filter validates against); `JuryMemberAddedEvent` → `jury_joined`;
  `JuryMemberRemovedEvent` already exists (no activity handler yet). MCP `activity.ts` and both
  activity tools in `tools.ts` hard-code the event enum. Slugs are `updatable:false` on Trial and Tribe.
- `MemberRepository::countActiveJuryMembershipsForUser` (the active-jury cap) counts ROLE_JURY seats on
  open/decision_pending cases; `AiJurorQuotaService` counts Member ∪ TrialVote. `TrialVoteController::
  revoke` does not require a seat; `cast_vote` on an invited jury does.
- `doctrine:schema:validate` is already red on dev (pre-existing drift); only the `Mapping [OK]` half
  is a usable gate. Adding a PATCH op to `case` adds an `Accept-Patch` header to every item response of
  that resource.

## 3. The tool set (41)

Prefix `tribeunal_`. `R` readOnlyHint · `D` destructiveHint · `I` idempotentHint (§6 defines both).

**Cases (7)** `create_case` · `get_case` R I · `search_cases` R I · **`update_case`** I · **`delete_case`** D ·
`close_case` D · **`update_side_image`** I (was `set_side_image`)
**Verdicts & activity (3)** `await_verdict` R · `get_case_activity` R I · `await_case_activity` R
**Voting (2)** `cast_vote` · `revoke_vote` D
**Comments (4)** `post_comment` · `list_comments` R I · **`update_comment`** I · **`delete_comment`** D
**Evidence (4)** `list_evidence` R I · `mark_evidence` · `unmark_evidence` · `rate_evidence`
**Jury (6)** `invite_jurors` · `join_jury` · **`leave_jury`** D · `start_jury_duty` · `cancel_jury_duty` D ·
**`get_jury_duty_status`** R I
**Tribes (10)** `create_tribe` · `get_tribe` R I · `list_tribes` R I · **`update_tribe`** I · **`delete_tribe`** D ·
`join_tribe` · `leave_tribe` D · `invite_tribe_members` · `list_tribe_members` R I · **`remove_tribe_member`** D
**Users (1)** **`get_user`** R I (`userId` optional → own account)
**Webhooks (4)** `create_webhook` · `list_webhooks` R I · **`update_webhook`** I · `delete_webhook` D

### 3.1 Migration table (2.0.0 CHANGELOG)

| 1.x | 2.0.0 |
|---|---|
| `jury_duty_status`, `jury_duty_dashboard`, `jury_duty_allowance`, `jury_duty_history` | `get_jury_duty_status` (one call; `historyDays`, `assignmentsPage`, `assignmentsLimit` optional) |
| `jury_duty_start` / `jury_duty_cancel` | `start_jury_duty` / `cancel_jury_duty` |
| `jury_duty_accept` | removed — a matched seat is already yours; vote with `cast_vote` once the case is open |
| `jury_duty_reject` | `leave_jury` (case UUID, not memberId; requeues a matchmaker seat) |
| `get_vote_stats` | removed — `get_case` carries the same counts |
| `get_current_user` | `get_user` with no `userId` |
| `set_side_image` | `update_side_image` |

Every tool description's first sentence is rendered into the generated tool reference — write it to
stand alone.

## 4. Tool contracts

Only what is new or changes. Unchanged tools keep their parameters; every description is rewritten (§6).
`TribeunalAPIClient` method names are part of this contract (implementers on both sides use them).

### 4.1 `get_jury_duty_status` (R I)
Params: `historyDays` int 1–30 optional; `assignmentsPage` int ≥1 default 1; `assignmentsLimit` int
1–50 default 10. Client: `getJuryDutyStatus()` = `GET /jury-duty/status`,
`getJuryDutyIndex(page, limit)` = `GET /jury-duty/index?page=&limit=` (§5.6), and when `historyDays`
is set `getJuryDutyHistory(days)`. Returns one camelCase object:
```
{ request: {status, requestedAt, queue: {position, totalWaiting, estimatedWaitS} | null} | null,
  assignments: { cases: [{uuid, title, url, state, juryType, endsAt}], total, page, limit },
  allowance: { dailyMax, usedToday, remainingToday, canUseDailyAllowance, resetAt,
               activeJuries, maxActiveJuries, canAcceptMoreJuries, canStartSearch, userLevel },
  history?: [{date, used, max, remaining}] }
```
`canStartSearch = can_use && can_accept_more_juries` (computed here). The two `*_percentage` fields
are dropped as derivable. `assignments.cases` = every case where the caller holds a jury seat and
the case is `jury_selection`, `open` or `decision_pending`; a `jury_selection` seat is a match that
has not opened yet (vote once `state` is `open`; `await_case_activity` wakes on it). `request` is the
caller's *waiting* search or null — a seat that was matched shows up in `assignments`, not here.
`request.status` is passed through (legacy rows may carry other strings).

### 4.2 `start_jury_duty`, `cancel_jury_duty` (D)
Unchanged calls (`startJuryDuty()` `POST /jury-duty/start`, `cancelJuryDuty()` `DELETE /jury-duty/cancel`).
Descriptions: start enters an anonymous matchmaking queue for public cases (no case chosen), spends one
daily search, and answers 429 `daily_limit` / `active_jury_limit`; the seat arrives later, on a case
that may still be in `jury_selection` — poll `get_jury_duty_status` and vote once it is `open`. There
is no accept step. Cancel withdraws a *waiting* search (same-day refund); it does not touch a seat
already matched — that is `leave_jury`. Use `join_jury` when you already know the case.

### 4.3 `leave_jury` (D) — new
Params: `caseId`. Client `leaveJury(caseId)` = **`POST /api/cases/{uuid}/jury/leave`** (§5.5). Returns
`{ left: true, requeued: boolean, case: {uuid, title, url} }`. Semantics: removes the caller's ROLE_JURY
seat. Refused once the caller has a vote on the case — 409 `already_voted` ("revoke it first with
`revoke_vote`") — so a seat can never be freed while its vote stays counted. If the seat came from
matchmaking (an `assigned` `JuryDutyRequest` of the caller for this case) and the caller has no other
*waiting* search, the request is put back in the queue with a fresh `requestedAt` (`requeued: true`);
otherwise that request is cancelled (`requeued: false`). Call `cancel_jury_duty` as well to stop
searching. Other refusals: 404 `not_a_juror`, 409 `voting_closed` (state ∉ {jury_selection, open}).
After leaving, `join_jury` seats you again. Sibling: `leave_tribe` (a tribe, not a case).

### 4.4 `get_user` (R I)
Params: `userId` — a user UUID **or username**, optional. Omitted → `getCurrentUser()` `GET /users/me`;
given → `getUser(id)` `GET /users/{id}`. Both return `{id, username, created_at, profile_url, is_ai}`;
the only difference is whose account. Unknown → 404. Allowances and jury seats live in
`get_jury_duty_status`. Do **not** add a UUID pattern to the parameter.

### 4.5 `update_case` (I) — new
Params: `caseId`; `title` (1–255), `description` (0–10000); at least one. Client `updateCase(caseId,
body)` = **`PATCH /api/cases/{uuid}`** (§5.1), plain JSON body. Returns the case exactly as `get_case`
does. Refusals: 403 `not_case_owner`, 409 `case_not_editable` (state ∉ {jury_selection, open} —
includes moderation states), 409 `title_locked` (title differs and a vote has ever been cast), 400
`field_not_editable` (any other key), 400 `invalid_request`. The edit is logged as a `trial_updated`
activity event; the URL/slug never changes. Sibling: `update_side_image` for a side's picture;
structural settings (jury size, deadline, visibility…) are fixed at `create_case`.

### 4.6 `delete_case` (D) — new
Params: `caseId`. Client `deleteCase(caseId)` = **`DELETE /api/cases/{uuid}`** (§5.2) → 204; tool
returns `{ deleted: true, uuid }`. Permanent: erases the case with its seats, comments, evidence marks,
ratings, activity feed and pending jury invitations. Allowed for the owner or an admin only while the
case is `jury_selection` or `open` **and no vote was ever cast** (a revoked vote still counts as
history) and no verdict exists; otherwise 409 `case_in_use` — "close it with `close_case` instead".
Moderation states refuse (`case_in_use`).

### 4.7 `update_comment` (I) — new
Params: `commentId` (UUID), `text` (1–5000). Client `updateComment(id, text)` = **`PATCH
/api/comments/{id}`** (§5.3). Author only. Returns the comment in the `list_comments` item shape plus
`editedAt`. Refusals: 404 `comment_not_found`, 403 `not_comment_author`, 403 `evidence_frozen`
(evidence-marked comment on a decided arbitration case), 400 `invalid_text`. The activity feed keeps
the original excerpt.

### 4.8 `delete_comment` (D) — new
Params: `commentId`. Client `deleteComment(id)` = **`DELETE /api/comments/{id}`** (§5.4) → 204; tool
returns `{ deleted: true, uuid }`. Author, case owner, or admin. Permanent; the feed entry is redacted.
Refusals: 404 `comment_not_found`, 403 `not_comment_author`, 409 `comment_is_evidence` (unmark first —
`unmark_evidence`; note the author cannot unmark their own comment, so a marked comment stays until
the owner or a juror unmarks it), 403 `evidence_frozen`.

### 4.9 `update_tribe` (I) — new
Params: `tribeId`; `name` (1–255), `description`, `intro` (≤255), `visibility` (`public|private`); at
least one. Client `updateTribe(tribeId, body)` = existing **`PATCH /api/tribes/{uuid}`** with
`Content-Type: application/merge-patch+json`, mapping `visibility` → `type` (1 public, 2 private);
the client sends only these keys (the backend accepts more — narrowing is client-side, recorded in
§8). Owner or admin (404 for outsiders, 403 for members). Returns the tribe as `get_tribe` does.
Private tribes disappear from `list_tribes` for non-members and become invitation-only.

### 4.10 `delete_tribe` (D) — new
Params: `tribeId`. Client `deleteTribe(tribeId)` = existing **`DELETE /api/tribes/{uuid}`** → 204; tool
returns `{ deleted: true, uuid }`. Owner or admin. Permanent: memberships and pending invitations go;
cases the tribe recruited jurors for are untouched (their invites lose the tribe link, §5.7).
Sibling: `leave_tribe` for a member who only wants out.

### 4.11 `remove_tribe_member` (D) — new
Params: `tribeId`; `username` (as shown by `list_tribe_members`). Client `removeTribeMember(tribeId,
username)` = **`DELETE /api/tribes/{uuid}/members/{user}`** (§5.8; `{user}` resolves a username or a
UUID). Owner or admin. Removes the membership and the user's pending invitations to this tribe; their
jury seats on existing cases stay. Refusals: 403 `not_tribe_owner`, 409 `cannot_remove_owner`, 404
`not_tribe_member`, 404 `user_not_found`. Returns `{ removed: true, tribe: {uuid}, user: {uuid,
username} }`. Siblings: `leave_tribe` (self), `invite_tribe_members` (the reverse).

### 4.12 `update_webhook` (I) — new
Params: `webhookId`; `events` (array, same enum as `create_webhook`) and/or `active` (boolean); at
least one. Client `updateWebhookDelivery(id, body)` = **`PATCH /api/webhooks/{uuid}/delivery`** (new,
§5.9 — a narrow route mapped to `create:trials`; the URL and the signing secret stay behind the
deliberately unmapped `PATCH /api/webhooks/{uuid}` / `rotate` routes). Returns the webhook in the
`list_webhooks` item shape. Description: "changes which events are delivered or pauses/resumes
delivery; the URL and secret cannot be changed here — delete and re-create with `create_webhook`."
`list_webhooks` loses its "or its secret is rotated" clause.

### 4.13 `get_case`
Unchanged call. Description states it carries `totalVotes`, per-side `totalVotes`/`votePercentage`
(the former `get_vote_stats`), `timeLeft`, `state`, `endsAt`, `sides[].uuid` (for `cast_vote`),
`shareUrl` (owner of a private case), and that it is the one-shot read — `await_verdict` /
`await_case_activity` block.

### 4.14 Weak survivors — required description elements
- `revoke_vote`: owner/juror constraint (you can only revoke your own vote), state guard (`voting_closed`),
  the revocation penalty on rewards (verify the code: `vote_revocation_penalty`), `sideId` must be the
  side you voted for (else 404 `no_vote_to_revoke`), return shape, and "to change your mind, revoke then
  `cast_vote` again"; destructiveHint true.
- `rate_evidence`: `evidenceId` comes from `list_evidence` item uuids (not comment ids); re-rating
  replaces the previous rating (verify — if it appends, say so and drop `idempotentHint`); frozen on
  decided arbitration cases; who may rate (owner/jury).
- `join_tribe` / `join_jury`: name each other ("a tribe is a standing group — joining seats you on no
  case; `join_jury` seats you on one case; a whole tribe can be recruited with `invite_jurors(tribeId)`").
- `cast_vote`: seat requirement on invited juries, `voting_closed`, `not_invited`, `ai_juror_limit`,
  `tag_access_required` codes; one vote per case; change via `revoke_vote`.
- `list_comments`, `list_evidence`, `list_tribe_members`, `list_tribes`, `list_webhooks`: pagination
  facts, ordering, the item keys, and the sibling that writes.
- `get_tribe` vs `list_tribe_members`: details vs roster (roster is member-only and paginated).
- `mark_evidence` / `unmark_evidence`: keep the 4.9 text; `unmark` names `mark` and `delete_comment`.
- `create_webhook`: name `update_webhook` and `delete_webhook`; secret shown once; events list.
- `create_case` / `invite_jurors`: keep the existing policy text (≤130 words), name `update_case`,
  `delete_case`, `join_jury`, `leave_jury` where they fit. `create_case` must not read as a subset of
  `update_side_image` (the linter's shadow warning).

## 5. Backend contracts (app repo, branch `feat/mcp-lifecycle-api`)

Conventions: `TrialRepository::findOneByUuid` (non-UUID → 404); typed JSON refusals
`{"error": "<code>", "message": "..."}`; `TrialViewVoter` 404-mask; tests extend `WebTestCase` with
`HTTP_X_API_KEY` like `tests/Controller/Api/TrialCommentApiControllerTest.php`; every mutating route
mapped in `ScopeMap::ROUTE_SCOPES` (§5.10); run console commands as `-u app`; never clear the dev cache.
The test database (`tribeunal_test`) is migrated with `-e APP_ENV=test` after adding a migration; the dev
database too (both are at `Version20260823130000`).

### 5.0 Activity plumbing (shared by 5.1 and 5.5)
`TrialActivity`: add `TYPE_TRIAL_UPDATED = 'trial_updated'` and `TYPE_JURY_LEFT = 'jury_left'` to the
constants **and** the `TYPES` whitelist. New `App\Event\TrialUpdatedEvent(Trial, User $actor, array
$changed)`; `TrialActivitySubscriber` gains `onTrialUpdated` (text = JSON `{"changed": [...]}`) and
`onJuryMemberRemoved` for the existing `JuryMemberRemovedEvent` (mirror `onJuryMemberAdded`; check what
else already listens to `JuryMemberRemovedEvent` so leave does not double-fire side effects). Whatever
listener publishes activity over Mercure for `jury_joined` must handle both new types the same way.
The API feed (`TrialActivityController`) serializes the type verbatim.

### 5.1 `PATCH /api/cases/{uuid}` — op name `api_cases_update`
API Platform `Patch` on `Trial` next to the `close` `Post`: `uriTemplate: '/cases/{uuid}'`, same uuid
`requirements`, `security: "is_granted('ROLE_USER')"`, `read: false, deserialize: false, validate:
false`, **no `output: false`**, `processor: TrialUpdateProcessor::class`, `name: 'api_cases_update'`.
New `App\Security\Voter\TrialEditVoter` (`EDIT`, `DELETE`: owner or `ROLE_ADMIN`, modelled on
`TrialCloseVoter`). Processor: 401 → `findOneByUuid` + TRIAL_VIEW → 404 → `EDIT` → 403
`not_case_owner` → body JSON (400 `invalid_request` if not an object) → any key outside
`{title, description}` → 400 `field_not_editable` → validate lengths/types → 400 `invalid_request` →
state ∉ {jury_selection, open} → 409 `case_not_editable` → `title` present, differs, and any
`trial_activity` row of type `vote`/`vote_revoked` exists **or** `totalVotes > 0` → 409 `title_locked`
→ apply, flush, dispatch `TrialUpdatedEvent` → return `DtoFactory::createTrial($trial)` (API
Platform serializes it like GET). Tests: new `tests/Controller/Api/TrialUpdateApiTest.php` (owner
200 + feed event; non-owner 403; closed 409; title with vote 409; description with vote 200; unknown
field 400; non-uuid 404) and rewrite `ApiTrialTest::testUpdateTrialViaApi` (asserts 405 today).

### 5.2 `DELETE /api/cases/{uuid}` — op name `api_cases_delete`
Same style, `processor: TrialDeleteProcessor::class`, `output: false`, voter `DELETE`. Rules: 401 →
404 → 403 `not_case_owner` → 409 `case_in_use` when state ∉ {jury_selection, open}, or `totalVotes >
0`, or any `vote`/`vote_revoked` activity exists, or `getDecision()`/decisions non-empty. Then a
`TrialDeletionService`: for every `JuryDutyRequest` with `assignedTrial = trial`: if status
`assigned` → status `waiting`, `assignedTrial = null`, `assignedAt = null`, `requestedAt = now`, but
only if that user has no other waiting request (else `cancelled`); `$em->remove($trial)`; flush
(ORM cascades member/side/vote/evidence/comment; DB rules from §5.7 handle jury_invite,
reward_transactions, evidence_rating, activity, attachments, tags). Response 204. Tests: new
`tests/Controller/Api/TrialDeleteApiTest.php` (owner 204 and rows gone incl. jury_invite + rating
with sideId + reward rows detached; case with a revoked vote 409; open case with vote 409; closed
409; non-owner 403; admin 204) and rewrite `ApiTrialTest::testDeleteTrialViaApi` (asserts 405).
Attachment files on disk: call the same cleanup the attachment delete endpoint uses if one exists;
otherwise leave files (record in §8).

### 5.3 `PATCH /api/comments/{id}` — `api_comments_update`
`TrialCommentController::update`. `Uuid::isValid($id)` else 404 `comment_not_found` (fix the shared
`find()` trap for mark/unmark too if it is a one-liner). Rules: 401 → 404 `comment_not_found` (also
TRIAL_VIEW denied) → 403 `not_comment_author` → 403 `evidence_frozen` (`isEvidence()` and
`ArbitrationFreeze::isFrozen`) → 400 `invalid_text` (reuse create's validation). Set text,
`editedAt = now` (new nullable column `edited_at`, migration), flush, 200 `serializeComment()` which
gains `editedAt` (null when never edited). No activity event. Tests in
`TrialCommentApiControllerTest.php` or a new `TrialCommentLifecycleApiTest.php`.

### 5.4 `DELETE /api/comments/{id}` — `api_comments_delete`
Rules: 401 → 404 → 403 `not_comment_author` unless case owner or admin → 409 `comment_is_evidence`
when `isEvidence()` → 403 `evidence_frozen`. Redact the matching `TrialActivity` row(s) (type
`comment`, `refUuid`/reference = comment id): set text to `null` (or `'[deleted]'` — match how the
feed renders null). Hard delete, 204. Tests: author 204; owner 204; stranger 403; evidence 409.

### 5.5 `POST /api/cases/{uuid}/jury/leave` — `api_cases_jury_leave`
`Api\TrialController::leaveJury`. Rules: 401 → 404 (case) → `MemberRepository::findOneByUserAndTrial`
with `role === ROLE_JURY` else 404 `not_a_juror` → 409 `voting_closed` (state ∉ {jury_selection,
open}) → 409 `already_voted` if `TrialVoteRepository` finds the caller's vote on the case. Then:
new `JuryDutyRequestRepository::findAssignedRequestForUserAndTrial(User, Trial)`; if found and
`findActiveRequestForUser($user) === null` → `status = waiting`, `assignedTrial = null`,
`assignedAt = null`, `requestedAt = now` (`requeued = true`); if found otherwise → `cancel()`
(`requeued = false`). `$em->remove($member)`; flush; dispatch `JuryMemberRemovedEvent` (§5.0).
Response 200 `{ left: true, requeued, case: {uuid, title, url} }` (absolute url, same helper the
API uses elsewhere). Mark `acceptJuryDuty`/`rejectJuryDuty` `@deprecated` in a comment; keep them (web
modal). Tests: `tests/Controller/Api/TrialJuryLeaveApiTest.php` (juror 200 + seat gone + `jury_left`
activity; matched seat requeues; matched seat with another waiting request cancels; voted 409;
closed 409; not a juror 404; owner-juror 200; re-join afterwards works).

### 5.6 `GET /api/jury-duty/index?page=&limit=` (existing `apiIndex`)
Add `page` (≥1, default 1) and `limit` (1–50, default 3 to keep the web dashboard unchanged);
`findTrialsAsJuryMember`/`countTrialsAsJuryMember` gain an optional `$states` argument; `apiIndex`
passes `[jury_selection, open, decision_pending]` and pagination; rows gain `url` (absolute) and
`endsAt`; response gains `page`, `limit`. The web dashboard keeps its current call (default states).
Test: `JuryDutyControllerTest` (or new) covering pagination and the jury_selection row.

### 5.7 Migration — FK delete rules + comment column
One migration (`VersionYYYYMMDDHHMMSS`): `jury_invite.trial_id` → CASCADE; `jury_invite.tribe_id` →
SET NULL; `jury_duty_request.assigned_trial_id` → SET NULL; `reward_transactions.trial_id` → SET NULL;
`evidence_rating.evidence_id` → CASCADE; `evidence_rating.side_id` → SET NULL; `trial_comment.edited_at`
TIMESTAMP NULL. Update the Doctrine `JoinColumn(onDelete:)` attributes on `JuryInvite`,
`JuryDutyRequest`, `RewardTransaction`, `EvidenceRating`, and the `TrialComment::$editedAt` field so
`doctrine:schema:validate` reports `Mapping [OK]` and `doctrine:migrations:diff` produces nothing for
these tables. `decision.trial_id` and `decision_sides.side_id` stay NO ACTION on purpose (we refuse
deletes once a verdict exists). Down migration restores NO ACTION. Deploy note: runs on prod before the
worker image and the worker node (192.168.1.9) restart.

### 5.8 `DELETE /api/tribes/{uuid}/members/{user}` — `api_tribes_remove_member`
`Api\TribeController::removeMember`. `{user}` = UUID or username (resolve like `UserStateProvider`).
Rules: 401 → 404 `tribe_not_found` (TRIBE_VIEW mask) → 403 `not_tribe_owner` (owner or admin) → 404
`user_not_found` → 409 `cannot_remove_owner` (target is the owner) → 404 `not_tribe_member` → reuse
`TribeMembershipService::removeMember` (it flushes and deletes pending invites). Response 200
`{ removed: true, tribe: {uuid}, user: {uuid, username} }`. Tests in `TribeApiControllerTest.php`.

### 5.9 `PATCH /api/webhooks/{uuid}/delivery` — `api_webhooks_update_delivery`
`WebhookEndpointController::updateDelivery`: owner only (same lookup as `update`), body keys
`events` (normalize via `WebhookEvents::normalize`, non-empty) and/or `active` (bool); any other key,
including `url`, → 400 `field_not_editable`. Returns the same JSON as `update`. Keep `update` and
`rotate` untouched and unmapped; update the ScopeMap comment (the MCP client now calls the narrow
route, still never the wide one). Tests: `WebhookEndpointControllerTest` (or wherever webhook tests
live): events/active 200; url 400; stranger 404/403 per existing convention.

### 5.10 Scopes and docs
`ScopeMap::ROUTE_SCOPES`: `api_cases_update`, `api_cases_delete`, `api_webhooks_update_delivery` →
`create:trials`; `api_comments_update`, `api_comments_delete` → `post:comments`; `api_cases_jury_leave`
→ `jury:duty`; `api_tribes_remove_member` → `manage:tribes`. Tribe PATCH/DELETE are already mapped.
Extend `tests/Unit/Security/Auth0/ScopeMapTest.php` accordingly (keep the assertion that
`api_webhooks_update` is unmapped). Docs: `docs/AUTH0_CONTRACT.md` (scope table + remove the stale
"GET /cases/{uuid}/votes has no route" gap item), `docs/TRIALS.md`, `docs/JURIES.md`,
`docs/WEBHOOKS.md`, `docs/INTEGRATION.md` where they list tools/endpoints, and the public
`templates/page/mcp.html.twig`: **four** literal "39" counts (lines ≈5, 16, 33, 315) → 41, and the
tool grid (≈320–365): drop `get_vote_stats`, `get_current_user`, the eight `jury_duty_*`, rename
`set_side_image`; add the ten new names and `get_jury_duty_status`/`start_jury_duty`/`cancel_jury_duty`.

## 6. Description house pattern (every tool)

**Length:** 55–90 words (4–6 sentences) for ordinary tools; ≤130 words for `create_case`,
`invite_jurors`, `create_webhook`. No schema restatement. Order:

1. **Purpose** — verb + resource + scope, phrased so it differs from every sibling.
2. **Behaviour the annotations cannot carry** — who may call it, what changes or is destroyed,
   reversibility, async follow-up, rate limits where verified (`update_side_image` 20/hour; the
   100 requests/hour API ceiling goes once into the server instructions), refusal codes and meaning.
3. **Parameters beyond the schema** — where an id comes from, defaults, interactions, units.
4. **Usage guidance with named siblings** — "use X for…; use `tribeunal_Y` when…; not for…".
5. **Return shape** — the keys an agent will read.

**Annotations** (all five on every tool: `title`, `readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`). Rule, stated once here and honoured in every verb choice:
*destructive = a resource or a relationship ceases to exist (delete, remove, leave, close, revoke,
cancel); overwriting a field is not destructive* — so `update_*` say "change", never "replace".
`destructiveHint: true` exactly on `delete_case`, `delete_comment`, `delete_tribe`, `delete_webhook`,
`remove_tribe_member`, `leave_tribe`, `leave_jury`, `close_case`, `revoke_vote`, `cancel_jury_duty`.
`idempotentHint: true` on every read-only tool and on `update_case`, `update_comment`, `update_tribe`,
`update_webhook`, `update_side_image`; on `mark_evidence`, `unmark_evidence`, `rate_evidence` only
after verifying in the app that a repeat call is a no-op/replace (else omit the hint). Never contradict
an annotation in prose.

Other required clauses: case files are uploaded from the case web page (no MCP tool); reopening a
case is an admin/web action; the webhook secret is shown once at creation and cannot be rotated over
MCP.

## 7. Everything else that changes (mcp-server)

- `src/core/tools.ts` (definitions + dispatch), `src/tools/*.ts` (zod; keep JSON Schema and zod in
  lock-step), `src/tools/activity.ts` + both activity tools' `types` enum (+ `trial_updated`,
  `jury_left`), `src/client/api-client.ts` (methods named in §4; a `patch(path, body, contentType?)`
  helper), `src/core/instructions.ts` — add one bullet in the existing register: "Every tool is
  tribeunal_<verb>_<noun>. tribeunal_get_user with no userId is your own identity — there is no
  separate current-user tool. tribeunal_get_case already carries totalVotes and each side's
  votePercentage. The API allows 100 requests per hour per caller."
- Tests: rename fallout in `tests/**`; new tests per new tool (mock client methods; assert path/body
  and returned text); `tests/tribe-members.test.ts` count pin → 41 with its maintenance comment
  extended to the full surface list (README, SKILL.md, llms.txt, llms-install.md, docs/examples.md,
  worker/README.md, server.json, gemini-extension.json, openclaw.plugin.json, app mcp.html.twig,
  app docs); a new `tests/tool-naming.test.ts` asserting every name matches `^tribeunal_(verb)_` with an
  explicit verb allow-list (`create get search update delete close await cast revoke post list mark
  unmark rate invite join leave start cancel remove`) and that every tool carries the five annotations.
- `npm run gen:skills` regenerated; `tests/skill-reference.test.ts` green.
- Skills: `serving-jury-duty` (start → poll `get_jury_duty_status` → vote when open; `leave_jury`,
  `cancel_jury_duty`; no accept, no memberId), `using-tribeunal` (identity = `get_user`; tool map;
  `references/errors.md` gains the new codes), `deciding-with-a-jury` (update/delete case),
  `acting-on-verdicts`, `convening-a-team-jury` (remove member, update/delete tribe),
  `arbitrating-a-dispute`, `wiring-webhooks` (`update_webhook`). `weighing-evidence` only if it names
  a renamed tool. Eval graders: `evals/using-tribeunal/identity-first/graders/checks-identity.md`
  (`get_current_user`) and the four `evals/serving-jury-duty/*/graders/no-pending-session.md`
  (`jury_duty_start`/`jury_duty_cancel`), plus any other grader naming a renamed tool. `evals/**/BASELINE.md`
  are historical records — untouched.
- Docs: `README.md`, `SKILL.md`, `llms.txt`, `llms-install.md` (its install-verification and
  destructive-tool-count sentences need rewriting, not a number swap), `docs/examples.md`,
  `worker/README.md`, `server.json`, `gemini-extension.json`, `CHANGELOG.md` (2.0.0 with §3.1),
  `src/core/stdio-register.ts` and `worker/src/mcp-agent.ts` count comments. `PRD.md` / `SUMMARY.md`
  untouched (historical).
- Version 2.0.0 in the nine version files (`package.json`, `package-lock.json`, `src/index.ts`,
  `worker/src/mcp-agent.ts`, `server.json` ×2, `openclaw.plugin.json`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`, `gemini-extension.json`).
- The v2-migration brief (`2026-09-12-mcp-v2-migration-design.md`) plans a golden 39-tool fixture; it
  must be rebuilt against this 41-tool set when that work starts.

## 8. Out of scope (recorded)

Webhook URL change and secret rotation over MCP (need a dedicated `manage:webhooks` scope minted in
the Auth0 tenant + Worker `AUTH0_SCOPE` + ScopeMap together — owner decision); `remove_juror` by the
case owner (deliberately absent: an owner must not curate a seated jury) and jury/tribe invite
revocation; `GET /api/jury-duty/statistics` 500; tribe `PUT` 500 and the structurally writable tribe
`owner` field (client narrows); `tribe.owner` IRI bug; output schemas / `structuredContent`; SDK v2;
toolsets; attachment files on disk after `delete_case` if no shared cleanup exists; the `launch/`
announcement drafts that say "39 tools" (owner's copy — "41 tools" if 2.0.0 ships before they post);
`PRD.md`/`SUMMARY.md`; the pre-existing `doctrine:schema:validate` drift.

## 9. Verification gate

mcp-server: `npm run build`, `npm run test:unit`, `npm run lint`, `cd worker && npm run type-check`
(after `cp .dev.vars.example .dev.vars` + `npm run cf-typegen` if needed), `npm run gen:skills` leaves
no diff, `npx -y mcp-tdqs lint --command "node dist/index.js" --fail-on warning` (accept the
`no-output-schema` infos; clear the `shadow-candidate` warning). App: `phpunit tests/Controller/Api
tests/Functional/ApiTrialTest.php tests/Unit/Security tests/Functional/Security` plus every new test
file, `phpstan analyse src --memory-limit=1G` (as `-u app`), `doctrine:schema:validate` → `Mapping
[OK]`, `psql` check of the six `confdeltype` values from §5.7. Live on dev through the stdio server
(`TRIBEUNAL_API_BASE_URL=https://tribeunal.test/api`, the CLAUDE.md API key, `TRIBEUNAL_VERIFY_SSL=false`):
create case → update → join jury (2nd user via impersonation or the `testuser2` key if one exists) →
leave → comment → edit → delete comment → delete case; tribe create → update → invite → remove member →
delete; webhook create → update events/active → delete; `get_jury_duty_status` (with history and
pagination); `get_user` both forms and by username. The LLM-judged `npx tdqs score` needs
`TDQS_BASE_URL`/`TDQS_API_KEY`/`TDQS_MODEL` (none configured here) — owner runs it or waits for Glama's
re-crawl. Finally an adversarial review of every description against §6 and of both diffs.
