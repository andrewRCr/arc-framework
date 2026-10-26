/** Invocation-owned credentials stay isolated while native Git keeps cwd and object policy. */
import { Buffer } from "node:buffer";
import { expect, it } from "vitest";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { refSyncFixture } from "../../helpers/store/ref-sync.js";

it("keeps concurrent principals in their own environment across all three native adapters", async () => {
  const h = await refSyncFixture();
  const helper = '!f() { printf "username=%s\\npassword=synthetic\\n" "$ARC_EXECUTOR_PRINCIPAL"; }; f';
  const args = ["-c", "credential.helper=", "-c", `credential.helper=${helper}`, "credential", "fill"];
  const input = "protocol=https\nhost=example.invalid\n\n";
  const ambient = process.env.ARC_EXECUTOR_PRINCIPAL;
  await Promise.all(["writer", "reader"].map(async name => {
    const environment = { ...process.env, ARC_EXECUTOR_PRINCIPAL: name, GIT_DIR: "/wrong-repository", GIT_TERMINAL_PROMPT: "0" };
    const captured = createExecaGitExec(undefined, environment);
    const fed = createExecaGitExecInput(undefined, undefined, environment);
    const raw = createExecaRawGitExec(h.a.root, undefined, undefined, environment);
    environment.ARC_EXECUTOR_PRINCIPAL = "mutated-after-binding";
    const [text, bytes, root, principal] = await Promise.all([
      fed(args, input, { cwd: h.a.root }),
      raw(args, { input: Buffer.from(input) }),
      captured("git", ["rev-parse", "--show-toplevel"], { cwd: h.a.root }),
      captured("git", ["-c", 'alias.who=!printf %s "$ARC_EXECUTOR_PRINCIPAL"', "who"], { cwd: h.a.root }),
    ]);
    expect(text).toContain(`username=${name}\n`);
    expect(Buffer.from(bytes.stdout).toString()).toContain(`username=${name}\n`);
    expect(root.stdout).toBe(h.a.root);
    expect(principal.stdout).toBe(name);
  }));
  expect(process.env.ARC_EXECUTOR_PRINCIPAL).toBe(ambient);
});

it("applies stable diagnostics to one stdin-fed Git invocation without changing its bound locale", async () => {
  const h = await refSyncFixture();
  const fed = createExecaGitExecInput(undefined, undefined, { ...process.env, LC_ALL: "POSIX", LANG: "POSIX" });
  const args = ["-c", 'alias.report-locale=!printf "%s:%s" "$LC_ALL" "$LANG"', "report-locale"];
  expect(await fed(args, "", { cwd: h.a.root })).toBe("POSIX:POSIX");
  expect(await fed(args, "", { cwd: h.a.root, diagnosticLocale: "stable" })).toBe("C:C");
  expect(await fed(args, "", { cwd: h.a.root })).toBe("POSIX:POSIX");
});
