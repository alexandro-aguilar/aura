import { z } from 'zod';
const lightId = z
  .string()
  .regex(/^light\.[a-z0-9_]+$/)
  .max(100);
export const automationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    trigger: z
      .object({ deviceId: lightId, state: z.enum(['on', 'off']) })
      .strict(),
    action: z
      .object({ deviceId: lightId, state: z.enum(['on', 'off']) })
      .strict(),
    cooldownSeconds: z.number().int().min(60).max(86400).default(60),
  })
  .strict();
export const automationActivationSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(true), consent: z.literal(true) }).strict(),
  z.object({ enabled: z.literal(false) }).strict(),
]);
export const lightStateEventSchema = z
  .object({
    id: z.uuid(),
    deviceId: lightId,
    from: z.enum(['on', 'off']),
    to: z.enum(['on', 'off']),
    observedAt: z.iso.datetime(),
  })
  .strict()
  .refine((event) => event.from !== event.to, 'Expected a state transition');
export const automationRuleSchema = automationRequestSchema.extend({
  id: z.uuid(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const automationRunSchema = z.object({
  id: z.uuid(),
  rule: automationRuleSchema,
  event: lightStateEventSchema,
  conversationId: z.uuid(),
  operationId: z.uuid().nullable(),
  status: z.enum(['pending', 'succeeded', 'failed', 'denied', 'uncertain']),
  createdAt: z.iso.datetime(),
});
export const automationListSchema = z.object({
  available: z.boolean(),
  enabled: z.boolean(),
  rules: z.array(automationRuleSchema).max(16),
  runs: z.array(automationRunSchema).max(50),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;
export type AutomationRun = z.infer<typeof automationRunSchema>;
