import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import type { ChatAgent, Runtime } from '@aura/domain';
import {
  ApplicationError,
  ChatService,
  DeviceTools,
  MockLightPolicy,
} from '@aura/application';
import { MockChatAgent } from '@aura/agent';
import { chatRequestSchema } from '@aura/contracts';
import { MockDeviceGateway, MOCK_LIGHT_IDS } from '@aura/integrations';
import { openPersistence } from '@aura/persistence';
import type { Config } from './config.js';

function publicError(error: unknown) {
  if (error instanceof ApplicationError)
    return { code: error.code, message: error.message };
  return {
    code: 'AGENT_ERROR',
    message:
      'The request failed. Check the server logs and device state before retrying.',
  };
}

export async function buildServer(
  config: Config,
  options: { logger?: boolean; agent?: ChatAgent } = {},
) {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 16384 });
  const persistence = openPersistence(config.databasePath);
  const activeStreams = new Set<Promise<void>>();
  app.addHook('onClose', async () => {
    await Promise.allSettled(activeStreams);
    persistence.close();
  });
  const runtime: Runtime = {
    id: randomUUID,
    now: () => new Date().toISOString(),
  };
  const devices = new MockDeviceGateway();
  const tools = new DeviceTools(
    devices,
    new MockLightPolicy(new Set(MOCK_LIGHT_IDS)),
    persistence.audit,
    runtime,
  );
  let agent: ChatAgent = options.agent ?? new MockChatAgent(tools);
  if (!options.agent && config.mode === 'openai') {
    try {
      const { createOpenAIModel } = await import('@aura/integrations/openai');
      const { StrandsChatAgent } = await import('@aura/agent/strands');
      agent = new StrandsChatAgent(
        createOpenAIModel(config.apiKey, config.model),
        tools,
      );
    } catch (error) {
      await app.close();
      throw error;
    }
  }
  const chat = new ChatService(persistence.conversations, agent, runtime);
  await app.register(websocket, { options: { maxPayload: 16384 } });
  // Local single-user scaffold. Guard browser origins on both transports.
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && origin !== config.webOrigin)
      return reply.code(403).send({ error: 'Origin not allowed' });
  });
  app.get('/health', async () => {
    persistence.health();
    return { status: 'ok', mode: config.mode, devices: 'mock' };
  });
  app.get('/devices', async () => devices.list());
  app.get<{ Params: { id: string } }>(
    '/conversations/:id/messages',
    async (request, reply) => {
      if (!persistence.conversations.exists(request.params.id))
        return reply.code(404).send({ error: 'Conversation not found' });
      return persistence.conversations.messages(request.params.id);
    },
  );
  app.post('/chat', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid chat request' });
    try {
      for await (const event of chat.stream(parsed.data)) {
        if (event.type === 'done')
          return {
            conversationId: event.conversationId,
            message: event.message,
          };
      }
      throw new Error('Missing completion');
    } catch (error) {
      request.log.error({ err: error }, 'Chat request failed');
      const failure = publicError(error);
      return reply
        .code(
          failure.code === 'NOT_FOUND'
            ? 404
            : failure.code === 'BUSY'
              ? 409
              : 502,
        )
        .send(failure);
    }
  });
  app.get('/chat/stream', { websocket: true }, (socket, request) => {
    let busy = false;
    const send = (value: unknown) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(value));
    };
    // Attach synchronously so early client messages are not lost.
    socket.on('message', (raw) => {
      if (busy) {
        send({
          type: 'error',
          code: 'BUSY',
          message: 'Wait for the current response.',
        });
        return;
      }
      let input: unknown;
      try {
        input = JSON.parse(raw.toString());
      } catch {
        send({
          type: 'error',
          code: 'INVALID_REQUEST',
          message: 'Expected JSON.',
        });
        return;
      }
      const parsed = chatRequestSchema.safeParse(input);
      if (!parsed.success) {
        send({
          type: 'error',
          code: 'INVALID_REQUEST',
          message: 'Invalid chat request.',
        });
        return;
      }
      busy = true;
      const task = (async () => {
        try {
          for await (const event of chat.stream(parsed.data)) send(event);
        } catch (error) {
          request.log.error({ err: error }, 'Chat stream failed');
          send({ type: 'error', ...publicError(error) });
        } finally {
          busy = false;
        }
      })();
      activeStreams.add(task);
      void task.then(
        () => activeStreams.delete(task),
        (error: unknown) => {
          activeStreams.delete(task);
          request.log.error({ err: error }, 'WebSocket delivery failed');
        },
      );
    });
  });
  await app.ready();
  return { app, persistence, devices };
}
