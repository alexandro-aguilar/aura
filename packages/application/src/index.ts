import type {
  AuditRepository,
  ChatAgent,
  ConversationRepository,
  DeviceGateway,
  LightOperation,
  OperationPolicy,
  Runtime,
} from '@aura/domain';
import { chatRequestSchema, lightOperationSchema } from '@aura/contracts';
import type { ChatEvent } from '@aura/contracts';

export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Default deny. The composition root explicitly grants only simulated lights.
export class MockLightPolicy implements OperationPolicy {
  constructor(private readonly allowedIds: ReadonlySet<string>) {}
  authorize(operation: LightOperation): void {
    if (!this.allowedIds.has(operation.deviceId)) {
      throw new ApplicationError(
        'FORBIDDEN',
        'This device operation is not authorized.',
      );
    }
  }
}

export class DeviceTools {
  constructor(
    private readonly devices: DeviceGateway,
    private readonly policy: OperationPolicy,
    private readonly audit: AuditRepository,
    private readonly runtime: Runtime,
  ) {}
  list() {
    return this.devices.list();
  }
  async setLight(conversationId: string, untrusted: unknown) {
    const operation = lightOperationSchema.parse(untrusted);
    const id = this.runtime.id();
    try {
      this.policy.authorize(operation);
    } catch (error) {
      this.audit.record({
        ...operation,
        id,
        conversationId,
        status: 'denied',
        createdAt: this.runtime.now(),
      });
      throw error;
    }
    // An audit failure prevents execution. Failures after execution stay visible as pending.
    this.audit.record({
      ...operation,
      id,
      conversationId,
      status: 'pending',
      createdAt: this.runtime.now(),
    });
    let result;
    try {
      result = await this.devices.setLight(operation);
    } catch (error) {
      this.audit.finish(id, 'failed');
      throw error;
    }
    this.audit.finish(id, 'succeeded');
    return result;
  }
}

export class ChatService {
  private readonly busy = new Set<string>();
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly agent: ChatAgent,
    private readonly runtime: Runtime,
  ) {}
  async *stream(untrusted: unknown): AsyncGenerator<ChatEvent> {
    const input = chatRequestSchema.parse(untrusted);
    const conversationId = input.conversationId ?? this.runtime.id();
    if (input.conversationId && !this.conversations.exists(conversationId)) {
      throw new ApplicationError('NOT_FOUND', 'Conversation not found.');
    }
    if (this.busy.has(conversationId)) {
      throw new ApplicationError(
        'BUSY',
        'This conversation already has a request in progress.',
      );
    }
    this.busy.add(conversationId);
    try {
      if (!input.conversationId)
        this.conversations.create({
          id: conversationId,
          createdAt: this.runtime.now(),
        });
      const history = this.conversations.messages(conversationId);
      this.conversations.append({
        id: this.runtime.id(),
        conversationId,
        role: 'user',
        content: input.message,
        createdAt: this.runtime.now(),
      });
      yield { type: 'started', conversationId };
      let message = '';
      for await (const text of this.agent.stream({
        conversationId,
        message: input.message,
        history,
      })) {
        message += text;
        yield { type: 'delta', text };
      }
      if (!message.trim())
        throw new ApplicationError(
          'EMPTY_RESPONSE',
          'The agent returned no text.',
        );
      this.conversations.append({
        id: this.runtime.id(),
        conversationId,
        role: 'assistant',
        content: message,
        createdAt: this.runtime.now(),
      });
      yield { type: 'done', conversationId, message };
    } finally {
      this.busy.delete(conversationId);
    }
  }
}
