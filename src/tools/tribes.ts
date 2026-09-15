import { z } from 'zod';

import { tribeUuid } from './uuid.js';

// Schema definitions
export const ListTribesSchema = z.object({
  query: z.string().optional().describe('Optional case-insensitive substring match against tribe name or description.'),
  page: z.number().min(1).default(1).describe('1-based page number, default 1.'),
  limit: z.number().min(1).max(100).default(20).describe('Results per page, default 20, capped at 100.'),
});

// Every tribe identifier is a UUID: the backend resolves tribes by their uuid
// column only, so a slug or the numeric `id` can never match and simply 404s.
// Rejecting here says WHICH field to use instead of returning a bare not-found.
export const GetTribeSchema = z.object({
  id: tribeUuid('Tribe UUID — the tribe\'s uuid field, not its slug or numeric id. Get one from tribeunal_list_tribes or a tribeunal_create_tribe response.'),
});

// Parameters for the tribeunal_list_tribe_members tool. The roster is member-only,
// so tribeId is a UUID just like every other tribe identifier; page/limit mirror the
// backend's clamp ([1,100]).
export const ListTribeMembersSchema = z.object({
  tribeId: tribeUuid('Tribe UUID whose roster to read — from tribeunal_list_tribes or tribeunal_get_tribe. You must be a member, the owner, or an admin.'),
  page: z.number().min(1).default(1).describe('1-based page number, default 1.'),
  limit: z.number().min(1).max(100).default(20).describe('Members per page, default 20, capped at 100.'),
});

export const JoinTribeSchema = z.object({
  tribeId: tribeUuid('Tribe UUID to join — from tribeunal_list_tribes. For a private tribe you must hold a pending invitation from its owner or an admin.'),
});

export const LeaveTribeSchema = z.object({
  tribeId: tribeUuid('Tribe UUID to leave — from tribeunal_list_tribes or tribeunal_get_tribe.'),
});

export const CreateTribeSchema = z.object({
  name: z.string().min(3).max(100).describe('Tribe name, 3–100 characters.'),
  description: z.string().min(10).describe('Tribe description, at least 10 characters.'),
  tags: z.array(z.string()).optional().describe('Tag strings for categorization. Verified: the backend controller does not currently persist this field — passing it has no effect, so omit it.'),
  isPublic: z
    .boolean()
    .default(true)
    .describe('Defaults to true (browsable, open to everyone). Pass false to create a private, invitation-only tribe (see tribeunal_invite_tribe_members).'),
});

// Parameters for the tribeunal_invite_tribe_members tool.
export const InviteTribeMembersSchema = z.object({
  tribeId: tribeUuid('UUID of the private tribe to invite into — from tribeunal_list_tribes. You must own it or be an admin.'),
  invitees: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe('1–50 usernames or email addresses. Each is resolved and reported independently, so one bad entry never fails the rest of the batch.'),
});

export const UpdateTribeSchema = z.object({
  tribeId: tribeUuid('Tribe UUID to change — from tribeunal_list_tribes or tribeunal_get_tribe. Must be the owner or an admin.'),
  name: z.string().min(1).max(255).optional()
    .describe('New name, 1–255 characters. Optional — omit fields you are not changing; at least one field is required overall.'),
  description: z.string().optional().describe('New description. Optional.'),
  intro: z.string().max(255).optional().describe('New short intro/tagline, up to 255 characters. Optional.'),
  visibility: z.enum(['public', 'private']).optional()
    .describe("'public' or 'private'. Optional; maps client-side to the tribe's internal type field."),
}).refine((v) => v.name !== undefined || v.description !== undefined || v.intro !== undefined || v.visibility !== undefined, {
  message: 'Provide at least one of name, description, intro or visibility to update the tribe',
});

export const DeleteTribeSchema = z.object({
  tribeId: tribeUuid('Tribe UUID to delete permanently — from tribeunal_list_tribes or tribeunal_get_tribe. Must be the owner or an admin.'),
});

export const RemoveTribeMemberSchema = z.object({
  tribeId: tribeUuid('Tribe UUID to remove the member from — from tribeunal_list_tribes. Must be the owner or an admin.'),
  username: z.string().min(1)
    .describe("The member's username as shown by tribeunal_list_tribe_members (a user UUID also works — the backend resolves either)."),
});
