export type DeviceBackend =
  | { mode: 'mock' }
  | {
      mode: 'home-assistant';
      url: string;
      token: string;
      lightIds: string[];
      writeLightIds: string[];
      timeoutMs: number;
      confirmationTimeoutMs: number;
    };
export interface SpeechConfig {
  mode: 'mock' | 'openai';
  transcriptionModel: string;
  speechModel: string;
  voice: string;
  language: string;
  timeoutMs: number;
  satelliteToken: string;
}
export interface Config {
  mode: 'mock' | 'openai';
  databasePath: string;
  host: string;
  port: number;
  webOrigin: string;
  apiKey: string;
  model: string;
  deviceBackend: DeviceBackend;
  speech: SpeechConfig;
  automationsEnabled: boolean;
  automationPollMs: number;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const automationFlag = env.AUTOMATIONS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(automationFlag))
    throw new Error('AUTOMATIONS_ENABLED must be true or false');
  const automationPollMs = Number(env.AUTOMATION_POLL_MS ?? 5000);
  if (
    !Number.isInteger(automationPollMs) ||
    automationPollMs < 1000 ||
    automationPollMs > 60000
  )
    throw new Error('AUTOMATION_POLL_MS must be 1000–60000');
  const mode = env.AGENT_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'openai')
    throw new Error('AGENT_MODE must be mock or openai');
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  const apiKey = env.OPENAI_API_KEY ?? '';
  if (mode === 'openai' && !apiKey.trim())
    throw new Error('OPENAI_API_KEY is required in openai mode');
  const speechMode = env.SPEECH_MODE ?? 'mock';
  if (speechMode !== 'mock' && speechMode !== 'openai')
    throw new Error('SPEECH_MODE must be mock or openai');
  if (speechMode === 'openai' && !apiKey.trim())
    throw new Error('OPENAI_API_KEY is required for OpenAI speech');
  const speechTimeout = Number(env.SPEECH_TIMEOUT_MS ?? 30000);
  if (
    !Number.isInteger(speechTimeout) ||
    speechTimeout < 100 ||
    speechTimeout > 60000
  )
    throw new Error('SPEECH_TIMEOUT_MS must be 100–60000');
  const language = env.SPEECH_LANGUAGE ?? 'en';
  if (!/^[a-z]{2}$/.test(language))
    throw new Error('SPEECH_LANGUAGE must be a two-letter language code');
  const voice = env.SPEECH_VOICE ?? 'coral';
  if (
    ![
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'onyx',
      'nova',
      'sage',
      'shimmer',
      'verse',
      'marin',
      'cedar',
    ].includes(voice)
  )
    throw new Error('Unsupported SPEECH_VOICE');
  const satelliteToken = env.SATELLITE_TOKEN ?? '';
  if (satelliteToken && !/^[A-Za-z0-9_-]{32,128}$/.test(satelliteToken))
    throw new Error(
      'SATELLITE_TOKEN must contain 32–128 URL-safe random characters',
    );
  const speech: SpeechConfig = {
    mode: speechMode,
    transcriptionModel:
      env.SPEECH_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe-2025-12-15',
    speechModel: env.SPEECH_TTS_MODEL ?? 'gpt-4o-mini-tts-2025-12-15',
    voice,
    language,
    timeoutMs: speechTimeout,
    satelliteToken,
  };
  if (!speech.transcriptionModel.trim() || !speech.speechModel.trim())
    throw new Error('Speech model IDs cannot be empty');
  const backend = env.DEVICE_BACKEND ?? 'mock';
  let deviceBackend: DeviceBackend;
  if (backend === 'mock') {
    deviceBackend = { mode: 'mock' };
  } else if (backend === 'home-assistant') {
    let url: URL;
    try {
      url = new URL(env.HA_URL ?? '');
    } catch {
      throw new Error('HA_URL must be an HTTP(S) origin');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        'HA_URL must be an HTTP(S) origin without credentials, path, query or fragment',
      );
    const token = (env.HA_TOKEN ?? '').trim();
    if (!token || /\s/.test(token))
      throw new Error('HA_TOKEN is required and must not contain whitespace');
    const lightIds = (env.HA_LIGHT_IDS ?? '').split(',').map((id) => id.trim());
    if (
      lightIds.length > 32 ||
      lightIds.some(
        (id) => !/^light\.[a-z0-9_]+$/.test(id) || id.length > 100,
      ) ||
      new Set(lightIds).size !== lightIds.length
    )
      throw new Error('HA_LIGHT_IDS must list 1–32 unique light entity IDs');
    const timeoutMs = Number(env.HA_TIMEOUT_MS ?? 5000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
      throw new Error('HA_TIMEOUT_MS must be an integer from 1 to 30000');
    const writeLightIds = (env.HA_WRITE_LIGHT_IDS ?? '').trim()
      ? (env.HA_WRITE_LIGHT_IDS ?? '').split(',').map((id) => id.trim())
      : [];
    if (
      new Set(writeLightIds).size !== writeLightIds.length ||
      writeLightIds.some((id) => !lightIds.includes(id))
    )
      throw new Error(
        'HA_WRITE_LIGHT_IDS must contain unique IDs from HA_LIGHT_IDS',
      );
    const confirmationTimeoutMs = Number(
      env.HA_CONFIRMATION_TIMEOUT_MS ?? 3000,
    );
    if (
      !Number.isInteger(confirmationTimeoutMs) ||
      confirmationTimeoutMs < 1 ||
      confirmationTimeoutMs > 30000
    )
      throw new Error(
        'HA_CONFIRMATION_TIMEOUT_MS must be an integer from 1 to 30000',
      );
    deviceBackend = {
      mode: 'home-assistant',
      url: url.origin,
      token,
      lightIds,
      writeLightIds,
      timeoutMs,
      confirmationTimeoutMs,
    };
  } else {
    throw new Error('DEVICE_BACKEND must be mock or home-assistant');
  }
  return {
    mode,
    port,
    apiKey,
    databasePath: env.DATABASE_PATH ?? './data/aura.sqlite',
    host: env.HOST ?? '127.0.0.1',
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    model: env.OPENAI_MODEL ?? 'gpt-5.4',
    deviceBackend,
    speech,
    automationsEnabled: automationFlag === 'true',
    automationPollMs,
  };
}
