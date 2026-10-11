# Frontend design verification

Status: LG-05 local validation complete with the browser/device support gaps below. LG-06 skill creation and local validation are complete. Native browser zoom, physical mobile keyboards and live audio acceptance are still open; this record does not close earlier hardware acceptance gaps.

## Reference dashboard revision — 2026-10-10

The user rejected the previous treatment and supplied [Md Zia Uddin's smart-home concept](https://dribbble.com/shots/26174948-Apple-Liquid-Glass-meets-Smart-Home-Vibes). This revision supersedes the earlier material acceptance: photographic shaded room backdrop, translucent lights/chat/voice/settings/navigation, bright rims, white typography and a responsive dashboard grid. Messages and fields remain opaque; no nested composer blur. A local decorative room photograph is used without suggesting a live camera feed. Section navigation uses real anchors. Existing operations, consent and transport handlers remain unchanged; no dependencies were added.

Validated with HTTP/WebSocket fixtures in headless Chromium 156 and WebKit 27.2. The running API was in OpenAI mode, so browser requests were intercepted; no paid provider requests or physical operations occurred. Both engines passed 320/390/768/1440px reflow, two submitted chat turns including 2,000 unbroken characters, keyboard focus, 200% CSS zoom, increased contrast and reduced motion. Both OS color-scheme settings intentionally use the same immersive dark dashboard. Chromium additionally passed reduced transparency and forced colors across all new glass regions and removed the photograph. Existing opaque unsupported-filter baseline remains implemented; this revision did not run an old browser.

208 rendered foreground/background samples passed, with minimum enabled text contrast 5.04:1. These samples hide text temporarily and read PNG pixels at viewport coordinates across navigation, lights, chat, voice and settings. They measure the actual shaded photographic composition, not arbitrary white backdrops. The original composer-only black/white stress bounds are historical and do not apply to the new material.

Full-page screenshots of the fixed photo/backdrop combination produced compositor artifacts, so final visual review uses normal viewport captures: [Chromium desktop](assets/reference-dashboard/chromium-desktop.png), [WebKit desktop](assets/reference-dashboard/webkit-desktop.png). Chromium shows frosted blur; headless WebKit captures show transparency but render the blur differently. Do not equate that engine screenshot with native Safari acceptance. Final typography uses a lighter header weight, and the settings grid avoids stretching the smaller panel.

The 600-delta Chromium scrolling profile compared the glass chat wrapper with an opaque variant while other dashboard materials remained unchanged. Glass p95 frame time was 18.1ms versus 17.9ms opaque, with no frames over 50ms or long tasks in either run. This is local headless CPU evidence, not mobile GPU/power acceptance. [Contrast measurements](assets/reference-dashboard/measurements.json), [performance measurements](assets/reference-dashboard/performance.json).

Web build, repository typecheck, eight existing chat/voice tests, formatting and diff checks pass. Temporary tooling uses the existing Playwright installation: `/private/tmp/aura-chat-browser/review-reference.mjs`, `preview-reference.mjs` and `profile-reference.mjs`. Native zoom, mobile keyboard/audio, native Safari rendering and target-device performance remain open. The repository design skill still describes the historical composer-only restriction; follow the current specification and the user's reference when it conflicts.

## Glass visibility correction — 2026-10-10

The source CSS was loading at `http://localhost:5173`, but composer-only glass over a flat canvas looked too similar to the previous UI. Added a static sage/warm backdrop, a decorative header orb, soft opaque-panel elevation and stronger composer shadow/edge. Retained the existing 88%/94% glass tints, opaque reading surfaces, input fields and preference fallbacks. A thicker inset rim failed the dark-theme contrast check and was replaced with one-pixel highlights.

Local headless Chromium 156 and WebKit 27.2 passed light/dark reflow at 320/390/768/1440px, keyboard focus, 200% CSS zoom, increased contrast and reduced motion. Chromium additionally passed reduced transparency and forced colors. Rendered text and stressed glass samples passed with a 4.66:1 minimum; control boundaries and focus passed 3:1. The existing local harness was adapted to HTTP/WebSocket fixtures because the running API uses OpenAI mode; no provider request or device write occurred. The 600-delta Chromium scrolling comparison recorded 17.8ms glass frame p95, no frames over 50ms and no long tasks. These are local engine/fixture results; native Safari, mobile keyboard/audio and hardware performance acceptance remain open.

Reviewed captures: [light mobile](assets/glass-visibility/light-390.png), [dark mobile](assets/glass-visibility/dark-390.png), [light desktop](assets/glass-visibility/light-1440.png), [dark desktop](assets/glass-visibility/dark-1440.png). [Measurements](assets/glass-visibility/measurements.json). Temporary harness: `/private/tmp/aura-chat-browser/review-glass.mjs`; no new dependencies. Web build, repository typecheck and formatting/diff checks pass.

## LG-05 — Cross-browser validation

Verified on 2026-10-10 against the working tree on macOS ARM64 (Darwin 27.2.0), Node 24.18.0 and Yarn 4.13.0. Local headless Chromium 156.0.8078.4 and Playwright WebKit 27.2 (build 2370) used the existing temporary Playwright installation. WebKit is engine evidence, not installed Safari or iOS acceptance. No repository dependencies, screenshot framework, deployment configuration or API behavior changed.

Review found that WebKit's native popup selects ignored `min-height`, rendering at 23px. `style.css` now sets an explicit height from the existing type, padding and border tokens. Repeated browser checks confirm all settings selects are at least 44px (50px at default text size), while retaining native dropdown interaction and arrows. Captures were regenerated after this correction. Vite was restarted to discard a stale cached stylesheet before final validation.

### Scenarios and results

| Check                              | Result                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both engines and themes            | Real mock health, device discovery, WebSocket chat and input/scrolling passed. No page errors in the chat/panel fixture suites.                                                                                                                                      |
| Responsive layouts                 | 320×640, 390×844, 768×900 and 1440×900 CSS pixels; no horizontal page/conversation overflow. A 390×420 reduced viewport also keeps the composer reachable.                                                                                                           |
| Long content                       | 3,000-character unbroken user input, multiline streamed response and 1,000-character unbroken assistant text wrap; conversation scrolling and post-refresh composer visibility pass.                                                                                 |
| Scaling                            | 200% root text scaling at 390px and CSS `zoom: 2` at 1280×900 pass reflow/input reachability. A separate 640×450 layout passes. These are simulations; native browser zoom remains open.                                                                             |
| Keyboard                           | Chromium Tab and macOS WebKit Option-Tab reach Send with the 3px focus outline visible and unclipped. WebKit's default plain Tab skips buttons; this follows its native keyboard-navigation setting.                                                                 |
| Light controls and refresh         | Real mock on/refresh pass in both engines/themes. Controlled fixtures also pass held-request busy gating, unknown/unavailable/read-only states, discovery error and uncertain outcome recovery; one operation dispatch without retry.                                |
| Chat failure                       | Controlled streaming error and disconnect preserve recovery copy, restore input and keep Send disabled when disconnected.                                                                                                                                            |
| Preferences/automations            | Feature-enabled HTTP fixtures pass save/delete/error, consent/reset, disabled rule creation, explicit activation/disable/delete, dry-run without a write and emergency stop even after discovery failure. Server feature flags remain disabled in the real mock API. |
| Mock voice UI                      | Capture/audio fixtures pass recording/discard, transcribing/responding/synthesizing, blocked playback/replay and Stop. Discard sends nothing. This verifies the panel against mock capabilities, not native recording or audible playback.                           |
| Reduced motion/increased contrast  | Emulated in both engines; transitions removed, composer opaque with no blur, stronger borders retained.                                                                                                                                                              |
| Reduced transparency/forced colors | Chromium emulation passes: opaque composer, no filter; forced colors also removes shadows and retains the focused control. WebKit preference support was not asserted for these two modes.                                                                           |
| Unsupported backdrop filter        | Chromium fixture removes the `@supports` enhancement from the shipped CSS; opaque content background and no filter remain. This is a fallback simulation, not an old-browser run.                                                                                    |

### Rendered contrast

[Machine-readable samples and performance measurements](assets/lg05/measurements.json) retain 120 records. Representative app text/control foregrounds come from computed styles, and backgrounds come from PNG pixels at the corresponding element coordinates after paint settles. Text is temporarily made transparent without altering layout to avoid sampling antialiased glyph pixels. This measures foreground-to-composited-background contrast, rather than treating antialiasing as the text color.

The actual composer is additionally wrapped in black and white backdrop fixtures, testing neutral luminance extremes in both engines/themes with the shipped tint, blur and highlight. Nine samples span its top interior and rounded-corner shoulders, including the inset highlight. Text/semantic minima include those highlights; control boundary/focus minima use the interior background adjacent to where controls occur, away from the decorative top edge. Ratios use the sRGB relative-luminance formula. This is a representative rendered check, not an exhaustive accessibility audit or proof for arbitrary colored imagery/new materials.

| Foreground on stressed glass | Light minimum | Dark minimum | Target |
| ---------------------------- | ------------- | ------------ | ------ |
| Primary text                 | 9.31:1        | 7.78:1       | 4.5:1  |
| Muted text                   | 4.66:1        | 4.85:1       | 4.5:1  |
| Control boundary             | 3.28:1        | 4.00:1       | 3:1    |
| Focus ring                   | 5.11:1        | 8.05:1       | 3:1    |
| Success                      | 5.90:1        | 5.57:1       | 4.5:1  |
| Warning                      | 5.42:1        | 5.46:1       | 4.5:1  |
| Danger                       | 5.42:1        | 5.13:1       | 4.5:1  |

Every sampled enabled app label/control passed 4.5:1. Disabled controls are exempt from that assertion. The primary and secondary text on opaque panels remain readable; message and field backgrounds stay opaque. The results support keeping the existing tint strength and limited glass area.

### Scrolling and streaming profile

An isolated Chromium DevTools Timeline/Performance run sent 600 WebSocket delta fixtures through the real React rendering path, alternating conversation scroll position and document scrolling at roughly 16ms intervals. It compared the shipped composer against an injected opaque/no-filter variant at 390×844 in the light theme. Each run lasted about 10.67 seconds. Frame intervals use `requestAnimationFrame`; long tasks use `PerformanceObserver`; paint totals come from Timeline `Paint` events. This is a local headless CPU/timeline comparison, not a GPU/power measurement or mobile-device performance budget.

| Material | Frame p95 | Maximum interval | Frames >50ms / long tasks | Paint events / total paint time | Layout time |
| -------- | --------- | ---------------- | ------------------------- | ------------------------------- | ----------- |
| Glass    | 17.8ms    | 21.0ms           | 0 / 0                     | 1,235 / 295.46ms                | 1.245s      |
| Opaque   | 17.8ms    | 19.7ms           | 0 / 0                     | 1,230 / 322.43ms                | 1.262s      |

Both runs repaint during streaming, with similar paint counts and no sustained frame stalls in this workload. There is no observed reason here to expand or remove the existing composer-only blur. WebKit scrolling/input passed functional checks; its performance was not profiled. Repeat the comparison on target mobile hardware before making device-performance claims.

### Reviewed reference captures

The following 46 captures were visually reviewed for wrapping, control geometry, focus clipping, panel hierarchy and error readability. Chat slices intentionally show the latest portion of stress messages; panel captures include their full content. CSS zoom captures show the composer in the scaled document, rather than an entire screen. Forced-color captures use Chromium's emulated system palette.

| State                    | Chromium light                                               | Chromium dark                                              | WebKit light                                               | WebKit dark                                              |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Empty chat               | [Light](assets/lg05/chromium/lg03/light-empty.png)           | [Dark](assets/lg05/chromium/lg03/dark-empty.png)           | [Light](assets/lg05/webkit/lg03/light-empty.png)           | [Dark](assets/lg05/webkit/lg03/dark-empty.png)           |
| Chat and keyboard focus  | [Light](assets/lg05/chromium/lg03/light-chat-focus.png)      | [Dark](assets/lg05/chromium/lg03/dark-chat-focus.png)      | [Light](assets/lg05/webkit/lg03/light-chat-focus.png)      | [Dark](assets/lg05/webkit/lg03/dark-chat-focus.png)      |
| Streaming long reply     | [Light](assets/lg05/chromium/lg03/light-streaming.png)       | [Dark](assets/lg05/chromium/lg03/dark-streaming.png)       | [Light](assets/lg05/webkit/lg03/light-streaming.png)       | [Dark](assets/lg05/webkit/lg03/dark-streaming.png)       |
| Error/disconnect         | [Light](assets/lg05/chromium/lg03/light-disconnected.png)    | [Dark](assets/lg05/chromium/lg03/dark-disconnected.png)    | [Light](assets/lg05/webkit/lg03/light-disconnected.png)    | [Dark](assets/lg05/webkit/lg03/dark-disconnected.png)    |
| Lights and audit         | [Light](assets/lg05/chromium/lg04/light-lights.png)          | [Dark](assets/lg05/chromium/lg04/dark-lights.png)          | [Light](assets/lg05/webkit/lg04/light-lights.png)          | [Dark](assets/lg05/webkit/lg04/dark-lights.png)          |
| Preferences and error    | [Light](assets/lg05/chromium/lg04/light-preferences.png)     | [Dark](assets/lg05/chromium/lg04/dark-preferences.png)     | [Light](assets/lg05/webkit/lg04/light-preferences.png)     | [Dark](assets/lg05/webkit/lg04/dark-preferences.png)     |
| Automations and receipts | [Light](assets/lg05/chromium/lg04/light-automations.png)     | [Dark](assets/lg05/chromium/lg04/dark-automations.png)     | [Light](assets/lg05/webkit/lg04/light-automations.png)     | [Dark](assets/lg05/webkit/lg04/dark-automations.png)     |
| Voice recording          | [Light](assets/lg05/chromium/lg04/light-voice-recording.png) | [Dark](assets/lg05/chromium/lg04/dark-voice-recording.png) | [Light](assets/lg05/webkit/lg04/light-voice-recording.png) | [Dark](assets/lg05/webkit/lg04/dark-voice-recording.png) |
| Voice recovery           | [Light](assets/lg05/chromium/lg04/light-voice-recovery.png)  | [Dark](assets/lg05/chromium/lg04/dark-voice-recovery.png)  | [Light](assets/lg05/webkit/lg04/light-voice-recovery.png)  | [Dark](assets/lg05/webkit/lg04/dark-voice-recovery.png)  |
| 200% CSS zoom            | [Light](assets/lg05/chromium/light-css-zoom.png)             | [Dark](assets/lg05/chromium/dark-css-zoom.png)             | [Light](assets/lg05/webkit/light-css-zoom.png)             | [Dark](assets/lg05/webkit/dark-css-zoom.png)             |
| Increased contrast       | [Light](assets/lg05/chromium/light-increased-contrast.png)   | [Dark](assets/lg05/chromium/dark-increased-contrast.png)   | [Light](assets/lg05/webkit/light-increased-contrast.png)   | [Dark](assets/lg05/webkit/dark-increased-contrast.png)   |
| Forced colors            | [Light](assets/lg05/chromium/light-forced-colors.png)        | [Dark](assets/lg05/chromium/dark-forced-colors.png)        | Not checked                                                | Not checked                                              |

Compare future captures at the same engine/version, viewport, theme, fixture state and scroll position. Review native control differences across engines separately from changes within one engine. Use the LG-05 captures as the current reference; earlier LG-03/LG-04 images below are historical. Automated screenshot regression tooling remains deferred.

### Commands and reproduction

Start the compiled API with explicit credential-free settings and an isolated database, and start Vite in another terminal:

```sh
AGENT_MODE=mock DEVICE_BACKEND=mock SPEECH_MODE=mock MEMORY_ENABLED=false AUTOMATIONS_ENABLED=false DATABASE_PATH=/private/tmp/aura-lg05.sqlite node apps/api/dist/main.js
CHOKIDAR_USEPOLLING=true yarn dev:web
```

The session used temporary harnesses in `/private/tmp/aura-chat-browser`, with `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/aura-chat-browsers`. `lg05-03.mjs` and `lg05-04.mjs` repeat the earlier chat/panel suites, selecting WebKit with `ENGINE=webkit`; `check-lg05.mjs` measures contrast, scaling, real mock controls and the streaming profile; `lg05-foundation.mjs` checks preference/fallback precedence. All final runs passed. Temporary harnesses are session tooling, not a committed or portable test command. The durable evidence is the captures, measurements and procedures here; no new test framework or dependency was added.

To repeat manually, use the viewport/theme/scaling matrix above, send `status`, `list devices` and long unbroken content, tab to Send, operate/refresh simulated lights, and inspect the composer while scrolling. Use controlled transport/capture fixtures for held streaming, errors, feature-enabled panels and blocked playback; do not enable rules against a real household for screenshot capture. In browser developer tools, emulate the listed media preferences; disable the material enhancement to inspect fallback; record equivalent scrolling/streaming with and without the composer filter. Sample the painted background after transitions settle before computing contrast.

Validation commands passed:

```sh
PATH="$PWD/node_modules/.bin:$PATH" yarn workspace @aura/web build
yarn typecheck
yarn vitest run apps/web/src/chat-connection.test.ts apps/web/src/voice-capture.test.ts
yarn prettier --check apps/web/src/style.css docs/verification/frontend-design.md docs/verification/assets/lg05/measurements.json docs/plans/frontend-liquid-glass.md docs/specs/frontend-design.md docs/specs/README.md
git diff --check
```

The existing two frontend test files contain eight passing tests. No JSX or transport behavior changed in LG-05. Local Markdown asset links were checked. Container validation is unnecessary for this CSS/evidence change.

### Remaining manual acceptance

- Native browser 200% zoom, using browser controls rather than CSS zoom/text resizing: verify no clipped text, horizontal page scroll or lost composer focus.
- Installed Safari and physical iOS/Android keyboards: focus the input, open/dismiss the keyboard, scroll long chat and settings, and verify the composer and focused controls remain reachable. Desktop viewport shrinking is not this check.
- Physical microphone permission, recording, speaker playback and replay: the voice fixtures do not close existing MVP3/MVP4 audio acceptance gaps.
- Target-device scrolling/streaming, touch and power/GPU behavior; WebKit preference modes not asserted above. The local headless profile does not establish mobile performance.

Record browser/OS/device, date, screenshots and outcome here when these checks are available. LG-05's local evidence deliverable is complete with these explicit support gaps; universal browser/device acceptance is not claimed.

## LG-06 — Reusable design skill

Created on 2026-10-10 using the skill-creator workflow. The repository-local [aura-frontend-design skill](../../.agents/skills/aura-frontend-design/SKILL.md) lives in `.agents/skills/aura-frontend-design`, with [UI metadata](../../.agents/skills/aura-frontend-design/agents/openai.yaml). This repository location follows [official OpenAI skill discovery guidance](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills). Implicit selection retains its default enabled policy; explicit invocation is `$aura-frontend-design`.

The skill references the specification, actual CSS/JSX and LG-05 evidence rather than copying token values. It includes the implemented opaque-message/glass-wrapper/opaque-control composition, scoped selector and layer guidance, native WebKit select sizing, typed outcome rules, behavior preservation and a compact visual review checklist. No new application dependency, test framework or global Codex configuration was introduced.

Validation used the bundled `skill-creator/scripts/quick_validate.py` with PyYAML in an isolated temporary virtual environment (`/private/tmp/aura-lg06-skill-tools`); the validator passed. YAML metadata parsed successfully, local source/evidence links resolved, referenced CSS custom properties existed in `tokens.css`, and Prettier/diff checks passed. These checks validate the files, not live skill discovery in a fresh Codex session.

Author walkthroughs against the current implementation:

| Subsequent request                    | Guidance checked against source                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Style a chat/composer change          | Routes to `main.tsx`, `.conversation > article`, `.chat-form` and `.composer`; keeps opaque messages/field, one glass wrapper, existing disabled expressions and pending composer scroll. The example uses existing tokens and selectors. |
| Style an uncertain automation receipt | Routes to `.automation-receipts [data-outcome='uncertain']` and the warning token; preserves typed state/recovery text, consent and emergency-stop behavior. Unstructured mutation notices stay neutral.                                  |
| Change shared form styling            | Routes to `base.css`, settings selectors and token-derived explicit select height, while excluding checkboxes from text-field sizing. Includes both themes, WebKit and preference-mode checks.                                            |
| Change backend retry behavior         | Outside the skill description's styling scope; no permission to change dispatch/retry behavior is implied.                                                                                                                                |

These are source-grounded author reviews, not independent agent evaluations or additional browser runs. LG-06 changed only skill/documentation files, so application builds, frontend tests and screenshots were not repeated; the LG-05 results above remain the runtime baseline. Native zoom, physical mobile keyboards/audio and target-device performance remain open exactly as recorded above.

## LG-03 — Chat and composer (historical slice)

Checked on 2026-10-10 on macOS ARM64, Node 24.18.0, Yarn 4.13.0, with local headless Chromium. The connected Browser runtime had no available backend. The browser harness used the existing local Playwright installation; no repository dependency was added. Evidence reflects the working tree rather than a committed release.

The API ran with explicit mock agent/device/speech settings, memory and automations disabled, and an isolated database at `/private/tmp/aura-lg03.sqlite`. No credentials, provider requests or physical device operations were used.

| Scenario                      | Evidence and result                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| End-to-end mock chat          | Real HTTP health/device discovery and WebSocket turns for `status`, `list devices` and a 3,000-character unbroken user message; completed successfully in both themes                |
| Composer after device refresh | Input remained fully in the viewport after repeated turns and restoration of refreshed light rows; the final scroll adjustment waits for response/voice/device busy states to settle |
| Responsive reading            | 320×640, 390×420, 768×900 and 1440×900 CSS pixel viewports; no horizontal page or conversation overflow, input reachable, conversation scrollable                                    |
| Keyboard focus                | Tab from a populated input reached Send with an immediate 3px solid focus outline; screenshot reviewed for clipping                                                                  |
| Text scaling                  | 200% root text scaling at 390px; no horizontal overflow and input reachable. This is text-resize simulation, not browser zoom acceptance                                             |
| Long streaming reply          | Controlled WebSocket fixture held a long multiline reply and 1,000-character unbroken text; wrapping and scrolling passed; responding label and disabled input remained visible      |
| Error and disconnect          | Fixture emitted an error and closed the socket; recovery copy remained readable, input re-enabled, and Send remained disabled after typing while disconnected                        |
| User preferences              | Emulated reduced transparency and forced colors removed composer blur; emulated reduced motion removed control transitions                                                           |
| Runtime errors                | No page errors during real mock chat checks                                                                                                                                          |

The glass composer uses the existing opt-in material; message surfaces and the input stay opaque. Status text has a decorative marker and explicit connection modifier, and the chat error uses a readable content surface. Existing device, voice and settings panel styling remains for LG-04.

The small presentation behavior correction in `main.tsx` keeps a pending composer scroll until the reply and post-turn device refresh settle. It prevents late device rows above chat from pushing the input below the viewport. It does not change submissions, grants, operation execution, or retry behavior.

Dynamic viewport sizing uses a `vh` fallback followed by `dvh` for browsers supporting dynamic units. See [MDN viewport length guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length). The composer remains in document flow.

## Reference captures

These captures isolate conversation/composer at a 390px viewport. The conversation is intentionally scrolled to the most recent content in stress cases; the beginning of a long message may be above the scroll area. Error captures show the disabled composer and recovery notice after a fixture disconnect; the connection row was checked separately in the DOM.

| State                                      | Light                                       | Dark                                      |
| ------------------------------------------ | ------------------------------------------- | ----------------------------------------- |
| Empty conversation                         | [Light](assets/lg03/light-empty.png)        | [Dark](assets/lg03/dark-empty.png)        |
| Completed chat, long user text, Send focus | [Light](assets/lg03/light-chat-focus.png)   | [Dark](assets/lg03/dark-chat-focus.png)   |
| Long reply while streaming                 | [Light](assets/lg03/light-streaming.png)    | [Dark](assets/lg03/dark-streaming.png)    |
| Error and disconnected composer            | [Light](assets/lg03/light-disconnected.png) | [Dark](assets/lg03/dark-disconnected.png) |

## Commands and remaining acceptance

- `PATH="$PWD/node_modules/.bin:$PATH" yarn workspace @aura/web build` — passed; the root binary directory is needed by the existing workspace script to resolve root-owned TypeScript.
- `yarn typecheck` — passed.
- `yarn vitest run apps/web/src/chat-connection.test.ts apps/web/src/voice-capture.test.ts` — eight tests passed.
- Prettier checks on touched source/documentation and `git diff --check` — passed.
- Local headless browser harness at `/private/tmp/aura-chat-browser/check-lg03.mjs` — passed; temporary verification tooling, not a committed test dependency.

At LG-03 closure, Safari/WebKit, physical mobile keyboards, browser zoom, composited contrast and scrolling/streaming performance were deferred to LG-05; see the current results above. The 390×420 viewport only simulates reduced available space; it does not prove on-screen keyboard behavior. The fixture verifies a controlled error and disconnect, not a real provider failure. Panel-specific voice, preferences and automation flows remain outside LG-03.

## LG-04 — Lights, voice and settings (historical slice)

Checked on 2026-10-10 with the same macOS ARM64/Node/Yarn environment and local headless Chromium. All API responses and mutations were intercepted with fixtures, including feature-enabled preferences and automations and Home Assistant-style snapshots. The capture module and audio playback were stubbed to exercise the actual VoicePanel UI transitions without using a microphone, speaker, speech provider, or physical device. These are browser UI checks, not live integration evidence.

Panel surfaces are opaque content with shared typography, geometry and form tokens. Refresh, light controls, dry-run, discard and playback controls use secondary styling; deletion and emergency stop use danger text and borders. Outcome colors consume typed device/audit/receipt states, while free-form mutation results remain neutral. JSX changes are styling classes and data attributes only; existing requests, consent, busy conditions and announcements are preserved.

| Scenario                        | Result in light and dark themes                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light snapshots                 | On/off/unknown/unavailable and observation times readable; unknown/unavailable controls disabled                                                                                                            |
| Direct-operation busy/uncertain | Working labels retained, other light controls disabled during the held request; exactly one request dispatched; uncertain recovery text and all five audit outcomes retained                                |
| Read-only and discovery failure | Read-only explanation retained without write controls; discovery error visible after refresh                                                                                                                |
| Preferences                     | Save disabled without consent; save clears consent; deletion removes the entry; failed save shows recovery alert                                                                                            |
| Automation approval             | Global activation requires consent, resets it afterward; new rules remain disabled; individual approval, disable and delete flows pass                                                                      |
| Dry-run and emergency stop      | Dry-run stays informational and dispatches no device write; emergency stop works before and after failed device discovery                                                                                   |
| Disabled features               | Memory/automation configuration explanations remain visible; execution activation disabled; emergency stop available                                                                                        |
| Voice UI fixtures               | Recording has a static marker; discard uploads nothing; transcribing/responding/synthesizing remain distinct; blocked playback exposes replay and recovery; replay enters playback and Stop returns to idle |
| Reflow                          | No horizontal page overflow at 320×640, 768×900 and 1440×900; 390×844 panel screenshots reviewed                                                                                                            |
| Accessibility preferences       | Emulated reduced motion removes button transitions; forced-color mode retains opaque panels with no backdrop filters                                                                                        |
| Runtime errors                  | No page errors during the final fixture checks                                                                                                                                                              |

Reference captures isolate each panel at 390px. Audit/receipt lists deliberately include every outcome as fixtures, rather than describing one physical operation as having several outcomes. Preferences captures show a save failure after deletion; automation captures show disabled rules, receipts and an informational dry-run.

| Panel/state               | Light                                          | Dark                                         |
| ------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Lights and audit outcomes | [Light](assets/lg04/light-lights.png)          | [Dark](assets/lg04/dark-lights.png)          |
| Preferences and recovery  | [Light](assets/lg04/light-preferences.png)     | [Dark](assets/lg04/dark-preferences.png)     |
| Automations and receipts  | [Light](assets/lg04/light-automations.png)     | [Dark](assets/lg04/dark-automations.png)     |
| Voice recording           | [Light](assets/lg04/light-voice-recording.png) | [Dark](assets/lg04/dark-voice-recording.png) |
| Voice playback recovery   | [Light](assets/lg04/light-voice-recovery.png)  | [Dark](assets/lg04/dark-voice-recovery.png)  |

The web production build (with the root binary PATH noted above), repository typecheck, eight existing frontend tests, touched-file formatting and diff checks passed. The final temporary browser harness `/private/tmp/aura-chat-browser/check-lg04.mjs` passed for both themes; it uses existing local tooling and adds no repository dependencies.

At LG-04 closure, composited contrast, Safari/WebKit, physical touch/keyboard/speech/playback, browser zoom and performance acceptance were deferred to LG-05; see the current results and open manual checks above. The voice fixture verifies interface recovery, not microphone permission handling or real WAV playback. Existing LG-03 references describe the earlier chat slice; the lights surrounding it now use the LG-04 panel treatment.
