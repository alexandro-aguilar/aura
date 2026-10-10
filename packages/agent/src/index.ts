import type { ChatAgent, Message } from '@aura/domain';
import type { DeviceTools } from '@aura/application';

// Deterministic local fixture, intentionally limited to documented commands.
export class MockChatAgent implements ChatAgent {
  constructor(private readonly tools: DeviceTools) {}
  async *stream(input: {
    conversationId: string;
    message: string;
    history: Message[];
  }) {
    const command =
      /^turn (on|off) (living room|bedroom)(?: light)?[.!]?$/i.exec(
        input.message,
      );
    let response: string;
    if (command) {
      const state = command[1]?.toLowerCase() === 'on' ? 'on' : 'off';
      const deviceId =
        command[2]?.toLowerCase() === 'bedroom'
          ? 'light.bedroom'
          : 'light.living_room';
      const device = await this.tools.setLight(input.conversationId, {
        deviceId,
        state,
      });
      response = `${device.name} light is ${device.state} (mock).`;
    } else if (/^(list devices|lights|status)[.!]?$/i.test(input.message)) {
      response = (await this.tools.list())
        .map((device) => `${device.name}: ${device.state}`)
        .join('; ');
    } else {
      response =
        'Local mock mode. Try "list devices", "turn on living room", or "turn off bedroom".';
    }
    for (const chunk of response.match(/\S+\s*/g) ?? []) yield chunk;
  }
}
