# App Zoom Settings

Layang supports desktop-level zoom for users who need larger or smaller text.

## User behavior

- `Ctrl++` / `Cmd++`: increase app zoom.
- `Ctrl+-` / `Cmd+-`: decrease app zoom.
- `Ctrl+0` / `Cmd+0`: reset zoom to 100%.

Zoom controls are intentionally handled through shortcuts so the Layang logo menu can stay focused on workspace actions.

## Persistence

Zoom is stored outside the workspace in Electron `userData` as `app-zoom-settings.json`. This keeps accessibility preferences local to the machine and prevents project exports from changing another user's zoom.

## Bounds

Zoom is clamped between 75% and 175% in 10% steps. The renderer uses Electron `webContents.setZoomFactor`, so the whole app UI scales consistently instead of only changing one CSS font size.
