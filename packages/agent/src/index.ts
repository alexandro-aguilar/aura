import type { ChatAgent, Message, ApprovedPreference } from '@aura/domain';
import type { DeviceTools } from '@aura/application';

// Deterministic local fixture, intentionally limited to documented commands.
export class MockChatAgent implements ChatAgent {
  constructor(
    private readonly tools: DeviceTools,
    private readonly options: { readOnly?: boolean; simulated?: boolean } = {},
  ) {}
  async *stream(input: {
    conversationId: string;
    message: string;
    history: Message[];
    preferences?: ApprovedPreference[];
  }) {
    const command =
      /^turn (on|off) (light\.[a-z0-9_]+|living room|bedroom)(?: light)?[.!]?$/i.exec(
        input.message,
      );
    let response: string;
    if (/^show preferences[.!]?$/i.test(input.message)) {
      response = input.preferences?.length
        ? input.preferences
            .map((entry) => `${entry.category}: ${entry.value}`)
            .join('; ')
        : 'No approved preferences are active.';
    } else if (command && this.options.readOnly) {
      response =
        'Home Assistant lights are read-only. Try "list devices" or "status".';
    } else if (command) {
      const state = command[1]?.toLowerCase() === 'on' ? 'on' : 'off';
      const target = command[2]?.toLowerCase();
      const deviceId = target?.startsWith('light.')
        ? target
        : target === 'bedroom'
          ? 'light.bedroom'
          : 'light.living_room';
      const device = await this.tools.setLight(input.conversationId, {
        deviceId,
        state,
      });
      response = `${device.name} light is ${device.state}${this.options.simulated === false ? '' : ' (mock)'}.`;
    } else if (/^(list devices|lights|status)[.!]?$/i.test(input.message)) {
      response = (await this.tools.list())
        .map((device) => `${device.name}: ${device.state}`)
        .join('; ');
    } else {
      response = this.options.readOnly
        ? 'Home Assistant lights are read-only. Try "list devices" or "status".'
        : this.options.simulated === false
          ? 'Try "list devices" or "turn on light.entity_id" using an authorized light ID.'
          : 'Local mock mode. Try "list devices", "turn on living room", or "turn off bedroom".';
    }
    for (const chunk of response.match(/\S+\s*/g) ?? []) yield chunk;
  }
}
