import type {
  ConversationRepository,
  PreferenceRepository,
  Runtime,
} from '@aura/domain';
import { preferenceRequestSchema } from '@aura/contracts';
import { ApplicationError } from './index.js';

export class PreferenceService {
  constructor(
    private readonly repository: PreferenceRepository,
    private readonly conversations: ConversationRepository,
    private readonly runtime: Runtime,
  ) {}
  list() {
    return this.repository.list();
  }
  save(untrusted: unknown) {
    const input = preferenceRequestSchema.parse(untrusted);
    if (
      input.sourceConversationId &&
      !this.conversations.exists(input.sourceConversationId)
    )
      throw new ApplicationError('NOT_FOUND', 'Source conversation not found.');
    const existing = this.repository
      .list()
      .find((entry) => entry.category === input.category);
    const preference = {
      id: existing?.id ?? this.runtime.id(),
      category: input.category,
      value: input.value,
      source: 'operator' as const,
      sourceConversationId: input.sourceConversationId ?? null,
      approvedAt: this.runtime.now(),
    };
    this.repository.save(preference);
    return preference;
  }
  delete(id: string) {
    if (!this.repository.delete(id))
      throw new ApplicationError('NOT_FOUND', 'Preference not found.');
  }
}
