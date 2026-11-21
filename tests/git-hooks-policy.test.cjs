"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const git = require("../lib/git-client.cjs");
const { createGitHooksPolicy, HOOK_RUNNING_GIT_CHANNELS } = require("../electron/utils/git-hooks-policy.cjs");

function hasGit() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function repoWithPreCommitHook() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "layang-git-hooks-")));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Layang Test"]);
  const marker = path.join(root, "hook-ran");
  const hook = path.join(root, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, `#!/bin/sh\necho ran > "${marker.replaceAll("\\", "/")}"\n`);
  fs.chmodSync(hook, 0o755);
  fs.writeFileSync(path.join(root, ".gitignore"), "hook-ran\n");
  return { root, marker };
}

test("listRepositoryHooks reports real hooks and ignores the .sample files git init creates", { skip: !hasGit() }, async () => {
  const { root } = repoWithPreCommitHook();
  const found = await git.listRepositoryHooks(root);
  assert.equal(found.root, root);
  assert.deepEqual(found.hooks, ["pre-commit"]);
});

test("listRepositoryHooks follows core.hooksPath from the repository config", { skip: !hasGit() }, async () => {
  const { root } = repoWithPreCommitHook();
  const custom = path.join(root, "tools", "hooks");
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, "pre-push"), "#!/bin/sh\nexit 0\n");
  execFileSync("git", ["-C", root, "config", "core.hooksPath", "tools/hooks"]);
  assert.deepEqual((await git.listRepositoryHooks(root)).hooks, ["pre-push"]);
});

test("a commit inside runWithGitHooksDisabled does not run the repository's hooks", { skip: !hasGit() }, async () => {
  const { root, marker } = repoWithPreCommitHook();
  fs.writeFileSync(path.join(root, "a.txt"), "a\n");
  await git.stagePaths(root, ["a.txt", ".gitignore"]);
  await git.runWithGitHooksDisabled(() => git.commitChanges(root, { message: "without hooks" }));
  assert.equal(fs.existsSync(marker), false);

  fs.writeFileSync(path.join(root, "b.txt"), "b\n");
  await git.stagePaths(root, ["b.txt"]);
  await git.commitChanges(root, { message: "with hooks" });
  assert.equal(fs.existsSync(marker), true, "hooks still run when the user allowed them");
});

test("the policy asks once per repository, remembers the answer and asks again when hooks change", async () => {
  const storePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "layang-hook-store-")), "decisions.json");
  let hooks = ["pre-commit"];
  const prompts = [];
  let answer = "skip";
  const make = () =>
    createGitHooksPolicy({
      storePath,
      platform: "linux",
      listHooks: async () => ({ root: "/repo", hooksDirectory: "/repo/.git/hooks", hooks }),
      confirm: async (info) => {
        prompts.push(info.hooks.join(","));
        return answer;
      },
    });

  const policy = make();
  assert.equal(await policy.decide("/repo"), "skip");
  assert.equal(await policy.decide("/repo/sub"), "skip");
  assert.equal(prompts.length, 1);

  // Persisted across restarts.
  assert.equal(await make().decide("/repo"), "skip");
  assert.equal(prompts.length, 1);

  hooks = ["pre-commit", "pre-push"];
  answer = "run";
  assert.equal(await policy.decide("/repo"), "run");
  assert.deepEqual(prompts, ["pre-commit", "pre-commit,pre-push"]);
});

test("repositories without hooks never prompt, and a dismissed prompt cancels without remembering", async () => {
  let prompts = 0;
  const noHooks = createGitHooksPolicy({
    listHooks: async () => ({ root: "/a", hooks: [] }),
    confirm: async () => {
      prompts += 1;
      return "run";
    },
  });
  assert.equal(await noHooks.decide("/a"), "run");
  const notARepo = createGitHooksPolicy({
    listHooks: async () => {
      throw new Error("not a repository");
    },
  });
  assert.equal(await notARepo.decide("/b"), "run");
  assert.equal(prompts, 0);

  const cancelled = createGitHooksPolicy({
    listHooks: async () => ({ root: "/c", hooks: ["post-checkout"] }),
    confirm: async () => {
      prompts += 1;
      return "cancel";
    },
  });
  assert.equal(await cancelled.decide("/c"), "cancel");
  assert.equal(await cancelled.decide("/c"), "cancel");
  assert.equal(prompts, 2);
});

test("every Git IPC channel that can run hooks goes through the policy", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "git-ipc.cjs"), "utf8");
  for (const channel of HOOK_RUNNING_GIT_CHANNELS) assert.match(source, new RegExp(`handle\\("${channel}"`));
  assert.match(source, /runWithHookDecision\(channel, payload \|\| \{\}, action\)/);
  assert.match(source, /git\.runWithGitHooksDisabled\(/);
});
