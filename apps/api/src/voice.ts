import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { VoiceService, ApplicationError } from '@aura/application';
import type { ChatService } from '@aura/application';
import type {
  ConversationRepository,
  Runtime,
  SpeechToText,
  TextToSpeech,
} from '@aura/domain';
import { SpeechError, DeviceGatewayError } from '@aura/domain';
import { MockSpeech, OpenAISpeech } from '@aura/integrations';
import {
  voiceRequestSchema,
  validateVoiceWav,
  VOICE_MAX_BYTES,
  VOICE_MAX_OUTPUT_BYTES,
  encodeBase64,
} from '@aura/contracts';
import type { VoiceEvent } from '@aura/contracts';
import type { Config } from './config.js';

export function registerVoice(
  app: FastifyInstance,
  config: Config,
  chat: ChatService,
  conversations: ConversationRepository,
  runtime: Runtime,
  tasks: Set<Promise<void>>,
  injected?: SpeechToText & TextToSpeech,
) {
  const provider =
    injected ??
    (config.speech.mode === 'mock'
      ? new MockSpeech()
      : new OpenAISpeech({ ...config.speech, apiKey: config.apiKey }));
  const service = new VoiceService(provider, provider, chat);
  let running = 0;
  app.get('/voice/capabilities', async () => ({
    mode: config.speech.mode,
    format: 'wav-pcm16-mono-16000',
    maxSeconds: 20,
  }));
  app.post(
    '/voice/turn',
    {
      bodyLimit: 4 * Math.ceil(VOICE_MAX_BYTES / 3) + 1024,
      onRequest: async (request, reply) => {
        // Browsers use the existing trusted localhost origin. Headless clients require a scoped token.
        if (request.headers.origin === config.webOrigin) return;
        const token =
          request.headers.authorization?.replace(/^Bearer /, '') ?? '';
        const expected = config.speech.satelliteToken;
        if (
          !expected ||
          !/^[A-Za-z0-9_-]{32,128}$/.test(token) ||
          token.length !== expected.length ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
        )
          return reply.code(401).send({
            code: 'UNAUTHORIZED',
            message: 'Satellite authentication required.',
          });
      },
    },
    async (request, reply) => {
      const parsed = voiceRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_AUDIO', message: 'Invalid voice upload.' });
      let wav: Uint8Array;
      try {
        wav = Uint8Array.from(Buffer.from(parsed.data.audioBase64, 'base64'));
        validateVoiceWav(wav);
      } catch {
        return reply.code(400).send({
          code: 'INVALID_AUDIO',
          message: 'Use 0.1–20 seconds of mono PCM16 WAV at 16 kHz.',
        });
      }
      if (
        parsed.data.conversationId &&
        !conversations.exists(parsed.data.conversationId)
      )
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Conversation not found.' });
      if (running >= 2)
        return reply.code(429).send({
          code: 'BUSY',
          message: 'Voice capacity is busy. No turn was accepted.',
        });
      const conversationId = parsed.data.conversationId ?? runtime.id();
      if (!parsed.data.conversationId)
        conversations.create({ id: conversationId, createdAt: runtime.now() });
      running++;
      const stream = new PassThrough();
      const disconnected = new AbortController();
      const close = () => disconnected.abort();
      reply.raw.once('close', close);
      stream.on('error', close);
      // Bound each provider call; client disconnect cancels recognition/TTS, never an accepted chat.
      const signal = disconnected.signal;
      const send = (event: VoiceEvent) => {
        if (!disconnected.signal.aborted && !stream.destroyed)
          stream.write(JSON.stringify(event) + '\n');
      };
      reply
        .header('Content-Type', 'application/x-ndjson')
        .header('Cache-Control', 'no-store')
        .header('X-Accel-Buffering', 'no');
      send({ type: 'accepted', conversationId });
      const task = (async () => {
        try {
          for await (const event of service.stream(
            wav,
            conversationId,
            signal,
          )) {
            if (event.type === 'speech') {
              if (event.wav.length > VOICE_MAX_OUTPUT_BYTES)
                throw new SpeechError(
                  'SPEECH_UNAVAILABLE',
                  'Audio exceeds playback limit. The text response is saved.',
                );
              send({
                type: 'audio',
                audioBase64: encodeBase64(event.wav),
                mimeType: 'audio/wav',
              });
            } else send(event);
          }
        } catch (error) {
          // Do not log audio, transcripts, credentials or vendor response objects.
          const known =
            error instanceof SpeechError ||
            error instanceof ApplicationError ||
            error instanceof DeviceGatewayError;
          const code = known ? error.code : 'VOICE_FAILED';
          request.log.warn({ code, conversationId }, 'Voice turn failed');
          send({
            type: 'error',
            code,
            message: known
              ? error.message
              : 'Voice turn failed. Inspect history, audit and device state before retrying.',
          });
        } finally {
          running--;
          reply.raw.off('close', close);
          stream.end();
        }
      })();
      tasks.add(task);
      void task.finally(() => tasks.delete(task));
      return reply.send(stream);
    },
  );
}
