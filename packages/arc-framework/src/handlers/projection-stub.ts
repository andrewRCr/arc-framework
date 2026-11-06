/** Bind projection stub creation to the ordinary lifecycle executor and the command's actual Store. */
import { createUserIOContext } from "../lib/io-context.js";
import { markStoreRefusal } from "../lib/store/projection/refusal-mark.js";
import { runStub } from "../lib/work-unit/verbs/stub.js";
import type { ProjectionStubMintRequest, ProjectionStubMintResult } from "../lib/store/projection/stub-mint-port.js";
import { buildExecutor } from "./lifecycle-shared.js";

/** Mint through the normal stub contract, retaining the real primary receipt rather than looking its name up again. */
export async function mintProjectionStub(input: ProjectionStubMintRequest): Promise<ProjectionStubMintResult> {
  const io = createUserIOContext();
  const { executor } = await buildExecutor({ cwd: input.checkout, store: input.store, identity: input.params.owner, io });
  const minted = await runStub({ executor, fs: { mkdir: io.mkdir, writeFile: io.writeFile } }, input.params);
  if (minted.status === "rejected") return { kind: "refused", mark: minted.refusal === undefined ? { reason: minted.reason,
    remedy: { text: "Repair the reported arc stub condition, then retry adoption." } } : markStoreRefusal(minted.refusal) };
  const receipt = minted.outcome.status === "ok" ? minted.outcome.storeBatch?.writes[0] : undefined;
  if (receipt?.reference.kind !== "work-item/meta" || receipt.reference.owner.type !== "work-item"
    || receipt.reference.owner.uid === undefined || receipt.reference.owner.name !== input.params.name || receipt.version === undefined) {
    return { kind: "refused", mark: { reason: "The stub operation returned no exact primary creation receipt.",
      remedy: { text: "Inspect the stored stub and repair its creation result before retrying adoption." } } };
  }
  return { kind: "created", receipt };
}
