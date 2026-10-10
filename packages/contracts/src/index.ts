import { z } from 'zod';

export const chatRequestSchema = z
  .object({
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1).max(4000),
  })
  .strict();
export const lightOperationSchema = z
  .object({
    deviceId: z.string().min(1).max(100),
    state: z.enum(['on', 'off']),
  })
  .strict();
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), conversationId: z.uuid() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    conversationId: z.uuid(),
    message: z.string(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
