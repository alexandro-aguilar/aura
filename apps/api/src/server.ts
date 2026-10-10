import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import type {
  ChatAgent,
  Runtime,
  SpeechToText,
  TextToSpeech,
} from '@aura/domain';
import { DeviceGatewayError } from '@aura/domain';
import {
  ApplicationError,
  ChatService,
  DeviceTools,
  AllowedLightPolicy,
  DirectLightControl,
  DirectControlError,
  PreferenceService,
  AutomationService,
} from '@aura/application';
import { MockChatAgent } from '@aura/agent';
import {
  chatRequestSchema,
  deviceControlRequestSchema,
  preferenceRequestSchema,
} from '@aura/contracts';
import {
  HomeAssistantDeviceGateway,
  MockDeviceGateway,
  MOCK_LIGHT_IDS,
  DeviceStatePoller,
} from '@aura/integrations';
import { openPersistence } from '@aura/persistence';
import type { Config } from './config.js';
import { registerAutomations } from './automations.js';
import { registerVoice } from './voice.js';

function publicError(error: unknown) {
  if (error instanceof DirectControlError)
    return {
      code: error.code,
      message: error.message,
      conversationId: error.conversationId,
      operationId: error.operationId,
      observedDevice: error.observedDevice,
    };
  if (error instanceof ApplicationError || error instanceof DeviceGatewayError)
    return { code: error.code, message: error.message };
  return {
    code: 'AGENT_ERROR',
    message:
      'The request failed. Check the server logs and device state before retrying.',
  };
}
function operationStatus(code: string) {
  if (code === 'NOT_FOUND') return 404;
  if (['FORBIDDEN', 'READ_ONLY', 'DEVICE_NOT_ALLOWED'].includes(code))
    return 403;
  if (['BUSY', 'OPERATION_UNCERTAIN', 'DEVICE_NOT_READY'].includes(code))
    return 409;
  if (code.startsWith('DEVICE_')) return 503;
  return 502;
}

export async function buildServer(
  config: Config,
  options: {
    logger?: boolean;
    automationPolling?: boolean;
    agent?: ChatAgent;
    deviceFetch?: typeof globalThis.fetch;
    speech?: SpeechToText & TextToSpeech;
  } = {},
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
  const simulated = config.deviceBackend.mode === 'mock';
  const readOnly =
    config.deviceBackend.mode === 'home-assistant' &&
    config.deviceBackend.writeLightIds.length === 0;
  const devices =
    config.deviceBackend.mode === 'mock'
      ? new MockDeviceGateway()
      : new HomeAssistantDeviceGateway(
          config.deviceBackend,
          options.deviceFetch,
        );
  const policy = new AllowedLightPolicy(
    new Set(
      config.deviceBackend.mode === 'mock'
        ? MOCK_LIGHT_IDS
        : config.deviceBackend.writeLightIds,
    ),
  );
  const tools = new DeviceTools(devices, policy, persistence.audit, runtime);
  let agent: ChatAgent =
    options.agent ?? new MockChatAgent(tools, { readOnly, simulated });
  if (!options.agent && config.mode === 'openai') {
    try {
      const { createOpenAIModel } = await import('@aura/integrations/openai');
      const { StrandsChatAgent } = await import('@aura/agent/strands');
      agent = new StrandsChatAgent(
        createOpenAIModel(config.apiKey, config.model),
        tools,
        { readOnly, simulated },
      );
    } catch (error) {
      await app.close();
      throw error;
    }
  }
  const chat = new ChatService(
    persistence.conversations,
    agent,
    runtime,
    config.memoryEnabled ? persistence.preferences : undefined,
  );
  const preferenceService = new PreferenceService(
    persistence.preferences,
    persistence.conversations,
    runtime,
  );
  const controls = new DirectLightControl(
    persistence.conversations,
    tools,
    runtime,
  );
  const automations = new AutomationService(
    persistence.automations,
    controls,
    policy,
    new Set(
      config.deviceBackend.mode === 'mock'
        ? MOCK_LIGHT_IDS
        : config.deviceBackend.lightIds,
    ),
    runtime,
    config.automationsEnabled,
  );
  const poller = new DeviceStatePoller(devices, runtime);
  let polling: Promise<void> | undefined;
  let closing = false;
  const pollAutomations = (): Promise<void> => {
    if (
      closing ||
      !config.automationsEnabled ||
      !persistence.automations.enabled()
    ) {
      poller.reset();
      return Promise.resolve();
    }
    if (polling) return polling;
    polling = (async () => {
      for (const event of await poller.poll()) {
        if (closing) break;
        await automations.handle(event);
      }
    })().finally(() => {
      polling = undefined;
    });
    return polling;
  };
  const timer =
    config.automationsEnabled && options.automationPolling !== false
      ? setInterval(() => {
          void pollAutomations().catch(() =>
            app.log.error(
              'Automation polling failed; no event replay will occur.',
            ),
          );
        }, config.automationPollMs).unref()
      : undefined;
  app.addHook('onClose', async () => {
    closing = true;
    clearInterval(timer);
    await polling?.catch(() => {});
  });
  await app.register(websocket, { options: { maxPayload: 16384 } });
  // Local single-user scaffold. Guard browser origins on both transports.
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && origin !== config.webOrigin)
      return reply.code(403).send({ error: 'Origin not allowed' });
  });
  registerAutomations(app, automations, () => poller.reset());
  registerVoice(
    app,
    config,
    chat,
    persistence.conversations,
    runtime,
    activeStreams,
    options.speech,
  );
  app.get('/preferences', async () => ({
    enabled: config.memoryEnabled,
    preferences: preferenceService.list(),
  }));
  app.post('/preferences', async (request, reply) => {
    const parsed = preferenceRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        code: 'INVALID_REQUEST',
        message:
          'Choose an allowed preference and explicitly approve saving it.',
      });
    try {
      return preferenceService.save(parsed.data);
    } catch (error) {
      if (error instanceof ApplicationError)
        return reply.code(404).send(publicError(error));
      throw error;
    }
  });
  app.delete<{ Params: { id: string } }>(
    '/preferences/:id',
    async (request, reply) => {
      try {
        preferenceService.delete(request.params.id);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof ApplicationError)
          return reply.code(404).send(publicError(error));
        throw error;
      }
    },
  );
  app.get('/health', async () => {
    persistence.health();
    return {
      status: 'ok',
      mode: config.mode,
      devices: config.deviceBackend.mode,
    };
  });
  app.get('/devices', async (request, reply) => {
    try {
      return await devices.list();
    } catch (error) {
      request.log.error({ err: error }, 'Device listing failed');
      if (error instanceof DeviceGatewayError)
        return reply.code(503).send(publicError(error));
      throw error;
    }
  });
  app.post('/device-operations', async (request, reply) => {
    const parsed = deviceControlRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: 'INVALID_REQUEST', message: 'Invalid light operation.' });
    try {
      return await controls.execute(parsed.data);
    } catch (error) {
      request.log.error({ err: error }, 'Direct light operation failed');
      const failure = publicError(error);
      return reply.code(operationStatus(failure.code)).send(failure);
    }
  });
  app.get<{ Params: { id: string } }>(
    '/conversations/:id/audit',
    async (request, reply) => {
      if (!persistence.conversations.exists(request.params.id))
        return reply.code(404).send({ error: 'Conversation not found' });
      return persistence.audit.list(request.params.id);
    },
  );
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
  return { app, persistence, devices, automations, pollAutomations };
}
