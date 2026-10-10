import type { SpeechToText, TextToSpeech } from '@aura/domain';
import { SpeechError } from '@aura/domain';
import { chatRequestSchema } from '@aura/contracts';
import type { VoiceEvent } from '@aura/contracts';
import type { ChatService } from './index.js';

export class VoiceService {
  constructor(
    private readonly stt: SpeechToText,
    private readonly tts: TextToSpeech,
    private readonly chat: ChatService,
  ) {}
  async *stream(
    wav: Uint8Array,
    conversationId: string,
    signal: AbortSignal,
  ): AsyncGenerator<VoiceEvent | { type: 'speech'; wav: Uint8Array }> {
    yield { type: 'phase', phase: 'transcribing' };
    const transcript = await this.stt.transcribe(wav, signal);
    signal.throwIfAborted();
    const input = chatRequestSchema.safeParse({
      message: transcript,
      conversationId,
    });
    if (!input.success)
      throw new SpeechError(
        'EMPTY_TRANSCRIPT',
        'No usable speech was recognized. Record another deliberate turn.',
      );
    yield { type: 'transcript', text: input.data.message };
    signal.throwIfAborted();
    yield { type: 'phase', phase: 'responding' };
    // From here, always drain ChatService even after a disconnect. It may execute a tool.
    let message = '';
    for await (const event of this.chat.stream(input.data)) {
      if (event.type === 'delta') yield event;
      if (event.type === 'done') message = event.message;
    }
    yield { type: 'response', message };
    if (signal.aborted) return;
    yield { type: 'phase', phase: 'synthesizing' };
    // Text has already persisted; synthesis failure must never replay the chat/tool turn.
    const audio = await this.tts.synthesize(message.slice(0, 4000), signal);
    yield { type: 'speech', wav: audio };
    yield { type: 'done' };
  }
}
