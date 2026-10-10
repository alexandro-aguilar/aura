import type { FastifyInstance } from 'fastify';
import { ApplicationError, type AutomationService } from '@aura/application';
import { DeviceGatewayError } from '@aura/domain';
import { ZodError } from 'zod';
export function registerAutomations(
  app: FastifyInstance,
  service: AutomationService,
  reset: () => void,
) {
  app.get('/automations', async () => service.list());
  const execute = async (
    reply: import('fastify').FastifyReply,
    action: () => unknown,
  ) => {
    try {
      return action();
    } catch (error) {
      if (error instanceof ZodError)
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: 'Invalid automation or missing explicit consent.',
        });
      if (
        error instanceof ApplicationError ||
        error instanceof DeviceGatewayError
      )
        return reply
          .code(
            error.code === 'NOT_FOUND'
              ? 404
              : ['FORBIDDEN', 'READ_ONLY', 'DEVICE_NOT_ALLOWED'].includes(
                    error.code,
                  )
                ? 403
                : 409,
          )
          .send({ code: error.code, message: error.message });
      throw error;
    }
  };
  app.post('/automations', async (req, reply) =>
    execute(reply, () => service.create(req.body)),
  );
  app.post('/automations/control', async (req, reply) =>
    execute(reply, () => {
      const result = service.control(req.body);
      reset();
      return result;
    }),
  );
  app.post<{ Params: { id: string } }>(
    '/automations/:id/activation',
    async (req, reply) =>
      execute(reply, () => service.activate(req.params.id, req.body)),
  );
  app.post<{ Params: { id: string } }>(
    '/automations/:id/dry-run',
    async (req, reply) =>
      execute(reply, () => service.dryRun(req.params.id, req.body)),
  );
  app.delete<{ Params: { id: string } }>(
    '/automations/:id',
    async (req, reply) =>
      execute(reply, () => {
        service.delete(req.params.id);
        return reply.code(204).send();
      }),
  );
}
