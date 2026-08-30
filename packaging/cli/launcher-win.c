#define UNICODE
#define _UNICODE
#include <windows.h>
#include <process.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

static int executable_dir(wchar_t *buffer, size_t size) {
  DWORD len = GetModuleFileNameW(NULL, buffer, (DWORD)size);
  if (len == 0 || len >= size) return -1;
  wchar_t *slash = wcsrchr(buffer, L'\\');
  if (!slash) return -1;
  *slash = L'\0';
  return 0;
}

int wmain(int argc, wchar_t **argv) {
  wchar_t root[MAX_PATH * 4];
  if (executable_dir(root, sizeof(root) / sizeof(root[0])) != 0) {
    fwprintf(stderr, L"layang: failed to resolve CLI directory\n");
    return 127;
  }

  wchar_t node_path[MAX_PATH * 4];
  wchar_t cli_path[MAX_PATH * 4];
  if (_snwprintf_s(node_path, _countof(node_path), _TRUNCATE, L"%ls\\runtime\\node.exe", root) < 0 ||
      _snwprintf_s(cli_path, _countof(cli_path), _TRUNCATE, L"%ls\\app\\bin\\layang.cjs", root) < 0) {
    fwprintf(stderr, L"layang: CLI path is too long\n");
    return 127;
  }

  const wchar_t **child_argv = calloc((size_t)argc + 2, sizeof(wchar_t *));
  if (!child_argv) {
    fwprintf(stderr, L"layang: out of memory\n");
    return 127;
  }
  child_argv[0] = node_path;
  child_argv[1] = cli_path;
  for (int i = 1; i < argc; ++i) child_argv[i + 1] = argv[i];
  child_argv[argc + 1] = NULL;

  intptr_t code = _wspawnv(_P_WAIT, node_path, child_argv);
  if (code == -1) {
    fwprintf(stderr, L"layang: unable to start bundled runtime\n");
    free(child_argv);
    return 127;
  }
  free(child_argv);
  return (int)code;
}
