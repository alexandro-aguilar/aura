# Aura CSS design system implementation plan

Status: LG-01 through LG-06 local delivery complete. The [frontend visual specification](../specs/frontend-design.md) defines the system; CSS foundations, chat/composer and panel styling are implemented and [locally verified](../verification/frontend-design.md). LG-05 records explicit native-zoom and device acceptance gaps; the repository-local design skill is available for subsequent styling work.

## Reference-driven revision

The user rejected the original visual outcome and supplied [this Dribbble dashboard](https://dribbble.com/shots/26174948-Apple-Liquid-Glass-meets-Smart-Home-Vibes). The current implementation follows the photographic, translucent multi-column direction documented in the [current specification](../specs/frontend-design.md#current-direction--reference-driven-dashboard). The earlier composer-only delivery is historical, not acceptance of the current design. Backend behavior remains unchanged; no libraries were added.

## Original objective and scope

Give Aura a consistent Liquid Glass-inspired visual language using its existing React/Vite frontend and plain CSS. Preserve its sage/green identity and make conversation, voice and execution feedback visually recognizable as Aura's intelligence capabilities.

Deliver in small slices. Keep existing application behavior, content order, transport, device authorization and audit paths intact. Small JSX changes for scoped classes or state attributes are allowed; navigation redesign and component architecture changes are outside this plan.

No new runtime or development dependencies are required. Tailwind, Radix, Motion, Storybook and a screenshot automation framework are deferred. Consider them separately when a concrete requirement justifies the cost; follow AGENTS.md before major dependency or architecture changes.

## Current baseline

- `apps/web/src/style.css` contains global element rules and styles for chat, lights, voice and settings. Several selectors, including `section`, `article`, `input` and `button`, apply broadly.
- `apps/web/src/main.tsx` renders the connection status, lights, conversation and composer, followed by preferences, automations and voice.
- `VoicePanel.tsx`, `PreferencesPanel.tsx` and `AutomationsPanel.tsx` own their existing behaviors and state-dependent content.
- The app already has focus styling, disabled controls, live announcements, mock devices and mock speech. Preserve these capabilities throughout the styling work.
- Existing uncommitted changes must be inspected and preserved before implementation. Do not replace whole frontend files from a historical baseline.

## Design rules

1. Use glass selectively for control surfaces such as the composer and toolbars. Keep reading surfaces, forms, device details and audit text opaque or strongly tinted.
2. Define materials with semantic CSS custom properties: background tint, border, highlight, shadow, blur and saturation. Component rules consume tokens rather than duplicate material values.
3. Use restrained sage accents, system typography, consistent spacing and a small radius scale. Reserve full pills for compact controls and status indicators.
4. Express hierarchy through surface, spacing and typography before adding effects. Avoid stacked translucent panels and full-screen backdrop blur.
5. Keep status understandable through text and shape as well as color. Never make an unavailable or uncertain device look successfully controlled.
6. Provide opaque fallbacks and respect supported transparency, contrast and motion preferences. Native Apple accessibility settings are not automatically guaranteed to map to browser media queries.
7. Use short CSS transitions for interaction feedback. Avoid continuous decorative motion and animated blur or large shadows.

Reference: [Apple Materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) and [Liquid Glass overview](https://developer.apple.com/documentation/technologyoverviews/liquid-glass). These inform a web interpretation; matching Apple's native optical rendering is outside scope. Recheck relevant official CSS documentation and browser support when implementing fallbacks and media queries.

## Ordered implementation slices

### LG-01 — Write the visual specification

Completed: [frontend visual specification](../specs/frontend-design.md), linked from the specifications index. Includes the current surface/state inventory, concrete tokens and material recipes, interaction/accessibility requirements, and calculated contrast bounds. Rendered acceptance remains part of LG-05.

Deliver `docs/specs/frontend-design.md` and link it from the specifications index.

- Inventory the current surfaces and states, including panels hidden behind feature flags.
- Specify light and dark palettes, type scale, spacing, radii, border treatment and elevation.
- Define three material roles: content, glass controls and elevated overlays. Implement overlays only if an existing component needs them.
- Map each current UI region to its intended material and component style.
- Specify interaction and accessibility rules, including fallback behavior and minimum control sizing.
- Set a 44 CSS pixel target for primary touch controls. Require 4.5:1 contrast for normal text, 3:1 for large text, and 3:1 for relevant control boundaries and focus indicators.

Acceptance: every current panel has a documented material and state treatment; the specification contains concrete token values and examples, rather than only inspiration links. Contrast must be evaluated against composited backgrounds, not the nominal translucent color alone.

### LG-02 — Establish tokens and CSS structure

Completed on 2026-10-10: `styles/tokens.css`, `styles/base.css` and `styles/materials.css` are imported through `style.css`. Explicit cascade layers keep preference overrides above component/material rules. Existing colors use semantic tokens for light/dark readability; input and message selectors are scoped. Only two JSX classes were added; application behavior is unchanged. Glass is opt-in and will be applied to the composer in LG-03. Overlay tokens remain reserved without introducing an overlay component.

Validation: `yarn typecheck`, eight existing tests in `chat-connection.test.ts` and `voice-capture.test.ts`, touched-file Prettier checks, and `git diff --check` passed. The web production build passed with `PATH="$PWD/node_modules/.bin:$PATH" yarn workspace @aura/web build`; without the root binary directory the existing workspace script could not resolve root-owned `tsc`. `yarn install --immutable` completed without dependency changes.

Headless Chromium checks at 390px passed with HTTP/WebSocket fixtures: both themes, multiline chat rendering, native checkbox sizing, text-field minimum sizing, and no horizontal overflow. An isolated opt-in material fixture verified enhancement, opaque fallback by removing the support block, emulated reduced transparency, increased contrast, forced colors and reduced-motion precedence. Light/dark screenshots were inspected (temporary captures at `/private/tmp/aura-lg02-light.png` and `/private/tmp/aura-lg02-dark.png`). The connected Browser runtime had no available backend; local headless Chromium was used instead. These are foundation checks with fixtures, not live device/voice, Safari, physical-device or full LG-05 acceptance.

Add `apps/web/src/styles/tokens.css`, `base.css` and `materials.css`. Keep `style.css` as the stylesheet entry point and retain existing component rules there until they are migrated.

- Define semantic colors for canvas, content, glass, text, muted text, accent, borders, focus, success, warning and danger.
- Define shared spacing, typography, radii, shadows and motion values.
- Implement system-selected light/dark themes using `prefers-color-scheme`; an in-app theme picker is outside this pass.
- Start glass surfaces with a readable opaque background. Enable translucent tint and backdrop filtering inside a feature-support query.
- Add reduced-transparency, increased-contrast, forced-colors and reduced-motion handling where supported. Ensure the opaque baseline remains usable independently of those queries.
- Scope component selectors so form controls, conversation messages and settings do not accidentally inherit unrelated panel styles.

Acceptance: existing screens still work with the new stylesheet structure; tokens provide a consistent foundation in both themes; unsupported backdrop filtering produces a deliberate opaque surface. No new dependencies or behavior changes.

### LG-03 — Apply one vertical slice: chat and composer

Completed on 2026-10-10: glass composer, opaque messages/input, responsive shell spacing, connection/error/progress treatments, and enabled-only hover/pressed styling. A presentation scroll adjustment keeps the composer reachable after post-turn device refreshes. Build, typecheck, eight existing frontend tests and headless Chromium chat/state checks passed. Light/dark reference captures and remaining browser/device limits are recorded in [frontend design verification](../verification/frontend-design.md).

Update the chat shell, connection status, conversation messages, composer and errors in `style.css`. Add only necessary styling hooks in `main.tsx`.

- Apply the new canvas, typography, spacing and content width.
- Use a glass composer/control surface and readable content surfaces for messages.
- Differentiate user and Aura messages through restrained color and alignment.
- Style focus, hover, pressed, disabled, responding and disconnected states.
- Keep long responses, wrapping, scrolling and composer reachability usable on small screens and with the on-screen keyboard.

Acceptance: mock chat streams correctly; long content does not overflow; keyboard users can identify focus; disconnected and busy states remain clear. Capture this slice in light and dark themes before expanding the treatment.

### LG-04 — Extend to lights, voice and settings

Completed on 2026-10-10: lights, voice, preferences and automations use shared opaque surfaces, typography, controls and state treatments. Typed outcomes drive semantic colors; free-form mutation messages stay neutral. Secondary and consequential actions are distinct; consent gates, emergency stop, disabled states and live announcements are preserved. Build, typecheck, eight existing frontend tests and light/dark browser fixture checks passed. Panel references and integration/device limits are recorded in [frontend design verification](../verification/frontend-design.md).

Apply the same tokens and scoped styles to the existing device, voice, preferences and automations panels.

- Keep device state, observation time, direct-operation result and audit readable on stable surfaces.
- Style refresh, on/off, read-only, loading, unavailable, failure and uncertain outcomes distinctly where existing markup exposes those states.
- Style voice recording, processing, playback and recovery states without adding decorative perpetual animation.
- Bring text inputs, selects, checkboxes, consent labels and action buttons into the shared system.
- Preserve the visual prominence of activation, deletion, emergency stop and other consequential actions.
- Add state attributes only when existing state is already available. Do not refactor application state or infer success from color.

Acceptance: every current panel uses the shared tokens; existing grants, confirmations, disabled states and announcements retain their behavior. Mock speech and feature-enabled preference/automation flows remain usable.

### LG-05 — Validate and record evidence

Create `docs/verification/frontend-design.md` with screenshots, environment, commands, results and limitations.

- Inspect representative widths of 320, 390, 768 and 1440 CSS pixels, plus 200% zoom and long content.
- Check light/dark themes, keyboard focus, reduced motion, opaque fallback, increased contrast and forced colors where the test browser supports them.
- Measure text/control contrast on the actual rendered surfaces, including the least readable background beneath glass.
- Verify chat, direct light controls, refresh, errors and mock voice. Enable memory/automation features only in a controlled mock setup to inspect their panels.
- Inspect scrolling and input on Chromium and Safari/WebKit. Record actual mobile keyboard checks separately from desktop viewport emulation.
- Use browser performance tools during scrolling and streaming. If backdrop filtering causes sustained repainting or visible jank, reduce its area or use the opaque material.
- Capture reference screenshots for chat empty/streaming/error states, lights, voice and settings in both themes. Compare captures after later visual changes; automated screenshot tooling remains deferred.

Run `yarn workspace @aura/web build`, `yarn typecheck`, and Prettier checks on touched files. Run existing relevant tests if JSX or behavior-adjacent code changes. Do not add unit tests that merely repeat CSS values.

Acceptance: all affected flows pass, screenshots are reviewed, and browser/support gaps are explicitly recorded. Do not describe emulated preferences or viewport sizes as physical-device acceptance. Container validation is needed only if this work changes deployment or container configuration.

Completed locally: Chromium and WebKit checks, 46 reviewed reference captures, rendered contrast samples, a DevTools streaming/scrolling comparison and required build/typecheck/format/test checks are recorded in the [verification evidence](../verification/frontend-design.md#lg-05--cross-browser-validation). Fixed WebKit native selects rendering below the minimum control height. Native browser zoom, physical mobile keyboards/audio and target-device performance remain explicit manual acceptance gaps; local simulations do not close them. No dependencies or screenshot framework were added.

### LG-06 — Encode the settled rules for future work

After the implemented design has passed review, use the skill-creator workflow to create a repository-local `aura-frontend-design` skill in the supported location.

- Reference the visual specification, token files and verified examples as the source of truth.
- Explain material selection, semantic token usage, selector scoping, state styling and visual verification.
- Include concrete examples from the finished chat/composer slice and a compact review checklist.
- Avoid duplicating token values in the skill or introducing a second styling system.

Acceptance: the skill can guide a subsequent frontend styling task using the actual implemented system. Its creation does not require adding a frontend library.

Completed: repository-local [aura-frontend-design skill](../../.agents/skills/aura-frontend-design/SKILL.md), with UI metadata and normal implicit selection enabled by default. It references implemented tokens/materials, chat/composer examples and LG-05 captures, covers scoped state styling and fallback precedence, and includes a compact verification checklist without duplicating token values. Skill structure, metadata, local links, token references and formatting were validated; source walkthroughs are recorded in the [LG-06 evidence](../verification/frontend-design.md#lg-06--reusable-design-skill). No frontend dependency or runtime change was needed. Existing LG-05 manual acceptance gaps remain open.

## Delivery gates

| Gate                  | Required outcome                                             |
| --------------------- | ------------------------------------------------------------ |
| Foundation            | LG-01 and LG-02: specification, tokens, themes and fallbacks |
| First visible slice   | LG-03: validated chat/composer treatment                     |
| Interface consistency | LG-04: existing panels use the same visual system            |
| Closure               | LG-05 and LG-06: verified evidence and reusable skill        |

Begin with LG-01 and LG-02, then validate chat before applying the system to other panels. Keep each slice independently reviewable and record completion only after its acceptance checks pass.
