import { z } from 'zod';
import { caseUuid, sideUuid } from './uuid.js';

const httpsImageUrl = z.string().url().refine((u) => u.startsWith('https://'), {
  message: 'Image URL must use https.',
}).describe('Public https URL of the source image; http, private/internal hosts and non-image content are rejected.');

export const UpdateSideImageSchema = z.object({
  caseId: caseUuid("The case's uuid field (from tribeunal_get_case), not its numeric id."),
  sideId: sideUuid("The uuid of the side to set the image on, from the case's sides[] array in tribeunal_get_case."),
  imageUrl: httpsImageUrl,
});
