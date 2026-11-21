---
name: anti-slop-design
description: Rules and a review checklist for designing or changing Layang's website (github-pages/), landing pages, docs pages and marketing copy without the generic "AI-generated" look. Use before writing or reviewing any HTML/CSS/copy for the site, when someone says a page looks templated, generic, or "AI slop", or when adding a new section, screenshot, or release announcement.
---

# Anti-slop design for Layang

A page reads as AI slop when every choice is the default: the same hero, the same cards, the same
glow, the same filler sentences, and nothing that could only belong to this product. The fix is not
"more design". It is fewer, more specific decisions that come from Layang's own world.

Precedence: the maintainer's explicit request, then the Layang tokens at the end of this file, then
these rules.

## 1. Start from the subject, not a template

Before touching HTML, write down (in the PR description or a comment, not on the page):

1. **Reader:** backend and platform engineers who work with gRPC services, protos and internal APIs.
2. **The page's one job:** for the landing page, "download Layang, or understand that the workspace is
   plain files the desktop app and CLI share".
3. **Three things only Layang has.** Use them as content, not decoration. Good sources:
   - the workspace on disk (`layang.yml`, `collections/*.grpc.yml`, `mocks/grpc/scenarios/…`);
   - real CLI commands from `node bin/layang.cjs --help`;
   - gRPC details people recognise: `grpc-status: 0`, trailers, unary vs server-streaming,
     `demo.v1.GreeterService/SayHello`, field numbers in a `.proto`;
   - the name: *layang-layang* is a kite.

If a section would make sense unchanged on another product's site, rewrite or delete it.

## 2. Patterns that make the page look generated

Do not use these unless the maintainer asks for one by name. Each line says what to do instead.

| Slop pattern | Do this instead |
|---|---|
| Near-black page with purple/blue radial glows | A deliberate neutral (cool off-white or true dark) with one accent used for actions only |
| Centered hero: pill announcement, giant headline, two buttons, terminal strip | Left-aligned hero whose right side shows a real artifact: a request file and the CLI output it produces |
| Rounded "eyebrow" pill with a dot above every section heading | Section headings that carry the information; at most a plain label when it encodes something true |
| Bento grid of identical rounded cards with one-sentence features | A table, a list, or a worked example; cards only for objects that really are separate |
| Fake macOS traffic lights around a screenshot that already has a title bar | Show the screenshot as is, cropped to the part that matters, with a caption that says what it shows |
| `01 / 02 / 03` numbering on content that is not a sequence | Number only real steps (import → send → mock → commit) |
| The same section template (label, h2 left, paragraph right, grid) repeated 7 times | Vary the layout by what the content is: a file tree, a table, a code sample, a screenshot |
| Headlines at 96px with negative tracking everywhere | One large statement in the hero; the rest on a calm type scale |
| Emoji or ★ as decoration; "Star 5" counters | A plain GitHub link; show numbers only when they are impressive and current |
| `border-radius: 24px` and a drop shadow on every block | Radius and shadow by role: one surface that must look separate, everything else flat |
| Glassmorphism, `backdrop-filter: blur` navbars, gradient text | Solid surfaces and solid text colors |
| Scroll-triggered fade-ins that leave content invisible until scrolled | Everything readable on load; at most one deliberate motion moment |

## 3. Copy rules

- Write what the reader can do, in their words: "Mock a streaming RPC from a YAML file", not
  "Powerful mocking capabilities".
- No filler adjectives: *seamless, powerful, effortless, blazing, robust, next-generation, unlock,
  supercharge, elevate, all-in-one*.
- No mannered devices: "not X, but Y", colon-then-reveal headlines, em-dash asides, rhetorical
  questions as headings.
- Short declarative sentences. One idea per sentence.
- Use real names and real commands. Every command on the page must run against
  `samples/greeter.proto` with the current CLI.
- Say what is not supported. A short honest limits line ("Client and bidirectional streaming: native
  gRPC only") builds more trust than a claim the app cannot back.

## 4. Honesty and hygiene (release blockers)

- **Versions** on the page, in JSON-LD (`softwareVersion`) and in announcements come from
  `package.json`. Never hand-type them. A stale "v1.1.6 is officially released" banner is worse than none.
- **Platforms:** list only what the release workflow builds (Windows and Linux today). Do not claim
  macOS in copy, JSON-LD `operatingSystem`, or download buttons until a macOS job ships.
- **Screenshots** must use the public sample workspace (`samples/greeter.proto`, `localhost` targets).
  Never ship a screenshot with internal service names, project names, customer data, or private IPs
  (`10.x`, `172.16–31.x`, `192.168.x`). Check every image before committing it.
- **Download section** links to the release, `SHA256SUMS`, and the provenance attestation, and shows
  how to check a download (`sha256sum -c`, `gh attestation verify`).

## 5. Visual system rules

- One accent color, used for links, primary actions and focus. Status colors (OK green, error red)
  are semantic and separate.
- Neutrals with a slight hue toward the accent; never default `#888`-style greys.
- Type: a condensed or characterful face for a few large headings, a readable text face, a mono
  face for code and file paths. Running text ~65ch wide.
- Layout with grid/flex and `gap`. Asymmetry is fine; uniform card walls are not.
- Light and dark both designed through tokens (`prefers-color-scheme`), not a dark-only page by habit.
- Mobile: 16px side gutter minimum, no horizontal page scroll, code blocks scroll inside themselves.
- Accessibility: visible focus, `prefers-reduced-motion` respected, real alt text that describes
  what the screenshot shows.

## 6. Review checklist (run before every site PR)

- [ ] The page's one job is obvious in the first screen, without scrolling.
- [ ] At least three Layang-only details appear as content (files, commands, gRPC terms).
- [ ] No item from the slop table in section 2 is present.
- [ ] No banned filler words; every sentence says something specific.
- [ ] Version, platform list and JSON-LD match `package.json` and the release workflow.
- [ ] Every screenshot uses the public sample; no internal names or private IPs.
- [ ] Every command shown runs with the current CLI against `samples/greeter.proto`.
- [ ] Checked at 390px and 1440px wide, in light and dark.
- [ ] Lighthouse accessibility ≥ 95; no layout shift from images (set `width`/`height`).

## 7. Layang tokens (the site's design direction)

Concept: an engineer's working sheet. Cool paper, ink text, one cobalt accent, files and terminal
output shown at full fidelity. The bold move is typographic: a condensed display face for a few
statements, everything else quiet.

```css
:root {
  --paper: #f4f6f8;       /* page */
  --sheet: #ffffff;       /* raised surface, used sparingly */
  --ink: #12161d;         /* text */
  --ink-2: #4a5462;       /* secondary text */
  --rule: #d5dbe3;        /* hairlines and borders */
  --accent: #1f4fd6;      /* links, primary action, focus */
  --ok: #1a7f4b;          /* grpc-status 0, success */
  --err: #c2382f;         /* errors */
  --font-display: "IBM Plex Sans Condensed", "Arial Narrow", sans-serif;
  --font-text: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}
/* dark: --paper #0f1318, --sheet #161b22, --ink #e7ebf0, --ink-2 #9aa5b3, --rule #29313b, --accent #7aa2ff */
```

The reference layout is the redesign prototype that introduced this skill: hero with the request
file and its CLI output, one real screenshot, the four-step workflow, the workspace tree with notes,
an honest protocol support table, CLI-in-CI, and a download block with checksums.
