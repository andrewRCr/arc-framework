/** Unit coverage for contained native ARC path materialization. */

import { posix, win32 } from "node:path";

import { describe, expect, it } from "vitest";

import { validateManagedPath, type ManagedPath } from "../../../src/lib/kernel/index.js";
import { LayoutError, materializeArcPath } from "../../../src/lib/layout/index.js";
import { materializeArcPathWithSemantics } from "../../../src/lib/layout/materialization.js";

const managed = (value: string) => validateManagedPath(value);

function expectLayoutError(action: () => unknown, code: string, withCause = false): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(LayoutError);
  expect(thrown).toMatchObject({ code });
  if (withCause) expect((thrown as Error).cause).toBeDefined();
}

describe("materializeArcPathWithSemantics", () => {
  it("materializes strict descendants with POSIX semantics", () => {
    expect(materializeArcPathWithSemantics(posix, "/repo/root", managed(".arc/active/meta-sample.md")))
      .toBe("/repo/root/.arc/active/meta-sample.md");
  });

  it("materializes drive-qualified and UNC roots with Windows semantics", () => {
    expect(materializeArcPathWithSemantics(win32, "C:\\repo", managed(".arc/user/a/WORKING-MEMORY.md")))
      .toBe("C:\\repo\\.arc\\user\\a\\WORKING-MEMORY.md");
    expect(materializeArcPathWithSemantics(win32, "\\\\server\\share\\repo", managed(".arc/active")))
      .toBe("\\\\server\\share\\repo\\.arc\\active");
  });

  it.each([
    "",
    "relative/root",
    "./relative",
    "/repo/../escape",
    "/repo/./root",
    "/repo\0root",
  ])("rejects invalid POSIX root %s", (root) => {
    expectLayoutError(
      () => materializeArcPathWithSemantics(posix, root, managed(".arc/active")),
      "layout.invalid-materialization-root",
    );
  });

  it.each([
    "C:repo",
    "\\repo",
    "/repo",
    "\\\\?\\C:\\repo",
    "\\\\.\\C:\\repo",
    "C:\\repo\\..\\escape",
    "C:\\repo\\.\\root",
    "\\\\server",
    "\\\\server\\share\\..\\escape",
  ])("rejects invalid Windows root %s", (root) => {
    expectLayoutError(
      () => materializeArcPathWithSemantics(win32, root, managed(".arc/active")),
      "layout.invalid-materialization-root",
    );
  });

  it.each(["../escape", "/absolute", "a\\b", "a//b", "a\0b"])(
    "revalidates cast managed path %s",
    (value) => {
      expectLayoutError(
        () => materializeArcPathWithSemantics(posix, "/repo", value as ManagedPath),
        "layout.invalid-managed-path",
        true,
      );
    },
  );

  it("rejects a Windows drive-designator descendant segment", () => {
    expectLayoutError(
      () => materializeArcPathWithSemantics(win32, "C:\\repo", "x/D:bar" as ManagedPath),
      "layout.invalid-managed-path",
    );
  });
});

describe("materializeArcPath", () => {
  it("uses host semantics without resolving against process cwd", () => {
    const root = posix.resolve("/tmp", "arc-layout-root");
    expect(materializeArcPath(root, managed(".arc/backlog/ROADMAP.md")))
      .toBe(posix.join(root, ".arc/backlog/ROADMAP.md"));
  });
});
