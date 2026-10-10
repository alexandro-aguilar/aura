export interface Config {
  mode: 'mock' | 'openai';
  databasePath: string;
  host: string;
  port: number;
  webOrigin: string;
  apiKey: string;
  model: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.AGENT_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'openai')
    throw new Error('AGENT_MODE must be mock or openai');
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  const apiKey = env.OPENAI_API_KEY ?? '';
  if (mode === 'openai' && !apiKey.trim())
    throw new Error('OPENAI_API_KEY is required in openai mode');
  return {
    mode,
    port,
    apiKey,
    databasePath: env.DATABASE_PATH ?? './data/aura.sqlite',
    host: env.HOST ?? '127.0.0.1',
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    model: env.OPENAI_MODEL ?? 'gpt-5.4',
  };
}
