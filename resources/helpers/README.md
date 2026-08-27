# Optional mkcert helpers

Layang detects `mkcert` from `PATH`. Offline distributions may place platform binaries here before packaging:

- `win32/x64/mkcert.exe`
- `win32/arm64/mkcert.exe`
- `linux/x64/mkcert`
- `linux/arm64/mkcert`

The application never downloads or trusts a CA silently. The Local HTTPS wizard asks the user before running `mkcert -install`.
