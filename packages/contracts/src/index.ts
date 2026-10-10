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
export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['on', 'off', 'unavailable', 'unknown']),
  observedAt: z.iso.datetime().optional(),
  canControl: z.boolean().optional(),
});
export const deviceListSchema = z.array(deviceSchema);
export type Device = z.infer<typeof deviceSchema>;
export const deviceControlRequestSchema = lightOperationSchema
  .extend({
    conversationId: z.uuid().optional(),
  })
  .strict();
export const deviceControlResponseSchema = z.object({
  operationId: z.uuid(),
  conversationId: z.uuid(),
  device: deviceSchema,
});
export const deviceControlErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  operationId: z.uuid().optional(),
  conversationId: z.uuid().optional(),
  observedDevice: deviceSchema.optional(),
});
export const auditEntrySchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  deviceId: z.string(),
  state: z.enum(['on', 'off']),
  status: z.enum(['pending', 'succeeded', 'denied', 'failed', 'uncertain']),
  createdAt: z.iso.datetime(),
});
export const auditListSchema = z.array(auditEntrySchema);
