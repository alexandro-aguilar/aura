import type {
  AutomationRepository,
  AutomationRule,
  OperationPolicy,
  Runtime,
} from '@aura/domain';
import {
  automationRequestSchema,
  automationActivationSchema,
  lightStateEventSchema,
} from '@aura/contracts';
import { ApplicationError, DirectControlError } from './index.js';
import type { DirectLightControl } from './index.js';

export class AutomationService {
  constructor(
    private readonly repository: AutomationRepository,
    private readonly controls: DirectLightControl,
    private readonly policy: OperationPolicy,
    private readonly readIds: ReadonlySet<string>,
    private readonly runtime: Runtime,
    private readonly available: boolean,
  ) {}
  list() {
    return {
      available: this.available,
      enabled: this.repository.enabled(),
      rules: this.repository.list(),
      runs: this.repository.runs(),
    };
  }
  private rule(id: string) {
    const rule = this.repository.list().find((rule) => rule.id === id);
    if (!rule) throw new ApplicationError('NOT_FOUND', 'Rule not found.');
    return rule;
  }
  private authorize(rule: Pick<AutomationRule, 'trigger' | 'action'>) {
    if (!this.readIds.has(rule.trigger.deviceId))
      throw new ApplicationError(
        'FORBIDDEN',
        'Trigger light is not visible to this server.',
      );
    this.policy.authorize(rule.action);
  }
  create(untrusted: unknown) {
    const input = automationRequestSchema.parse(untrusted);
    this.authorize(input);
    const rules = this.repository.list();
    if (rules.length >= 16)
      throw new ApplicationError(
        'LIMIT',
        'At most 16 automation rules are supported.',
      );
    const edges = [...rules, input];
    const visits = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (visits.has(id))
        throw new ApplicationError(
          'CYCLE',
          'Rules cannot form a device cycle, including disabled rules.',
        );
      if (done.has(id)) return;
      visits.add(id);
      for (const edge of edges.filter((rule) => rule.trigger.deviceId === id))
        visit(edge.action.deviceId);
      visits.delete(id);
      done.add(id);
    };
    for (const edge of edges) visit(edge.trigger.deviceId);
    const rule = {
      ...input,
      id: this.runtime.id(),
      enabled: false,
      createdAt: this.runtime.now(),
    };
    this.repository.create(rule);
    return rule;
  }
  activate(id: string, untrusted: unknown) {
    const input = automationActivationSchema.parse(untrusted);
    const rule = this.rule(id);
    if (input.enabled) {
      if (!this.available)
        throw new ApplicationError(
          'DISABLED',
          'Automations are disabled by server configuration.',
        );
      this.authorize(rule);
    }
    this.repository.activate(id, input.enabled);
    return { ...rule, enabled: input.enabled };
  }
  control(untrusted: unknown) {
    const input = automationActivationSchema.parse(untrusted);
    if (input.enabled && !this.available)
      throw new ApplicationError(
        'DISABLED',
        'Automations are disabled by server configuration.',
      );
    this.repository.setEnabled(input.enabled);
    return { enabled: input.enabled };
  }
  delete(id: string) {
    if (!this.repository.delete(id))
      throw new ApplicationError('NOT_FOUND', 'Rule not found.');
  }
  dryRun(id: string, untrusted: unknown) {
    const event = lightStateEventSchema.parse(untrusted);
    const rule = this.rule(id);
    this.authorize(rule);
    return {
      matches:
        event.deviceId === rule.trigger.deviceId &&
        event.to === rule.trigger.state,
      authorized: true,
      active: this.available && this.repository.enabled() && rule.enabled,
      note: 'Preview only: no operation, audit, cooldown or deduplication is consumed. Runtime freshness, cooldown and rate limits are checked again on actual events.',
    };
  }
  async handle(untrusted: unknown) {
    const event = lightStateEventSchema.parse(untrusted);
    const now = this.runtime.now();
    const age = Date.parse(now) - Date.parse(event.observedAt);
    if (
      !this.available ||
      !this.repository.enabled() ||
      !this.readIds.has(event.deviceId) ||
      age < -2000 ||
      age > 10000
    )
      return;
    if (!this.repository.beginEvent(event, now)) return;
    for (const rule of this.repository.list()) {
      if (
        !rule.enabled ||
        rule.trigger.deviceId !== event.deviceId ||
        rule.trigger.state !== event.to
      )
        continue;
      if (
        !this.repository.enabled() ||
        Date.parse(this.runtime.now()) - Date.parse(event.observedAt) > 10000
      )
        break;
      // Durable atomic reservation precedes every physical attempt and survives restart; never replay pending runs.
      const run = this.repository.claim(
        rule,
        event,
        this.runtime.id(),
        this.runtime.id(),
        this.runtime.now(),
      );
      if (!run) continue;
      let result;
      try {
        result = await this.controls.execute({
          ...rule.action,
          conversationId: run.conversationId,
        });
      } catch (error) {
        const status =
          error instanceof DirectControlError &&
          ['OPERATION_UNCERTAIN', 'OPERATION_FAILED'].includes(error.code)
            ? 'uncertain'
            : error instanceof DirectControlError &&
                ['FORBIDDEN', 'READ_ONLY', 'DEVICE_NOT_ALLOWED'].includes(
                  error.code,
                )
              ? 'denied'
              : 'failed';
        this.repository.finish({
          ...run,
          status,
          operationId:
            error instanceof DirectControlError
              ? (error.operationId ?? null)
              : null,
        });
        continue;
      }
      this.repository.finish({
        ...run,
        status: 'succeeded',
        operationId: result.operationId,
      });
    }
  }
}
