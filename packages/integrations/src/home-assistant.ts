import { z } from 'zod';
import { DeviceGatewayError } from '@aura/domain';
import type { Device, DeviceGateway, LightOperation } from '@aura/domain';
import { setTimeout as delay } from 'node:timers/promises';

const stateSchema = z.object({
  entity_id: z.string(),
  state: z.enum(['on', 'off', 'unavailable', 'unknown']),
  attributes: z.object({ friendly_name: z.string().max(200).optional() }),
});

/** Narrow, allowlisted light adapter. Never accepts a caller-supplied service. */
export class HomeAssistantDeviceGateway implements DeviceGateway {
  constructor(
    private readonly config: {
      url: string;
      token: string;
      lightIds: readonly string[];
      writeLightIds?: readonly string[];
      timeoutMs: number;
      confirmationTimeoutMs?: number;
    },
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async list(): Promise<Device[]> {
    return Promise.all(this.config.lightIds.map((id) => this.read(id)));
  }

  private async read(
    id: string,
    timeoutMs = this.config.timeoutMs,
  ): Promise<Device> {
    try {
      const response = await this.fetch(
        new URL(`/api/states/${encodeURIComponent(id)}`, this.config.url),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            Accept: 'application/json',
          },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (response.status === 401 || response.status === 403)
        throw new DeviceGatewayError(
          'DEVICE_AUTH_FAILED',
          'Home Assistant rejected its server credentials.',
        );
      if (response.status === 404)
        return {
          id,
          name: id,
          state: 'unavailable',
          observedAt: new Date().toISOString(),
          canControl: this.config.writeLightIds?.includes(id) ?? false,
        };
      if (!response.ok)
        throw new DeviceGatewayError(
          'DEVICE_UNAVAILABLE',
          'Home Assistant is unavailable. Refresh to try again.',
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new DeviceGatewayError(
          'DEVICE_RESPONSE_INVALID',
          'Home Assistant returned an invalid light state.',
        );
      }
      const parsed = stateSchema.safeParse(payload);
      if (!parsed.success || parsed.data.entity_id !== id)
        throw new DeviceGatewayError(
          'DEVICE_RESPONSE_INVALID',
          'Home Assistant returned an invalid light state.',
        );
      return {
        id,
        name: parsed.data.attributes.friendly_name ?? id,
        state: parsed.data.state,
        observedAt: new Date().toISOString(),
        canControl: this.config.writeLightIds?.includes(id) ?? false,
      };
    } catch (error) {
      if (error instanceof DeviceGatewayError) throw error;
      // Do not propagate provider bodies, URLs, token-bearing headers or raw fetch errors.
      throw new DeviceGatewayError(
        'DEVICE_UNAVAILABLE',
        'Home Assistant could not be reached. Refresh to try again.',
      );
    }
  }

  private async uncertain(id: string): Promise<never> {
    let observed: Device | undefined;
    try {
      observed = await this.read(id);
    } catch {
      /* No snapshot is better than a stale one. */
    }
    throw new DeviceGatewayError(
      'OPERATION_UNCERTAIN',
      'The light operation may have completed. Inspect its state and audit before retrying.',
      observed,
    );
  }

  async setLight(operation: LightOperation): Promise<Device> {
    if (!this.config.writeLightIds?.length)
      throw new DeviceGatewayError(
        'READ_ONLY',
        'Home Assistant controls are read-only.',
      );
    if (
      !this.config.lightIds.includes(operation.deviceId) ||
      !this.config.writeLightIds.includes(operation.deviceId) ||
      !['on', 'off'].includes(operation.state)
    )
      throw new DeviceGatewayError(
        'DEVICE_NOT_ALLOWED',
        'This light operation is not allowed.',
      );
    const before = await this.read(operation.deviceId);
    if (before.state !== 'on' && before.state !== 'off')
      throw new DeviceGatewayError(
        'DEVICE_NOT_READY',
        'This light is unavailable or unknown. Refresh before operating it.',
        before,
      );
    let response: Response;
    try {
      response = await this.fetch(
        new URL(`/api/services/light/turn_${operation.state}`, this.config.url),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ entity_id: operation.deviceId }),
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );
    } catch {
      return this.uncertain(operation.deviceId);
    }
    // The service response can contain unrelated changes; only a new entity read confirms state.
    await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403)
      throw new DeviceGatewayError(
        'DEVICE_AUTH_FAILED',
        'Home Assistant rejected its server credentials.',
      );
    if (response.status === 400 || response.status === 404)
      throw new DeviceGatewayError(
        'DEVICE_NOT_READY',
        'Home Assistant rejected this light operation. Refresh its state.',
      );
    if (!response.ok) return this.uncertain(operation.deviceId);
    const deadline = Date.now() + (this.config.confirmationTimeoutMs ?? 3000);
    let observed: Device | undefined;
    while (Date.now() < deadline) {
      try {
        observed = await this.read(
          operation.deviceId,
          Math.max(1, Math.min(this.config.timeoutMs, deadline - Date.now())),
        );
      } catch {
        break;
      }
      if (observed.state === operation.state) return observed;
      await delay(Math.min(250, Math.max(0, deadline - Date.now())));
    }
    throw new DeviceGatewayError(
      'OPERATION_UNCERTAIN',
      'Home Assistant accepted the request but the requested light state was not confirmed. Inspect state before retrying.',
      observed,
    );
  }
}
