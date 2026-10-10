import type {
  DeviceGateway,
  DeviceState,
  LightStateEvent,
  Runtime,
} from '@aura/domain';

// Snapshot transitions only, not an HA event history/replay queue. Reconnect/restart establish a new baseline.
export class DeviceStatePoller {
  private previous = new Map<string, DeviceState>();
  constructor(
    private readonly devices: DeviceGateway,
    private readonly runtime: Runtime,
  ) {}
  reset() {
    this.previous.clear();
  }
  async poll(): Promise<LightStateEvent[]> {
    try {
      const devices = await this.devices.list();
      const events: LightStateEvent[] = [];
      for (const device of devices) {
        const from = this.previous.get(device.id);
        const to = device.state;
        if (
          (from === 'on' || from === 'off') &&
          (to === 'on' || to === 'off') &&
          from !== to
        )
          events.push({
            id: this.runtime.id(),
            deviceId: device.id,
            from,
            to,
            observedAt: this.runtime.now(),
          });
      }
      this.previous = new Map(
        devices.map((device) => [device.id, device.state]),
      );
      return events;
    } catch (error) {
      this.reset();
      throw error;
    }
  }
}
