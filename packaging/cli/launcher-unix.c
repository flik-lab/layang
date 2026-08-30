#define _GNU_SOURCE
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int executable_dir(char *buffer, size_t size, const char *argv0) {
  ssize_t len = readlink("/proc/self/exe", buffer, size - 1);
  if (len > 0) {
    buffer[len] = '\0';
  } else {
    if (!realpath(argv0, buffer)) return -1;
  }
  char *slash = strrchr(buffer, '/');
  if (!slash) return -1;
  *slash = '\0';
  return 0;
}

int main(int argc, char **argv) {
  char root[PATH_MAX];
  if (executable_dir(root, sizeof(root), argv[0]) != 0) {
    fprintf(stderr, "layang: failed to resolve CLI directory\n");
    return 127;
  }

  char node_path[PATH_MAX];
  char cli_path[PATH_MAX];
  if (snprintf(node_path, sizeof(node_path), "%s/runtime/node", root) >= (int)sizeof(node_path) ||
      snprintf(cli_path, sizeof(cli_path), "%s/app/bin/layang.cjs", root) >= (int)sizeof(cli_path)) {
    fprintf(stderr, "layang: CLI path is too long\n");
    return 127;
  }

  char **child_argv = calloc((size_t)argc + 2, sizeof(char *));
  if (!child_argv) {
    fprintf(stderr, "layang: out of memory\n");
    return 127;
  }
  child_argv[0] = node_path;
  child_argv[1] = cli_path;
  for (int i = 1; i < argc; ++i) child_argv[i + 1] = argv[i];
  child_argv[argc + 1] = NULL;

  execv(node_path, child_argv);
  fprintf(stderr, "layang: unable to start bundled runtime: %s\n", strerror(errno));
  free(child_argv);
  return 127;
}
