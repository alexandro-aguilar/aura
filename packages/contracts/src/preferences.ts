import { z } from 'zod';
const provenance = {
  consent: z.literal(true),
  sourceConversationId: z.uuid().optional(),
};
export const preferenceRequestSchema = z.discriminatedUnion('category', [
  z
    .object({
      category: z.literal('response_language'),
      value: z.enum(['en', 'es']),
      ...provenance,
    })
    .strict(),
  z
    .object({
      category: z.literal('response_style'),
      value: z.enum(['concise', 'detailed']),
      ...provenance,
    })
    .strict(),
]);
export const preferenceSchema = z.object({
  id: z.uuid(),
  category: z.enum(['response_language', 'response_style']),
  value: z.string(),
  source: z.literal('operator'),
  sourceConversationId: z.uuid().nullable(),
  approvedAt: z.iso.datetime(),
});
export const preferenceListSchema = z.object({
  enabled: z.boolean(),
  preferences: z.array(preferenceSchema).max(2),
});
export const memoryControlSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(true), consent: z.literal(true) }).strict(),
  z.object({ enabled: z.literal(false) }).strict(),
]);
export const memoryControlResponseSchema = z.object({ enabled: z.boolean() });
export type ApprovedPreference = z.infer<typeof preferenceSchema>;
