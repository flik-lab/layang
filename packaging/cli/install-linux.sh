#!/usr/bin/env sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INSTALL_ROOT=${LAYANG_CLI_HOME:-"$HOME/.local/share/layang-cli"}
BIN_DIR=${LAYANG_CLI_BIN:-"$HOME/.local/bin"}

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

# Preserve an existing desktop `layang` command before the CLI shadows it.
# This lets `layang ui .` discover the GUI through a stable layang-gui alias.
if command -v layang >/dev/null 2>&1 && ! command -v layang-gui >/dev/null 2>&1; then
  EXISTING_LAYANG=$(command -v layang)
  case "$EXISTING_LAYANG" in
    "$INSTALL_ROOT"/*|"$SOURCE_DIR"/*) ;;
    *) ln -sfn "$EXISTING_LAYANG" "$BIN_DIR/layang-gui" ;;
  esac
fi

cp -R "$SOURCE_DIR"/. "$INSTALL_ROOT"/
chmod +x "$INSTALL_ROOT/layang" "$INSTALL_ROOT/runtime/node"
ln -sfn "$INSTALL_ROOT/layang" "$BIN_DIR/layang"

printf 'Layang CLI installed at %s\n' "$INSTALL_ROOT"
printf 'Command: %s/layang\n' "$BIN_DIR"
case ":${PATH:-}:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Add %s to PATH if your shell does not already include it.\n' "$BIN_DIR" ;;
esac
