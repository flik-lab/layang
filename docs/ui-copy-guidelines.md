# UI copy guidelines

Layang uses concise, predictable copy so technical screens remain easy to scan.

## Style

- Use sentence case for titles, labels, actions, and status text.
- Prefer a short noun or verb phrase over a full sentence.
- Keep visible helper text only when it changes how a value is understood.
- Keep detailed accessibility instructions in `aria-label` and visually hidden text.
- Use tooltips for icon-only actions and information that is not already visible.
- Do not repeat the same status in a header, chip, subtitle, and control.
- Limit a compact header to two status chips.
- Put paths, IDs, hashes, and revisions in a details area, tooltip, or action menu.

## Standard terms

| Use | Avoid |
| --- | --- |
| Host | Bind IP, IP |
| Interval (ms) | Stream interval |
| Loop count | Max loops |
| Add scenario | New scenario |
| Reload file | Fetch file |
| Show in folder | Open file location |
| Revert | Discard |
| Unmatched | No match |
| Requests | Request logs when the section already provides logging context |

## Confirmation dialogs

Use a clear question, one concise consequence, and direct actions.

```text
Delete “Scenario A”?

This scenario file will be removed.

Cancel   Delete
```

## Accessibility

Visible copy may be shortened, but icon buttons must keep descriptive `aria-label` text. Error text must retain the full parser message through visible details, a title, or assistive text.

## Request tabs and headers

- A request tab shows only the request name and its status dot.
- Put the operation or endpoint in the tab tooltip; do not repeat the request name there.
- A request header uses the saved request name as the title.
- Show one protocol badge at most. Put service/method or collection/URL context on the subtitle line.
- Do not add a separate Running chip when the Run/Stop action already communicates runtime state.

## Mock panels

REST, WebSocket, and gRPC mock panels use the same visible section names where applicable:

```text
Server
Scenario
Matchers
Response
Requests
```

Use `Delay (ms)`, `Interval (ms)`, and `Loop count` for numeric timing controls. Keep template-variable lists short in the layout and expose the complete list through a tooltip or details text.


## Dialogs and confirmations

- Use sentence case for dialog titles.
- Put the object name in the title when it helps recognition.
- Show counts and consequences as separate short lines instead of one paragraph.
- Mention irreversible behavior once. Do not repeat `permanently`, `cannot be undone`, and the same consequence in the title, body, and button.
- Use `Cancel` plus one direct primary action such as `Delete`, `Create revision`, or `Save`.

## Dense technical pages

- Keep the page header to a title, one context line, and no more than two status indicators.
- Put hashes, IDs, full paths, revision internals, and generated counters in `Technical details`.
- Keep helper text conditional. Do not explain normal controls when their label is sufficient.
- Empty states use one title and one short next step.
- Settings cards should describe only behavior that is not obvious from the controls.
- Git credentials, proxy, SSH agent, and CA details belong in one concise security note rather than repeated paragraphs.

## Final interaction guardrails

- The active request tab must scroll into view when it changes.
- Arrow, Home, and End navigation must move both selection and keyboard focus.
- Icon-only actions require a descriptive `aria-label` and a visible focus ring.
- Scenario list items support Space to select and Enter to open.
- Dialog action rows wrap instead of clipping actions on narrow windows.
- Copy constants are preferred for shared mock actions, statuses, and numeric field labels.

## Manual file synchronization

- Use **Open folder** for opening the scenario directory in the desktop file manager.
- Use **Sync file** for explicitly loading the latest disk version into the editor.
- Syncing updates the editor draft only; **Save** remains the apply boundary.
- Keep file actions visible to the left of editor actions instead of hiding the primary workflow in an overflow menu.

## Typography

Copy hierarchy follows `docs/ui-typography-guidelines.md`. Do not compensate for verbose copy by shrinking text below 11px or applying extra bold weight. Shorten the copy and preserve the semantic typography scale.
