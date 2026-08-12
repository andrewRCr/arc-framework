import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

describe("delivery terminal integration attachment", () => {
  it("keeps package/project parity and places one total attachment between merge confirmation and close", async () => {
    const [packaged, installed] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(root, ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    const attachment = "Invoke the typed delivery terminal post-merge attachment exactly once";
    expect(packaged.split(attachment)).toHaveLength(2);
    const merge = packaged.indexOf("gh pr merge {pr-number}");
    const resume = packaged.indexOf("**Skip the merge when the PR is already merged**");
    const attach = packaged.indexOf(attachment);
    const close = packaged.indexOf("arc user close {name}", attach);
    const teardown = packaged.indexOf("arc teardown <wu-name>", close);
    expect(merge).toBeLessThan(attach);
    expect(resume).toBeLessThan(attach);
    expect(attach).toBeLessThan(close);
    expect(close).toBeLessThan(teardown);
    expect(packaged.slice(attach, close)).toMatch(/attached.*already-attached.*not-applicable.*blocked/su);
    expect(packaged.slice(attach, close)).toMatch(/no reservation.*no authorization/su);
    const newBlock = packaged.slice(resume, packaged.indexOf("Retire the per-WU user workspace", attach));
    const priorBlock = "**Skip the merge when the PR is already merged** — the resume path's PR-merged arm "
      + "(Step 1) enters here with the\nmerge already landed (attended elsewhere, or unattended on the auto-merge "
      + "lane); proceed straight to `arc user\nclose`.\n\n";
    const reconstructed = packaged.replace(newBlock, priorBlock);
    expect(createHash("sha256").update(reconstructed).digest("hex"))
      .toBe("1e861ea36c80abf02d7dbb832457ca555c6556fe35502389ee520a8d584e17da");
  });
});
