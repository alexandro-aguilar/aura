import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from './server.js';
import { readConfig } from './config.js';
import {
  AutomationService,
  AllowedLightPolicy,
  DeviceTools,
  DirectLightControl,
} from '@aura/application';
import {
  MockDeviceGateway,
  MOCK_LIGHT_IDS,
  DeviceStatePoller,
} from '@aura/integrations';
import { openPersistence } from '@aura/persistence';
import { DeviceGatewayError } from '@aura/domain';
import type { Runtime } from '@aura/domain';
const source = MOCK_LIGHT_IDS[0]!;
const target = MOCK_LIGHT_IDS[1]!;
const input = {
  name: 'Follow source',
  trigger: { deviceId: source, state: 'on' },
  action: { deviceId: target, state: 'on' },
  cooldownSeconds: 60,
};
const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
function fixture(path = ':memory:') {
  const db = openPersistence(path);
  cleanup.push(() => db.close());
  let clock = Date.parse('2026-10-10T00:00:00Z');
  const runtime: Runtime = {
    id: randomUUID,
    now: () => new Date(clock).toISOString(),
  };
  const devices = new MockDeviceGateway();
  const spy = vi.spyOn(devices, 'setLight');
  const grants = new Set<string>(MOCK_LIGHT_IDS);
  const policy = new AllowedLightPolicy(grants);
  const tools = new DeviceTools(devices, policy, db.audit, runtime);
  const service = new AutomationService(
    db.automations,
    new DirectLightControl(db.conversations, tools, runtime),
    policy,
    new Set(MOCK_LIGHT_IDS),
    runtime,
    true,
  );
  const event = () => ({
    id: randomUUID(),
    deviceId: source,
    from: 'off' as const,
    to: 'on' as const,
    observedAt: runtime.now(),
  });
  const activate = () => {
    const rule = service.create(input);
    service.activate(rule.id, { enabled: true, consent: true });
    service.control({ enabled: true, consent: true });
    return rule;
  };
  return {
    db,
    runtime,
    devices,
    spy,
    grants,
    service,
    event,
    activate,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}
describe('deterministic approved automations', () => {
  it('requires consent, rejects untrusted operations and cycles, dry-run has no side effects', () => {
    const f = fixture();
    const rule = f.service.create(input);
    expect(rule.enabled).toBe(false);
    expect(f.service.list().enabled).toBe(false);
    expect(() => f.service.activate(rule.id, { enabled: true })).toThrow();
    expect(() => f.service.control({ enabled: true })).toThrow();
    expect(() =>
      f.service.create({
        ...input,
        action: { deviceId: 'lock.front', state: 'on' },
      }),
    ).toThrow();
    expect(() =>
      f.service.create({
        ...input,
        trigger: { deviceId: target, state: 'on' },
        action: { deviceId: source, state: 'off' },
      }),
    ).toThrow(/cycle/);
    expect(f.service.dryRun(rule.id, f.event()).matches).toBe(true);
    expect(f.spy).not.toHaveBeenCalled();
    expect(f.db.automations.runs()).toEqual([]);
  });
  it('deduplicates parallel events, audits one attempt, rejects stale/future, enforces cooldown and emergency stop', async () => {
    const f = fixture();
    f.activate();
    const event = f.event();
    await Promise.all([f.service.handle(event), f.service.handle(event)]);
    expect(f.spy).toHaveBeenCalledTimes(1);
    const run = f.db.automations.runs()[0]!;
    expect(run.status).toBe('succeeded');
    expect(f.db.audit.list(run.conversationId)[0]?.status).toBe('succeeded');
    await f.service.handle(f.event());
    expect(f.spy).toHaveBeenCalledTimes(1);
    f.advance(61000);
    await f.service.handle({ ...f.event(), observedAt: event.observedAt });
    await f.service.handle({
      ...f.event(),
      observedAt: new Date(Date.parse(f.runtime.now()) + 3000).toISOString(),
    });
    expect(f.spy).toHaveBeenCalledTimes(1);
    await f.service.handle(f.event());
    expect(f.spy).toHaveBeenCalledTimes(2);
    f.service.control({ enabled: false });
    f.advance(61000);
    await f.service.handle(f.event());
    expect(f.spy).toHaveBeenCalledTimes(2);
  });
  it('rechecks authorization for every attempt and records denied operations', async () => {
    const f = fixture();
    f.activate();
    f.grants.delete(target);
    await f.service.handle(f.event());
    expect(f.spy).not.toHaveBeenCalled();
    const run = f.db.automations.runs()[0]!;
    expect(run.status).toBe('denied');
    expect(f.db.audit.list(run.conversationId)[0]?.status).toBe('denied');
  });
  it('reserves durably before writes; a storage failure never sends a physical command', async () => {
    const f = fixture();
    f.activate();
    vi.spyOn(f.db.automations, 'claim').mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(f.service.handle(f.event())).rejects.toThrow('disk full');
    expect(f.spy).not.toHaveBeenCalled();
  });
  it('leaves pending receipt if finalization fails and never replays the event', async () => {
    const f = fixture();
    f.activate();
    const event = f.event();
    vi.spyOn(f.db.automations, 'finish').mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(f.service.handle(event)).rejects.toThrow();
    await f.service.handle(event);
    expect(f.spy).toHaveBeenCalledTimes(1);
    expect(f.db.automations.runs()[0]?.status).toBe('pending');
  });
  it('records uncertainty without retry and emergency stop prevents later rules in a batch', async () => {
    const f = fixture();
    f.activate();
    const other = f.service.create({ ...input, name: 'Second' });
    f.service.activate(other.id, { enabled: true, consent: true });
    f.spy.mockImplementation(async () => {
      f.service.control({ enabled: false });
      throw new DeviceGatewayError('OPERATION_UNCERTAIN', 'Unknown outcome');
    });
    await f.service.handle(f.event());
    expect(f.spy).toHaveBeenCalledTimes(1);
    expect(f.db.automations.runs()).toHaveLength(1);
    expect(f.db.automations.runs()[0]?.status).toBe('uncertain');
  });
  it('configuration-level disable prevents global/rule activation and all execution', async () => {
    const server = await buildServer(
      readConfig({ DATABASE_PATH: ':memory:' }),
      { logger: false, automationPolling: false },
    );
    cleanup.push(() => server.app.close());
    const rule = server.automations.create(input);
    expect(() =>
      server.automations.activate(rule.id, { enabled: true, consent: true }),
    ).toThrow(/disabled/);
    expect(() =>
      server.automations.control({ enabled: true, consent: true }),
    ).toThrow(/disabled/);
    await server.pollAutomations();
    expect(server.automations.list().runs).toEqual([]);
  });
  it('retains rules, receipts, deduplication and emergency stop across restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-auto-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'db.sqlite');
    const first = fixture(path);
    first.activate();
    const event = first.event();
    await first.service.handle(event);
    // Close before reopening, remove its pending cleanup callback.
    cleanup.pop();
    first.db.close();
    const second = fixture(path);
    await second.service.handle(event);
    expect(second.spy).not.toHaveBeenCalled();
    expect(second.service.list().rules).toHaveLength(1);
    expect(second.service.list().runs).toHaveLength(1);
    second.service.control({ enabled: false });
    cleanup.pop();
    second.db.close();
    const third = fixture(path);
    expect(third.service.list().enabled).toBe(false);
  });
  it('does not replay a pending reservation after process restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-pending-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'db.sqlite');
    const first = fixture(path);
    const created = first.activate();
    const rule = first.db.automations.list().find((r) => r.id === created.id)!;
    const event = first.event();
    first.db.automations.beginEvent(event, first.runtime.now());
    expect(
      first.db.automations.claim(
        rule,
        event,
        randomUUID(),
        randomUUID(),
        first.runtime.now(),
      )?.status,
    ).toBe('pending');
    cleanup.pop();
    first.db.close();
    const second = fixture(path);
    await second.service.handle(event);
    expect(second.spy).not.toHaveBeenCalled();
    expect(second.db.automations.runs()[0]?.status).toBe('pending');
  });
  it('bounds the global rate to four attempts even with distinct approved rules', async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) {
      const rule = f.service.create({ ...input, name: `Rule ${i}` });
      f.service.activate(rule.id, { enabled: true, consent: true });
    }
    f.service.control({ enabled: true, consent: true });
    await f.service.handle(f.event());
    expect(f.spy).toHaveBeenCalledTimes(4);
  });
  it('polls only transitions, resets after failure and does not replay recovery state', async () => {
    const f = fixture();
    const poll = new DeviceStatePoller(f.devices, f.runtime);
    expect(await poll.poll()).toEqual([]);
    await f.devices.setLight({ deviceId: source, state: 'on' });
    expect(await poll.poll()).toHaveLength(1);
    vi.spyOn(f.devices, 'list').mockRejectedValueOnce(new Error('offline'));
    await expect(poll.poll()).rejects.toThrow();
    await f.devices.setLight({ deviceId: source, state: 'off' });
    expect(await poll.poll()).toEqual([]);
  });
  it('API supports inspect/create/dry-run/consent/disable/delete and an audited polled transition', async () => {
    const server = await buildServer(
      readConfig({ DATABASE_PATH: ':memory:', AUTOMATIONS_ENABLED: 'true' }),
      { logger: false, automationPolling: false },
    );
    cleanup.push(() => server.app.close());
    const request = (
      method: 'POST' | 'DELETE',
      url: string,
      payload?: unknown,
    ) =>
      server.app.inject({
        method,
        url,
        ...(payload === undefined
          ? {}
          : {
              payload: JSON.stringify(payload),
              headers: { 'content-type': 'application/json' },
            }),
      });
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: '/automations',
          headers: { origin: 'https://foreign.example' },
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    const rule = (await request('POST', '/automations', input)).json() as {
      id: string;
    };
    expect(
      (
        await request('POST', `/automations/${rule.id}/activation`, {
          enabled: true,
        })
      ).statusCode,
    ).toBe(400);
    await request('POST', `/automations/${rule.id}/activation`, {
      enabled: true,
      consent: true,
    });
    await request('POST', '/automations/control', {
      enabled: true,
      consent: true,
    });
    expect(
      (
        await request('POST', `/automations/${rule.id}/dry-run`, {
          id: randomUUID(),
          deviceId: source,
          from: 'off',
          to: 'on',
          observedAt: new Date().toISOString(),
        })
      ).json().matches,
    ).toBe(true);
    await server.pollAutomations();
    await server.devices.setLight({ deviceId: source, state: 'on' });
    await server.pollAutomations();
    expect(server.automations.list().runs[0]?.status).toBe('succeeded');
    expect(
      (await request('POST', '/automations/control', { enabled: false }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request('DELETE', `/automations/${rule.id}`)).statusCode,
    ).toBe(204);
  });
});
