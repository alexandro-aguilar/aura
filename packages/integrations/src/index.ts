import type { Device, DeviceGateway, LightOperation } from '@aura/domain';

export const MOCK_LIGHT_IDS = ['light.living_room', 'light.bedroom'] as const;
export class MockDeviceGateway implements DeviceGateway {
  private readonly devices = new Map<string, Device>([
    [
      'light.living_room',
      { id: 'light.living_room', name: 'Living room', state: 'off' },
    ],
    ['light.bedroom', { id: 'light.bedroom', name: 'Bedroom', state: 'off' }],
  ]);
  async list() {
    return [...this.devices.values()].map((device) => ({ ...device }));
  }
  async setLight(operation: LightOperation) {
    const device = this.devices.get(operation.deviceId);
    if (!device) throw new Error('Unknown mock light');
    const updated = { ...device, state: operation.state };
    this.devices.set(device.id, updated);
    return { ...updated };
  }
}
