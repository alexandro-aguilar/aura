import type {
  AuditRepository,
  ChatAgent,
  ConversationRepository,
  DeviceGateway,
  LightOperation,
  OperationPolicy,
  Runtime,
} from '@aura/domain';
import { DeviceGatewayError } from '@aura/domain';
import {
  chatRequestSchema,
  lightOperationSchema,
  deviceControlRequestSchema,
} from '@aura/contracts';
import type { ChatEvent } from '@aura/contracts';

export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Default deny. Only the composition root supplies light grants.
export class AllowedLightPolicy implements OperationPolicy {
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

// Retain the MVP1 export for callers of the original mock policy.
export { AllowedLightPolicy as MockLightPolicy };

export class LightExecutionError extends Error {
  constructor(
    public readonly operationId: string,
    public readonly cause: unknown,
  ) {
    super(
      'Light execution did not complete. Inspect audit and device state before retrying.',
    );
  }
}

export class DeviceTools {
  private readonly busyDevices = new Set<string>();
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
    try {
      return (await this.executeLight(conversationId, untrusted)).device;
    } catch (error) {
      if (error instanceof LightExecutionError) throw error.cause;
      throw error;
    }
  }

  async executeLight(conversationId: string, untrusted: unknown) {
    const operation = lightOperationSchema.parse(untrusted);
    const id = this.runtime.id();
    let acquired = false;
    try {
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
      this.audit.record({
        ...operation,
        id,
        conversationId,
        status: 'pending',
        createdAt: this.runtime.now(),
      });
      let device;
      try {
        if (this.busyDevices.has(operation.deviceId))
          throw new ApplicationError(
            'BUSY',
            'This light already has an operation in progress.',
          );
        this.busyDevices.add(operation.deviceId);
        acquired = true;
        device = await this.devices.setLight(operation);
      } catch (error) {
        this.audit.finish(
          id,
          error instanceof DeviceGatewayError &&
            error.code === 'OPERATION_UNCERTAIN'
            ? 'uncertain'
            : 'failed',
        );
        throw error;
      }
      // If this write fails, the existing pending record preserves uncertainty.
      this.audit.finish(id, 'succeeded');
      return { operationId: id, device };
    } catch (error) {
      throw new LightExecutionError(id, error);
    } finally {
      if (acquired) this.busyDevices.delete(operation.deviceId);
    }
  }
}

export class DirectControlError extends ApplicationError {
  constructor(
    cause: unknown,
    public readonly conversationId: string,
    public readonly operationId?: string,
  ) {
    super(
      cause instanceof ApplicationError || cause instanceof DeviceGatewayError
        ? cause.code
        : 'OPERATION_FAILED',
      cause instanceof ApplicationError || cause instanceof DeviceGatewayError
        ? cause.message
        : 'The operation could not be completed. Inspect device state and audit before retrying.',
    );
    this.observedDevice =
      cause instanceof DeviceGatewayError ? cause.observedDevice : undefined;
  }
  readonly observedDevice;
}

/** Provider-independent control; reuses the exact tool authorization/audit boundary. */
export class DirectLightControl {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly tools: DeviceTools,
    private readonly runtime: Runtime,
  ) {}
  async execute(untrusted: unknown) {
    const input = deviceControlRequestSchema.parse(untrusted);
    const conversationId = input.conversationId ?? this.runtime.id();
    if (input.conversationId && !this.conversations.exists(conversationId))
      throw new ApplicationError('NOT_FOUND', 'Conversation not found.');
    if (!input.conversationId)
      this.conversations.create({
        id: conversationId,
        createdAt: this.runtime.now(),
      });
    try {
      const result = await this.tools.executeLight(conversationId, {
        deviceId: input.deviceId,
        state: input.state,
      });
      return { ...result, conversationId };
    } catch (error) {
      if (error instanceof LightExecutionError)
        throw new DirectControlError(
          error.cause,
          conversationId,
          error.operationId,
        );
      throw new DirectControlError(error, conversationId);
    }
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
