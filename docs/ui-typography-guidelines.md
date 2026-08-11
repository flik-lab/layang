# UI Typography Guidelines

Layang uses one compact typography scale across the workbench. Typography communicates hierarchy; selection and runtime status must use color, borders, icons, and surface changes instead of changing text weight.

## Semantic scale

| Role | Size | Weight |
| --- | ---: | ---: |
| Metric / dashboard number | 18px | 600 |
| Page or panel title | 15px | 600 |
| Dialog title | 14px | 600 |
| Section and empty-state title | 13px | 600 |
| Body, row, field value | 12px | 400 |
| Button, tab, menu, selected row | 12px | 500 |
| Field label and status chip | 11px | 500 |
| Caption, helper, secondary text | 11px | 400 |
| Code and editor content | 11.5px | 400 |
| Product brand | 13px | 700 |

Only `400`, `500`, `600`, and `700` are supported. Do not use interpolated weights such as `450`, `520`, `560`, `620`, or `650` because system fonts render them inconsistently across Windows, macOS, and Linux.

## Rules

- Visual UI text must not be smaller than 11px.
- Selected tabs, rows, scenarios, and requests keep the same weight as their unselected state.
- Use background, border, indicator, and foreground color for selection.
- Use 600 for hierarchy, not for every label.
- Use 700 only for the Layang brand or exceptional compact status identifiers.
- Buttons, tabs, and menu actions use 12px/500.
- Chips and field labels use 11px/500.
- Helper and secondary text use 11px/400.
- Code uses the shared monospace stack at 11.5px/400.
- Prefer semantic CSS variables and `designSystem.font`/`designSystem.weight`; avoid inline size and weight overrides.

## Visual checks

Check dark and light modes at 100%, 125%, and 150% zoom. Verify the app bar, request tabs, collection sidebar, gRPC/REST/WebSocket mocks, scenario editor, fullscreen editor, Proto Registry, Documentation, Git, Settings, response viewer, empty states, and dialogs.
