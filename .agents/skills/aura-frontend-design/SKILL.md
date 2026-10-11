---
name: aura-frontend-design
description: Style or review Aura's React/Vite frontend using its existing Liquid Glass-inspired CSS tokens, materials, state treatments and visual references. Use for Aura layout, component styling and visual accessibility work; not for backend behavior or unrelated websites.
---

# Aura frontend design

Keep Aura calm, legible and recognizably sage/green. Conversation, deliberate voice and truthful execution feedback carry its intelligence identity. Use the existing plain CSS system within the requested scope; adding a frontend library or redesigning navigation is a separate decision.

## Read the implemented system

Paths below are relative to this skill directory; application paths in prose are relative to the repository root.

- Read the [visual specification](../../../docs/specs/frontend-design.md) for material placement, interaction rules and accessibility requirements.
- Read [tokens.css](../../../apps/web/src/styles/tokens.css) for authoritative token values in both themes. Read [base.css](../../../apps/web/src/styles/base.css) and [materials.css](../../../apps/web/src/styles/materials.css) before changing shared controls or materials.
- Inspect [style.css](../../../apps/web/src/style.css) and the affected JSX: [main.tsx](../../../apps/web/src/main.tsx), [VoicePanel.tsx](../../../apps/web/src/VoicePanel.tsx), [PreferencesPanel.tsx](../../../apps/web/src/PreferencesPanel.tsx) or [AutomationsPanel.tsx](../../../apps/web/src/AutomationsPanel.tsx).
- Read the relevant LG-05 results and captures in the [verification record](../../../docs/verification/frontend-design.md#lg-05--cross-browser-validation). Earlier LG-03/LG-04 captures are historical. Use the [plan](../../../docs/plans/frontend-liquid-glass.md) to distinguish delivered work from remaining manual acceptance.

Treat the specification as intent, CSS/JSX as implemented behavior and the verification record as observed evidence. Resolve mismatches in the affected scope; do not silently introduce a parallel recipe. Keep token values in the token file rather than copying a palette or geometry table into this skill.

## Choose surfaces and tokens

| Need                                                       | Existing treatment                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Messages, lights, voice, preferences, automations, errors  | Opaque `--aura-surface-content`; no blur on reading panels          |
| User messages, secondary groups, neutral operation notices | `--aura-surface-subtle`; text remains readable                      |
| Chat control layer                                         | `.aura-material-glass` on the composer wrapper; opaque input inside |
| Future custom overlay                                      | Reserved overlay tokens; no overlay component exists yet            |

Keep glass limited to the composer unless the requested change establishes another control-layer need and verifies it. Avoid nested glass, blurred device tiles, full-page blur and animated filters. Reuse the supported/prefixed enhancement and opaque fallback in `materials.css`; do not reproduce the recipe per component.

Use semantic `--aura-*` variables for typography, spacing, geometry, surfaces and motion. Primary actions use `accent`/`on-accent`; secondary actions use content/text with `border-control`; consequential actions use `.action-danger` with danger text/border on content. Use `border` for decorative separators and `border-control` for an interactive boundary. Preserve disabled text/background rules when extending variants; do not fade whole controls with opacity.

Keep layer order `tokens, base, components, materials, accessibility`. Put component layout/state rules in the existing `components` layer and shared preference overrides in `accessibility`. Avoid unlayered rules or specificity that defeats the preference overrides. Extend existing selectors before adding new component-specific classes.

Scope article, field and action selectors to their region. `.conversation > article` must not style settings entries; composer field rules must not enlarge checkboxes. Shared settings rules may cover both settings panels, with `.preferences-panel` or `.automations-panel` for differences. Preserve native controls and the explicit token-derived select height: LG-05 found WebKit ignored native popup `min-height` alone.

## Follow the finished chat/composer example

In `main.tsx`, conversation articles retain their role class, visible role label and message paragraph. The implemented CSS keeps each article opaque and handles long content:

```css
@layer components {
  .conversation > article {
    background: var(--aura-surface-content);
    border: var(--aura-border-width) solid var(--aura-border);
    border-radius: var(--aura-radius-message);
    padding: var(--aura-space-4) var(--aura-space-5);
  }

  .conversation > article p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
```

The existing form uses `className="chat-form aura-material-glass"` and `data-busy={busy || voiceBusy}`. Its `.composer` contains an opaque input and primary Send button. This is the composition to reuse: canvas → opaque messages → glass wrapper → opaque controls. Reuse these classes and material rather than copying the example as a second CSS block.

Preserve the current submit handler, refs and disabled expressions when styling this form. The composer stays in document flow. Its pending scroll waits for response/voice/device refresh to settle so late device rows do not push the input out of reach. Check that behavior before changing conversation bounds or scroll margins; avoid fixing the composer to the viewport as a styling shortcut.

## Express existing state truthfully

Use existing typed state attributes (`data-connection`, `data-state`, `data-busy`, `data-phase`, `data-outcome`) when they express the needed distinction. Do not infer outcome from English text or an operator's click.

- Confirmed `succeeded` outcomes use success; `pending`, `denied` and `uncertain` use warning; `failed` uses danger. Retain the textual label, observation time and recovery/audit access.
- Unstructured mutation messages remain neutral `.panel-notice` copy. A completed HTTP request alone does not justify a success indicator.
- Keep hover/pressed styling restricted to enabled controls; focus appears immediately. Preserve Working/Refreshing/responding labels, disabled gates and native checked states.
- Recording has a static danger marker and phase text. Preserve the distinction between discarding a recording, submitting a turn and stopping playback.
- Preserve consent/reset rules, grants, read-only states and emergency-stop availability. Styling does not authorize changes to execution, retries or feature flags. Keep labels, live regions, alerts and DOM focus order intact.

## Verify the affected slice

Use the [verification procedures and reference captures](../../../docs/verification/frontend-design.md) rather than introducing a screenshot framework. Scale the checks to the change: a local spacing edit needs affected-state review; shared material/token/control edits need both themes, impacted panels and preference modes. Do not add tests that only restate CSS values.

Compact review checklist:

- [ ] Reuse existing semantic tokens/materials, scoped selectors and layer precedence; add no second palette or styling system.
- [ ] Check affected empty, busy, disabled, error and long-content states in light/dark; preserve truthful feedback and existing action conditions.
- [ ] Check 320/390/768/1440 CSS pixel widths, text resizing and 200% browser zoom where available; wrap action groups/IDs and keep input/focus reachable without horizontal page scroll.
- [ ] Inspect keyboard focus, primary target sizing, native selects/checkbox labels and unbroken multiline messages. Compare Chromium and Safari/WebKit when changing shared controls or scrolling.
- [ ] Check opaque unsupported-filter fallback, reduced transparency, increased contrast, reduced motion and forced colors where supported; keep automatic forced-color adjustment enabled.
- [ ] Measure rendered contrast when changing colors, tint, backdrop or filters, including highlights and the least readable background. Use the specification's text/control targets; blur and shadows do not establish contrast.
- [ ] Profile scrolling/streaming if blur area, filters or layout behavior change; reduce the glass area or use opaque content if sustained stalls appear.
- [ ] Review relevant captures against LG-05 under matching engine/theme/viewport/state/scroll conditions; record commands, results and support gaps in the verification record for material changes.

Run the web build and repository typecheck for frontend code changes:

```sh
PATH="$PWD/node_modules/.bin:$PATH" yarn workspace @aura/web build
yarn typecheck
```

Run Prettier on touched files and `git diff --check`. If JSX or behavior-adjacent code changes, run relevant existing tests; the chat/voice baseline is:

```sh
yarn vitest run apps/web/src/chat-connection.test.ts apps/web/src/voice-capture.test.ts
```

Keep memory/automation visual checks in controlled mocks/fixtures. Report headless WebKit, emulated preferences, CSS zoom, text resizing, viewport shrinking and stubbed audio as such. They do not close the recorded native browser zoom, physical mobile keyboard/audio or target-device performance gaps. Temporary LG-05 harness paths are historical session tooling, not portable repository test commands. Container checks are needed only when deployment/container configuration changes.
