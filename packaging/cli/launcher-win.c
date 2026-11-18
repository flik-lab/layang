#define UNICODE
#define _UNICODE
#include <windows.h>
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

/* Growable wide string for the child command line. */
typedef struct {
  wchar_t *data;
  size_t length;
  size_t capacity;
} wbuffer;

static int append_char(wbuffer *buffer, wchar_t character) {
  if (buffer->length + 2 > buffer->capacity) {
    size_t capacity = buffer->capacity ? buffer->capacity * 2 : 1024;
    wchar_t *data = realloc(buffer->data, capacity * sizeof(wchar_t));
    if (!data) return -1;
    buffer->data = data;
    buffer->capacity = capacity;
  }
  buffer->data[buffer->length++] = character;
  buffer->data[buffer->length] = L'\0';
  return 0;
}

static int append_repeat(wbuffer *buffer, wchar_t character, size_t count) {
  for (size_t i = 0; i < count; ++i)
    if (append_char(buffer, character) != 0) return -1;
  return 0;
}

/*
 * Appends one argument so that CommandLineToArgvW / the MSVC runtime in the child parses it back
 * unchanged: arguments with spaces, tabs or quotes are quoted, and backslashes before a quote are
 * doubled. (_wspawnv joins arguments with spaces without quoting, which split "FE Main Display".)
 */
static int append_argument(wbuffer *buffer, const wchar_t *argument) {
  if (buffer->length && append_char(buffer, L' ') != 0) return -1;
  if (*argument && !wcspbrk(argument, L" \t\n\v\"")) {
    for (const wchar_t *cursor = argument; *cursor; ++cursor)
      if (append_char(buffer, *cursor) != 0) return -1;
    return 0;
  }
  if (append_char(buffer, L'"') != 0) return -1;
  for (const wchar_t *cursor = argument;; ++cursor) {
    size_t backslashes = 0;
    while (*cursor == L'\\') {
      ++backslashes;
      ++cursor;
    }
    if (*cursor == L'\0') {
      if (append_repeat(buffer, L'\\', backslashes * 2) != 0) return -1;
      break;
    }
    if (*cursor == L'"') {
      if (append_repeat(buffer, L'\\', backslashes * 2 + 1) != 0 || append_char(buffer, L'"') != 0) return -1;
    } else {
      if (append_repeat(buffer, L'\\', backslashes) != 0 || append_char(buffer, *cursor) != 0) return -1;
    }
  }
  return append_char(buffer, L'"');
}

/* Ctrl+C reaches the child through the shared console; the launcher waits for its exit code. */
static BOOL WINAPI ignore_console_signal(DWORD signal) {
  (void)signal;
  return TRUE;
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

  wbuffer command = {0};
  int failed = append_argument(&command, node_path) != 0 || append_argument(&command, cli_path) != 0;
  for (int i = 1; !failed && i < argc; ++i) failed = append_argument(&command, argv[i]) != 0;
  if (failed) {
    fwprintf(stderr, L"layang: out of memory\n");
    free(command.data);
    return 127;
  }

  STARTUPINFOW startup = {0};
  PROCESS_INFORMATION process = {0};
  startup.cb = sizeof(startup);
  SetConsoleCtrlHandler(ignore_console_signal, TRUE);
  if (!CreateProcessW(node_path, command.data, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &process)) {
    fwprintf(stderr, L"layang: unable to start bundled runtime (error %lu)\n", GetLastError());
    free(command.data);
    return 127;
  }
  free(command.data);
  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD code = 127;
  GetExitCodeProcess(process.hProcess, &code);
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  return (int)code;
}
