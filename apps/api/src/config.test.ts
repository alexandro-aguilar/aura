import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

const ha = {
  DEVICE_BACKEND: 'home-assistant',
  HA_URL: 'http://homeassistant.local:8123',
  HA_TOKEN: 'fixture-only',
  HA_LIGHT_IDS: 'light.kitchen, light.office',
};
describe('device backend configuration', () => {
  it('keeps mock devices independent of provider selection and ignores inactive HA configuration', () => {
    expect(readConfig({ HA_URL: 'bad' }).deviceBackend).toEqual({
      mode: 'mock',
    });
    expect(
      readConfig({ AGENT_MODE: 'openai', OPENAI_API_KEY: 'fixture-only' })
        .deviceBackend,
    ).toEqual({ mode: 'mock' });
  });
  it('normalizes explicit read-only HA configuration without enabling a cloud provider', () => {
    expect(readConfig(ha)).toMatchObject({
      mode: 'mock',
      deviceBackend: {
        mode: 'home-assistant',
        url: ha.HA_URL,
        token: ha.HA_TOKEN,
        lightIds: ['light.kitchen', 'light.office'],
        timeoutMs: 5000,
      },
    });
  });
  it.each([
    { DEVICE_BACKEND: 'other' },
    { HA_URL: '' },
    { HA_URL: 'file:///tmp/ha' },
    { HA_URL: 'http://user:password@ha.fixture' },
    { HA_URL: 'http://ha.fixture/api' },
    { HA_URL: 'http://ha.fixture/?token=secret' },
    { HA_URL: 'http://ha.fixture/#secret' },
    { HA_TOKEN: '' },
    { HA_TOKEN: 'token\nheader' },
    { HA_LIGHT_IDS: '' },
    { HA_LIGHT_IDS: 'lock.front_door' },
    { HA_LIGHT_IDS: 'light.a,light.a' },
    { HA_LIGHT_IDS: 'light.a,' },
    { HA_LIGHT_IDS: 'light.a/../../services' },
    {
      HA_LIGHT_IDS: Array.from({ length: 33 }, (_, i) => `light.a${i}`).join(
        ',',
      ),
    },
    { HA_TIMEOUT_MS: '0' },
    { HA_TIMEOUT_MS: '30001' },
    { HA_TIMEOUT_MS: 'NaN' },
    { HA_WRITE_LIGHT_IDS: 'light.other' },
    { HA_WRITE_LIGHT_IDS: 'light.kitchen,light.kitchen' },
    { HA_WRITE_LIGHT_IDS: 'light.kitchen,' },
    { HA_CONFIRMATION_TIMEOUT_MS: '0' },
    { HA_CONFIRMATION_TIMEOUT_MS: '30001' },
  ])('fails fast for invalid HA configuration: %j', (override) => {
    expect(() => readConfig({ ...ha, ...override })).toThrow();
  });
  it('defaults to no write grants and accepts only explicit subsets', () => {
    expect(readConfig(ha).deviceBackend).toMatchObject({
      writeLightIds: [],
      confirmationTimeoutMs: 3000,
    });
    expect(
      readConfig({ ...ha, HA_WRITE_LIGHT_IDS: 'light.office' }).deviceBackend,
    ).toMatchObject({ writeLightIds: ['light.office'] });
  });
});

describe('speech configuration', () => {
  it('keeps speech mode independent from the agent and defaults to safe fixtures', () => {
    expect(
      readConfig({ AGENT_MODE: 'openai', OPENAI_API_KEY: 'fixture' }).speech
        .mode,
    ).toBe('mock');
    expect(
      readConfig({ SPEECH_MODE: 'openai', OPENAI_API_KEY: 'fixture' }).mode,
    ).toBe('mock');
    expect(readConfig({}).speech).toMatchObject({
      language: 'en',
      voice: 'coral',
      satelliteToken: '',
    });
  });
  it.each([
    { SPEECH_MODE: 'other' },
    { SPEECH_MODE: 'openai' },
    { SPEECH_TIMEOUT_MS: '0' },
    { SPEECH_TIMEOUT_MS: '60001' },
    { SPEECH_TIMEOUT_MS: 'NaN' },
    { SPEECH_LANGUAGE: 'english' },
    { SPEECH_VOICE: 'unknown' },
    { SATELLITE_TOKEN: 'short' },
    { SATELLITE_TOKEN: 'x'.repeat(32) + '\n' },
    { SPEECH_TTS_MODEL: '' },
  ])('rejects invalid configuration: %j', (env) => {
    expect(() => readConfig(env)).toThrow();
  });
});

describe('independent MVP4 switches', () => {
  it('defaults to disabled memory and automations', () => {
    expect(readConfig({})).toMatchObject({
      memoryEnabled: false,
      automationsEnabled: false,
      automationPollMs: 5000,
    });
    expect(readConfig({ MEMORY_ENABLED: 'true' })).toMatchObject({
      memoryEnabled: true,
      automationsEnabled: false,
    });
    expect(readConfig({ AUTOMATIONS_ENABLED: 'true' })).toMatchObject({
      memoryEnabled: false,
      automationsEnabled: true,
    });
  });
  it.each([
    { MEMORY_ENABLED: 'yes' },
    { AUTOMATIONS_ENABLED: 'yes' },
    { AUTOMATION_POLL_MS: '999' },
    { AUTOMATION_POLL_MS: '60001' },
  ])('rejects invalid MVP4 settings: %j', (env) =>
    expect(() => readConfig(env)).toThrow(),
  );
});
