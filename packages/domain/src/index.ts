export type LightState = 'on' | 'off';
export interface Device {
  id: string;
  name: string;
  state: LightState;
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
  status: 'pending' | 'succeeded' | 'denied' | 'failed';
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
