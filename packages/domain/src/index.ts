export type LightState = 'on' | 'off';
export type DeviceState = LightState | 'unavailable' | 'unknown';
export interface Device {
  id: string;
  name: string;
  state: DeviceState;
  observedAt?: string;
  canControl?: boolean;
}
export class DeviceGatewayError extends Error {
  constructor(
    public readonly code:
      | 'DEVICE_UNAVAILABLE'
      | 'DEVICE_AUTH_FAILED'
      | 'DEVICE_RESPONSE_INVALID'
      | 'DEVICE_NOT_ALLOWED'
      | 'DEVICE_NOT_READY'
      | 'OPERATION_UNCERTAIN'
      | 'READ_ONLY',
    message: string,
    public readonly observedDevice?: Device,
  ) {
    super(message);
  }
}
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  createdAt: string;
}
export interface LightOperation {
  deviceId: string;
  state: LightState;
}
export interface AuditEntry extends LightOperation {
  id: string;
  conversationId: string;
  status: 'pending' | 'succeeded' | 'denied' | 'failed' | 'uncertain';
  createdAt: string;
}
export interface ConversationRepository {
  create(conversation: Conversation): void;
  exists(id: string): boolean;
  messages(id: string): Message[];
  append(message: Message): void;
}
export interface AuditRepository {
  record(entry: AuditEntry): void;
  finish(id: string, status: AuditEntry['status']): void;
  list(conversationId: string): AuditEntry[];
}
export interface DeviceGateway {
  list(): Promise<Device[]>;
  setLight(operation: LightOperation): Promise<Device>;
}
export interface OperationPolicy {
  authorize(operation: LightOperation): void;
}
export interface ChatAgent {
  stream(input: {
    conversationId: string;
    message: string;
    history: Message[];
  }): AsyncIterable<string>;
}
export interface Runtime {
  id(): string;
  now(): string;
}
