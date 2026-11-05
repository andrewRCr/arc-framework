import { expect, it } from "vitest";

import { canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";
import { metadataValue, refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";

it.each([false, true])("names the archive and complete path in a missing record diagnostic (saved=%s)", async saved => {
  const { store, namespace, version } = refObjectReadFixture({ archive: { root: "01_alpha/", quarter: "2026-q4" },
    metadata: JSON.stringify({ ...metadataValue, primary: { ...metadataValue.primary, placement: { kind: "completed", quarter: "2026-q4" } } }),
    missingRecord: true,
  });
  const key = `${namespace}:01_alpha/extra-alpha.md`;
  const result = await store.list({ family: "work-item", ...saved ? { asOf: version } : {} });
  expect(result).toMatchObject({ status: "ok", result: { missed: true, diagnostics: [{ kind: "unreadable", key,
    remedy: { text: expect.stringContaining(key) },
  }] } });
  if (result.status !== "ok" || result.result.status !== "complete") throw new Error("Expected complete listing");
  expect(result.result.diagnostics[0]?.key.split(":")[0]).toBe(namespace);
  expect(ListingOutcomeSchema.safeParse(result.result).success).toBe(true);
});

it.each([false, true])("names the full archived entry alongside a format repair (saved=%s)", async saved => {
  const format = canonicalize({ kind: "work-item/companion", key: "extra" });
  const { store, namespace, version } = refObjectReadFixture({ archive: { root: "01_alpha/", quarter: "2026-q4" },
    metadata: JSON.stringify({ ...metadataValue, formats: { [format]: 2 },
      primary: { ...metadataValue.primary, placement: { kind: "completed", quarter: "2026-q4" } } }),
  });
  const key = `${namespace}:01_alpha/extra-alpha.md`;
  expect(await store.list({ family: "work-item", ...saved ? { asOf: version } : {} })).toMatchObject({ status: "ok", result: {
    missed: true, diagnostics: [{ kind: "unknown-format-version", key, remedy: { text: expect.stringContaining(key) } }],
  } });
});
