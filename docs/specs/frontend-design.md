# Aura frontend visual specification

Status: LG-01 through LG-06 local delivery complete: specification, CSS foundation, chat/composer, panels, recorded cross-browser evidence and the repository-local design skill. Native zoom/device acceptance gaps remain documented. Source inventory reviewed on 2026-10-10. Follow the [implementation plan](../plans/frontend-liquid-glass.md) and [verification evidence](../verification/frontend-design.md) for results and remaining work.

## Current direction — reference-driven dashboard

The user rejected both the initial composer-only styling and its visibility correction. The accepted implementation direction is now [Apple Liquid Glass meets Smart Home Vibes by Md Zia Uddin](https://dribbble.com/shots/26174948-Apple-Liquid-Glass-meets-Smart-Home-Vibes): a photographic room backdrop, translucent warm charcoal surfaces, cream typography, subtle glass rims, a dashboard grid and a floating navigation pill. The current palette uses warm yellow/gold accents and amber-tinted surfaces, superseding the original sage/green palette. This direction supersedes the composer-only material restriction, opaque panel requirement and palette/layout tables below, which remain historical LG-01–LG-06 context.

Use the existing CSS layers and semantic tokens. Shared borders use a 0.5px hairline with subdued decorative edges and glass highlights; inputs and secondary buttons retain distinct control boundaries. Keep focus outlines at 3px and restore 1px borders for increased contrast and forced colors. Default to the immersive dark material in either OS theme. Apply the shared glass recipe to navigation, lights, chat wrapper, voice and settings; never stack glass inside a glass card. Keep messages, inputs, buttons and notices opaque. The composer sits inside the chat card and no longer has its own blur. Use separate hash-routed pages for Things, Conversation, Voice and Settings, with one visible feature area at a time. Keep the shared navigation and page heading above the active content; Settings groups preferences and automations in two columns on desktop and stacks them on smaller screens. Navigation marks the current page, supports Back/Forward and moves focus to the page heading. Preserve session drafts and chat history when switching pages. The connection indicator pulses gently in the primary color only while the chat WebSocket is connected; connecting/disconnected states use a dark, static circle. Reduced-motion preferences disable the pulse, and the status remains available as text and a polite live region. Leaving Voice discards unsent capture or stops playback; submitted turns finish without starting hidden playback. The former room-scene card is removed so each page stays focused on its feature. Things uses a responsive grid of opaque device cards inside the existing glass panel; each card groups its name, observed state, permitted controls and observation time. Cards stack on narrow screens and fill available columns on wider screens without adding nested blur. The atmosphere photograph is decorative, not a camera feed. Do not add unsupported weather, media, camera, thermostat or household-member data to match the reference.

Shade the full-screen room image with the warm dark overlay at 70% before compositing the 8% warm cream glass tint; tint, blur and shadow values are authoritative in `apps/web/src/styles/tokens.css`. Measure text against the actual shaded image and composited highlights. The earlier black/white arbitrary-backdrop contrast claims do not apply to this transparent material. Opaque unsupported-filter, reduced-transparency and increased-contrast modes remain required. Forced colors use native system colors and remove the photo/filter/shadows. Preserve all grants, consent, typed outcomes, live regions and existing submit handlers.

Background asset: [Unsplash source image](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0), stored locally at `apps/web/public/images/home-interior.jpg`; the application makes no runtime image request to Unsplash. Use the Dribbble shot as a design reference, not as a shipped image or interface.

## Current motion treatment

Motion follows [animations.dev's easing guidance](https://animations.dev/learn/animation-theory/the-easing-blueprint) and [Apple's motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion): brief feedback with fast-start easing and stable reading surfaces. Shared motion tokens and `styles/motion.css` provide matching 240ms page-container and heading entrances over 6px, the same entrance for cards/newest messages, a device-card stagger capped at 60ms, and 120ms enabled-control hover/press feedback. Navigation changes reveal the active page immediately and preserve mounted drafts, message history, live regions and focus behavior. Streaming text updates do not restart message entrances. Confirmed device state drives the subtle card-border transition; clicks never imply success.

Activity rings appear only for existing device/settings/chat busy states and voice permission/processing phases. Recording retains its static danger marker. Errors remain immediately visible. Reduce Motion removes all animations, transitions and control transforms, with the existing text labels retaining state information. Visible glass surfaces also animate backdrop blur from 12px to the existing 24px over the same 240ms entrance; saturation stays at 135%. Voice and Settings animate their actual glass cards directly so a fading wrapper does not isolate the sampled backdrop. Reduced motion leaves the final static blur; reduced transparency, increased contrast, forced colors and unsupported filters retain the opaque fallback without blur animation. Content layout dimensions and focus outlines are never animated. The header uses one decorative selected-page pill that slides and resizes over 240ms between navigation links. Measurements follow wrapped rows, font loading and viewport changes; Back/Forward uses the same motion. Links retain immediate keyboard focus and `aria-current`; reduced motion makes the pill movement immediate, and forced colors uses the native selected-link highlight. The absolute pill does not affect document layout. No animation dependency is required.

## Historical implementation specification

## Intent and boundaries

Aura should feel calm, legible and responsive, with a recognizable sage/green identity. Conversation, deliberate voice input and truthful execution feedback express its intelligence. A restrained glass control layer provides depth while stable reading surfaces keep messages, device snapshots and approvals easy to inspect.

This specification covers the existing React/Vite interface and plain CSS. Preserve content order, labels, native controls, accessibility announcements, authorization and application behavior. Add scoped classes or state attributes only when needed to express existing state. New navigation, theme settings, component libraries and native optical refraction are outside this styling pass.

Apple's [materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) informs the distinction between content and controls. The values below are Aura's web design decisions rather than Apple platform tokens.

## Surface and state inventory

The current sources are `apps/web/src/main.tsx`, `VoicePanel.tsx`, `PreferencesPanel.tsx`, `AutomationsPanel.tsx` and `style.css`. Preferences and automations remain rendered when their server features are disabled; their explanatory states are part of the design.

| Current region                                           | Material and component treatment                                                               | States that must remain readable                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Main shell and header                                    | Canvas; plain typography with sage eyebrow                                                     | Narrow viewport, zoom, long text                                                                                              |
| Connection/status line                                   | Content-subtle compact status row; no blur                                                     | Connecting, connected, disconnected; agent and device backend labels                                                          |
| Lights panel and device list                             | Content panel, separated rows, visible device name and textual state                           | Refreshing, empty list, read-only, writable, discovery error; on, off, unknown, unavailable                                   |
| Device toolbar and on/off controls                       | Secondary opaque buttons within the content panel                                              | Hover, pressed, focus, disabled, working; no selected state inferred from a click                                             |
| Observation time, direct-operation result and last audit | Content; muted metadata, semantic outcome text                                                 | Pending, succeeded, denied, failed, uncertain; missing audit or unconfirmed outcome                                           |
| Conversation and welcome                                 | Canvas containing content message surfaces; welcome text has no extra glass panel              | Empty, streaming, completed, long text, scrolling, submitted turn with error                                                  |
| Aura message                                             | Content, aligned to reading edge; role label retained                                          | Partial response and complete response; errors remain separate                                                                |
| User message                                             | Content-subtle, modest start inset; role label retained                                        | Long text, wrapping, narrow viewport                                                                                          |
| Chat composer                                            | Glass controls wrapper with opaque text field and primary Send button                          | Empty input, focus, typing, responding, voice busy, disconnected; existing disabled conditions                                |
| Chat errors                                              | Content danger notice with visible text                                                        | Connection, protocol and turn errors; long recovery instructions                                                              |
| Talk to Aura panel                                       | Content panel with accent heading; opaque action group                                         | Idle, permission, recording, transcribing, responding, synthesizing, playback, error                                          |
| Voice actions and inspection                             | Primary deliberate action, secondary discard/replay/stop; underlined history/audit links       | Start, stop and send, discard, blocked playback, replay, speaker error, microphone failure, chat busy                         |
| Approved preferences                                     | Content panel and opaque form controls; approval metadata beneath each entry                   | Empty/saved entries, memory enabled/disabled, consent checked/unchecked, saving/deleting, error                               |
| Automations                                              | Content panel, opaque form, rule and receipt rows                                              | Server unavailable, execution enabled, emergency stop, empty/rule list, busy, consent, dry-run result, mutation/refresh error |
| Automation actions and receipts                          | Danger treatment for emergency stop/delete, primary approval action, secondary dry-run/refresh | Rule enabled/disabled; pending, succeeded, denied, failed, uncertain receipts                                                 |
| Elevated overlays                                        | Reserved opaque elevated material                                                              | No custom overlay currently exists; native select menus retain platform behavior                                              |

Shared `settings-panel` styling must not hide differences between preferences and automations. Introduce a scoped modifier when those differences need styling. Some outcomes currently arrive as unstructured status text: retain a neutral readable notice unless an existing typed value can drive a semantic modifier. Never parse English messages to infer success.

## Color tokens

Use these exact initial values in LG-02. All colors use sRGB. Semantic names are CSS custom property names with the `--aura-` prefix. Default to the light palette and select dark through `prefers-color-scheme: dark`; no theme picker is required.

| Token suffix      | Light                    | Dark                     | Purpose                                                 |
| ----------------- | ------------------------ | ------------------------ | ------------------------------------------------------- |
| `canvas`          | `#f4f6f2`                | `#101813`                | Page background                                         |
| `surface-content` | `#ffffff`                | `#1b2820`                | Messages, panels, fields, opaque glass fallback         |
| `surface-subtle`  | `#e8eee7`                | `#27392e`                | User messages, hover surfaces, metadata groups          |
| `surface-overlay` | `#ffffff`                | `#1b2820`                | Reserved elevated content                               |
| `glass-tint`      | `rgb(255 255 255 / 88%)` | `rgb(27 40 32 / 94%)`    | Enhanced glass background                               |
| `text`            | `#173b32`                | `#edf4ed`                | Body text, headings, field values                       |
| `text-muted`      | `#52665b`                | `#b4c6b8`                | Metadata, placeholders, secondary copy                  |
| `accent`          | `#245c46`                | `#b7d7b8`                | Primary button background, underlined links             |
| `on-accent`       | `#ffffff`                | `#13271b`                | Primary button text                                     |
| `accent-hover`    | `#1b4b39`                | `#c7e2c8`                | Primary hover                                           |
| `accent-pressed`  | `#143d2e`                | `#a2c7a5`                | Primary pressed                                         |
| `border`          | `#ccd8ce`                | `#43594a`                | Decorative separators and panel outlines                |
| `border-control`  | `#6b7e71`                | `#7f9586`                | Required field and secondary-control boundary           |
| `highlight`       | `rgb(255 255 255 / 65%)` | `rgb(255 255 255 / 12%)` | Decorative inset glass highlight                        |
| `focus`           | `#78551a`                | `#f1c777`                | Keyboard focus ring                                     |
| `success`         | `#245c46`                | `#b7d7b8`                | Explicitly confirmed outcome text                       |
| `warning`         | `#77500b`                | `#f1c777`                | Pending, denied or uncertain outcome text               |
| `danger`          | `#a12d32`                | `#ffb3b5`                | Failure, recording indicator, consequential action text |
| `disabled-text`   | `#52665b`                | `#b4c6b8`                | Disabled label on subtle surface                        |

Semantic notices use the content background and their semantic text color. Destructive buttons use danger text and border on content, rather than reusing `on-accent` on a danger background. Decorative borders and highlights are never the sole indication of an interactive boundary or state.

### Contrast basis and limits

Require at least 4.5:1 for normal text, including metadata and placeholders; 3:1 for large text (at least 24 CSS pixels regular or approximately 18.67 pixels bold). Require 3:1 for boundaries needed to identify controls and for Aura's focus indicators against their adjacent surface. See W3C's [text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html). Decorative panel borders need not meet control-boundary contrast.

The following are calculated minima using the WCAG relative luminance formula, not browser acceptance results. Content columns take the minimum across canvas, content and subtle surfaces. Glass columns composite the specified tint over black and white sRGB backdrops before calculating contrast; these bound backdrop luminance for this uniform tint recipe.

| Foreground role | Light content | Dark content | Light glass | Dark glass |
| --------------- | ------------- | ------------ | ----------- | ---------- |
| Text            | 10.43:1       | 10.97:1      | 9.35:1      | 11.45:1    |
| Muted text      | 5.22:1        | 6.84:1       | 4.68:1      | 7.15:1     |
| Focus           | 5.72:1        | 7.70:1       | 5.13:1      | 8.04:1     |

Success/warning/danger text has at least 6.07:1 on light content surfaces and 7.23:1 on dark content surfaces. Primary labels have at least 7.79:1 light and 8.43:1 dark across the specified default/hover/pressed backgrounds. Control borders have at least 3.67:1 light and 3.83:1 dark on content surfaces, and 3.29:1 light and 3.99:1 dark on the bounded glass backgrounds. Control borders must also be checked against the actual field and surrounding surface.

LG-05 must measure actual rendered/composited surfaces, including corners, highlights and any background variation. Do not lower tint opacity, place text on a new gradient, or add blend/filter effects without recalculating and inspecting contrast. Shadows and blur do not establish readable contrast by themselves.

## Typography, spacing and geometry

| Token suffix                                         | Value                                                                  | Use                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `font-body`                                          | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Native system type, no downloaded font    |
| `font-mono`                                          | `ui-monospace, SFMono-Regular, Consolas, monospace`                    | Inspection IDs and technical references   |
| `text-small`                                         | `0.875rem`                                                             | Metadata and eyebrow                      |
| `text-body`                                          | `1rem`                                                                 | Copy, fields and buttons                  |
| `text-heading`                                       | `1.25rem`                                                              | Panel headings                            |
| `text-title`                                         | `clamp(2.5rem, 6vw, 4rem)`                                             | Aura title                                |
| `leading-body`                                       | `1.5`                                                                  | Body and metadata                         |
| `leading-heading`                                    | `1.2`                                                                  | Headings                                  |
| `weight-normal` / `weight-medium` / `weight-bold`    | `400` / `500` / `600`                                                  | Copy / buttons / labels and headings      |
| `tracking-title` / `tracking-eyebrow`                | `-0.04em` / `0.12em`                                                   | Title / uppercase eyebrow only            |
| `space-1` / `space-2` / `space-3` / `space-4`        | `0.25rem` / `0.5rem` / `0.75rem` / `1rem`                              | Fine spacing and control gaps             |
| `space-5` / `space-6` / `space-8` / `space-12`       | `1.25rem` / `1.5rem` / `2rem` / `3rem`                                 | Message/panel padding and section gaps    |
| `radius-control` / `radius-message` / `radius-panel` | `0.75rem` / `1rem` / `1.25rem`                                         | Controls / messages / panels and composer |
| `radius-pill`                                        | `999px`                                                                | Compact textual status only               |
| `border-width`                                       | `1px`                                                                  | Separators and boundaries                 |
| `focus-width` / `focus-offset`                       | `3px` / `3px`                                                          | External keyboard ring                    |
| `control-min-size`                                   | `44px`                                                                 | Minimum primary touch width and height    |
| `content-max-width`                                  | `50rem`                                                                | Existing single-column reading layout     |

Use a 1rem root size without disabling browser text scaling. Body copy and controls remain at least 1rem; metadata remains at least 0.875rem. Links are underlined. Use 1rem page gutters on narrow screens and 1.5rem from 48rem upwards; top/bottom page padding is 2rem, increasing to 3rem at that breakpoint. Panels have 1rem padding, increasing to 1.5rem; messages use 1rem by 1.25rem. Default section gap is 1.5rem.

Keep user-message start inset at 1rem on narrow screens and 2rem from 48rem upwards. All layout children may shrink; labels and action groups wrap. Long messages preserve whitespace and wrap unbroken text; IDs wrap. Forms remain single column, and action groups wrap when their targets no longer fit. Do not hide content to make a screenshot fit.

Keep conversation scrolling bounded by available viewport space without a fixed page height. Preserve the current scroll behavior; inspect focus, zoom and keyboard interactions before changing scroll dimensions. Avoid a fixed composer in this pass, since it can obscure content or the mobile keyboard. At 320 CSS pixels and 200% zoom, the page must remain usable without horizontal scrolling.

## Material recipes and elevation

| Material         | Recipe                                                                                                                          | Placement                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Content          | `surface-content`, `border`, panel/message radius; no backdrop filter; panels use a soft elevation shadow                       | Panels and Aura messages                                               |
| Content-subtle   | `surface-subtle`, decorative border as needed; no blur                                                                          | User messages and secondary groups                                     |
| Glass controls   | Opaque content baseline; enhanced `glass-tint`, 16px blur, 115% saturation, decorative border and inset highlight, glass shadow | Composer wrapper; future toolbar only when it needs a separate surface |
| Elevated overlay | Opaque `surface-overlay`, decorative border, panel radius, overlay shadow                                                       | Reserved for a future custom popover/dialog; no current implementation |

Define `--aura-glass-blur: 16px` and `--aura-glass-saturation: 115%`. Glass uses `--aura-shadow-glass`, strengthened after the initial implementation so the composer reads as an elevated control layer. Use `--aura-shadow-panel` for soft panel elevation and keep `--aura-shadow-overlay` reserved for overlays. Authoritative values live in `styles/tokens.css`. The enhanced material uses the `glass-edge` boundary and one-pixel top/bottom inset highlights; field text stays on its opaque surface.

The visibility revision adds static sage and warm canvas gradients using `canvas-glow` and `canvas-halo`, plus a decorative orb beside the existing header. The background does not repeat or animate. Reduced transparency, increased contrast and forced colors restore the flat canvas. Content panels remain opaque; glass remains limited to the composer. Tint strengths, text colors and control boundaries retain their initial contrast basis.

Apply blur only inside a support query and only to the wrapper, with both standard and prefixed declarations if needed for the verified browser targets. Avoid nested glass, full-page blur, animated filters and `will-change` on every panel. The current interface needs one glass region: the composer. Do not add fake overlays or a toolbar just to demonstrate a material.

Example composition: canvas → conversation content messages → glass composer → opaque input and accent Send button. The input uses `border-control`; glass never replaces the field boundary. Lights use a content panel with opaque secondary buttons, not individual blurred device tiles.

## Interaction and truthful feedback

| State             | Required visual behavior                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Default           | Primary action uses accent/on-accent; secondary uses content/text with control border                                        |
| Hover             | Pointer-capable devices: primary accent-hover; secondary subtle background. No layout shift                                  |
| Pressed           | Primary accent-pressed; secondary subtle background and inset border. No scaling needed                                      |
| Keyboard focus    | 3px focus outline, 3px offset; keep visible outside rounded wrappers; do not clip                                            |
| Disabled          | Subtle background and disabled-text; preserve native disabled behavior, no whole-control opacity reduction or hover feedback |
| Busy              | Retain existing Working/Refreshing/responding labels and disabled conditions; never replace them with color alone            |
| Confirmed success | Success text only for an explicit confirmed outcome; retain device snapshot time                                             |
| Pending/uncertain | Warning text with the existing outcome/recovery label; never show a success checkmark                                        |
| Failed/denied     | Failure uses danger, denial uses warning; preserve explanation and audit access                                              |
| Selected/checked  | Native checked state remains visible with accent-color; device on/off text reflects observed state, not optimistic intent    |

Use `--aura-duration-fast: 120ms`, `--aura-duration-normal: 180ms`, and `--aura-ease: cubic-bezier(0.2, 0, 0, 1)`. Transition background-color and border-color only where helpful; avoid `transition: all`. Focus appears immediately. Recording gets a static danger marker plus the existing phase text, not a perpetual pulse. Streaming content updates without entrance animation; active voice phases remain textually distinguishable.

Emergency stop remains prominent and available under its existing conditions, even while discovery fails. Deletion is visually distinct from primary approval. Discard recording and stop playback retain their different meanings. Do not add confirmations, suppress recovery instructions, or change what an enabled-looking control can execute.

Primary buttons, text fields and selects target at least 44 CSS pixels in height; buttons target at least 44 pixels in width. Checkbox visuals may remain native-sized, but their clickable label area targets 44 pixels high. Provide at least 8 pixels between adjacent actions. A large surrounding panel does not count as a control's touch target.

## Accessibility and fallback precedence

Start with readable opaque surfaces. Enhancement order is theme → supported glass → user preferences; preference rules override the enhanced recipe. [Backdrop filtering](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) affects the area behind an element, so the content tint and fallback must stand on their own.

| Condition                              | Required treatment                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No backdrop-filter support             | Opaque content background for glass; keep border/radius and modest shadow                                                                                              |
| `prefers-reduced-transparency: reduce` | Opaque glass; no backdrop filter or translucent highlight                                                                                                              |
| `prefers-contrast: more`               | Opaque surfaces; decorative boundaries become control-strength; preserve full text contrast; remove glass highlight                                                    |
| `prefers-reduced-motion: reduce`       | Remove decorative transitions/animations and smooth scrolling; retain immediate state feedback                                                                         |
| `forced-colors: active`                | Remove filters/shadows; use Canvas/CanvasText, ButtonFace/ButtonText and Highlight as appropriate; explicit control and focus outlines; preserve native checked states |

Keep automatic forced-color adjustment enabled. Do not hard-code sage over the user's forced palette. [Forced colors guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors) explains the system palette; [reduced transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency) support must be checked for the actual browser. Unsupported preference queries provide no signal: the strong default tint and opaque content surfaces remain the baseline, and a universal mapping from Apple settings is not assumed.

Preserve existing live regions, labels, alerts and DOM focus order. CSS cannot supply missing semantic announcements. A newly discovered semantic or application defect should be recorded separately rather than disguised by styling.

## Implementation handoff and acceptance

LG-02 puts these tokens in `styles/tokens.css`, shared defaults in `styles/base.css`, and supported material recipes in `styles/materials.css`, imported through `style.css`. LG-03 applies the chat example; LG-04 extends it to panels. Component selectors must be scoped: conversation articles must not determine settings card styles, and composer inputs must not size checkboxes. No new dependencies are needed.

LG-01 acceptance:

- All current regions and disabled-feature states are inventoried above.
- Both palettes and geometry, elevation and motion values are specified.
- Content, glass controls and reserved elevated overlays have explicit recipes and placement.
- Interaction, 44px touch targets, contrast and fallback requirements are defined.
- Initial contrast calculations cover opaque surfaces and tint compositing; rendered verification remains an explicit LG-05 gate.

Record visual evidence in `docs/verification/frontend-design.md` during LG-05: 320/390/768/1440px widths, 200% zoom, long content, both themes, supported preference modes, and mock chat/device/voice/settings flows. Inspect Chromium and Safari/WebKit; report physical keyboard/device checks separately from emulation. This document defines intended styling, not evidence that those checks already pass.

For subsequent frontend styling tasks, use the repository-local [aura-frontend-design skill](../../.agents/skills/aura-frontend-design/SKILL.md). It routes to this specification, the implemented CSS and the current reference captures; token values remain defined in `apps/web/src/styles/tokens.css`.
