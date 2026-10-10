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
    preferences?: ApprovedPreference[];
  }): AsyncIterable<string>;
}
export interface Runtime {
  id(): string;
  now(): string;
}

export interface SpeechToText {
  transcribe(wav: Uint8Array, signal: AbortSignal): Promise<string>;
}
export interface TextToSpeech {
  synthesize(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export class SpeechError extends Error {
  constructor(
    public readonly code:
      | 'SPEECH_UNAVAILABLE'
      | 'INVALID_AUDIO'
      | 'EMPTY_TRANSCRIPT',
    message: string,
  ) {
    super(message);
  }
}

export type PreferenceCategory = 'response_language' | 'response_style';
export interface ApprovedPreference {
  id: string;
  category: PreferenceCategory;
  value: string;
  approvedAt: string;
  source: 'operator';
  sourceConversationId: string | null;
}
export interface PreferenceRepository {
  list(): ApprovedPreference[];
  save(preference: ApprovedPreference): void;
  delete(id: string): boolean;
}

export interface LightStateEvent {
  id: string;
  deviceId: string;
  from: LightState;
  to: LightState;
  observedAt: string;
}
export interface AutomationRule {
  id: string;
  name: string;
  trigger: { deviceId: string; state: LightState };
  action: LightOperation;
  cooldownSeconds: number;
  enabled: boolean;
  createdAt: string;
}
export interface AutomationRun {
  id: string;
  rule: AutomationRule;
  event: LightStateEvent;
  conversationId: string;
  operationId: string | null;
  status: AuditEntry['status'];
  createdAt: string;
}
export interface AutomationRepository {
  list(): AutomationRule[];
  create(rule: AutomationRule): void;
  activate(id: string, enabled: boolean): boolean;
  delete(id: string): boolean;
  enabled(): boolean;
  setEnabled(enabled: boolean): void;
  beginEvent(event: LightStateEvent, now: string): boolean;
  claim(
    rule: AutomationRule,
    event: LightStateEvent,
    runId: string,
    conversationId: string,
    now: string,
  ): AutomationRun | undefined;
  finish(run: AutomationRun): void;
  runs(): AutomationRun[];
}
