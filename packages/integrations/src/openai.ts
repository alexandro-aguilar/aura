import { OpenAIModel } from '@strands-agents/sdk/models/openai';

export function createOpenAIModel(apiKey: string, modelId: string) {
  if (!apiKey.trim())
    throw new Error('OPENAI_API_KEY is required in openai mode');
  return new OpenAIModel({ api: 'chat', apiKey, modelId });
}
