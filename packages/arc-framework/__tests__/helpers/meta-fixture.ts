/** Canonical work-unit meta Markdown for tests. */

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import type { MetaRenderOverrides } from "../../src/lib/active/meta-reader.js";

/**
 * Build a full semantic meta fixture through the production renderer.
 * @param name - Work-unit name in the heading.
 * @param overrides - Semantic fields to change from fixture defaults.
 * @returns Canonical Markdown ready for optional narrative sections.
 */
export function makeMetaFixture(name: string, overrides: MetaRenderOverrides = {}): string {
  return renderMetaFile(name, { state: "Active", owner: "test-owner", ...overrides });
}
