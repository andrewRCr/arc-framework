/** Preserve import refusal identities while adding the continuation for an already landed import. */
import type { StoreCommandRefusal, StoreMigrateResult } from "../../commands.js";
import type { Remedy, StoreRefusal } from "../../refusal.js";

/** Keep the original repair instruction and route its continuation through import publication. */
export function importRetry(remedy: Remedy): Remedy {
  return { text: `${remedy.text} Then rerun arc store migrate --import to publish its existing landing.`,
    argv: ["arc", "store", "migrate", "--import"] };
}

/** Preserve every store refusal field apart from its import-specific continuation. */
export function storeFailure(refusal: StoreRefusal): StoreMigrateResult {
  return { status: "refused", refusal: { code: "store", refusal: { ...refusal, remedy: importRetry(refusal.remedy) } } };
}

/** Retain both command and nested store refusal codes and classes during source retirement. */
export function importCommandFailure(refusal: StoreCommandRefusal): StoreMigrateResult {
  if (refusal.code === "store") return storeFailure(refusal.refusal);
  return { status: "refused", refusal: { ...refusal, remedy: importRetry(refusal.remedy) } };
}
