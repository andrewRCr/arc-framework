/** Immutable merge-parent evidence for delivery plans reconstructed from reaped field refs. */

export interface DeliveryFieldMember {
  readonly chunkKey: string;
  readonly title: string;
  readonly contract: string;
  readonly pullRequest: number;
  readonly mergeCommit: string;
  readonly base: string;
  readonly head: string;
}

export interface DeliveryFieldRun {
  readonly workUnitId: string;
  readonly members: readonly DeliveryFieldMember[];
}

export const SEVEN_MEMBER_FIELD_RUN: DeliveryFieldRun = {
  workUnitId: "decompose-transform-integrity",
  members: [
    member("planning", "Planning baseline", 382,
      "a2f1dd7d03f5923eaba9363618ef9c7e097e0efc", "7b2716512290d7973a12380cb655dacff0243a62",
      "fd4fe231c3776673487fbce0cfbb1be6266df426"),
    member("authority", "Transition authority", 383,
      "2fab0bcbfd8ca6b54622c0375da0e0d252c96a03", "a2f1dd7d03f5923eaba9363618ef9c7e097e0efc",
      "85df1f36ffbde9f71ea8495f669f4ba1a71cc4e6"),
    member("result-plan", "Exact result planning", 384,
      "d0312ff4b8efbb6eab184f0947ce2ee919efff42", "2fab0bcbfd8ca6b54622c0375da0e0d252c96a03",
      "a8d72fe4685b796402de23e6e1c1c5da048fc840"),
    member("finalization", "Candidate finalization", 385,
      "2c6c208b06d189faf686ecf6584c6c7c28283450", "d0312ff4b8efbb6eab184f0947ce2ee919efff42",
      "162528c1d9f4b3d4f693897ae39c862da134eb3e"),
    member("publication-authority", "Publication authority", 386,
      "62504727cc4521c86fb7274969760e51857320d8", "2c6c208b06d189faf686ecf6584c6c7c28283450",
      "1cef7d8100ade53039eeca53d9bce67e5a0cd044"),
    member("lifecycle-publication", "Lifecycle publication", 392,
      "f69cc4a46dac91091ad076a8f6232c34a6fc4d0b", "62504727cc4521c86fb7274969760e51857320d8",
      "a6146ab3d4b8886a0e101f9d6561fab272259af6"),
    member("legacy-retirement", "Legacy retirement", 393,
      "2beef3fa27a75e9d995202b08d3dfa5377c2a85f", "f69cc4a46dac91091ad076a8f6232c34a6fc4d0b",
      "116c36e7f7a68b9af12080e8583c179f892b389b"),
  ],
};

export const ROLLING_FIELD_RUN: DeliveryFieldRun = {
  workUnitId: "session-locus-model",
  members: [
    member("delivery-plan", "Delivery planning baseline", 395,
      "bb6803b620047efa447fac5a291eff20b6a3c2ce", "b5bf493db626a27fcab2571fbff21fa3c7b5b7ad",
      "52693a7541abb370e5783c317d2f9875581ea4f1"),
    member("record-substrate", "Locus record substrate", 396,
      "56d52f013be8a602615bb312322ca0d346c3f882", "bb6803b620047efa447fac5a291eff20b6a3c2ce",
      "c055a31cf164205b3aa12bad9fcd853fc601d334"),
    member("process-inspection", "Process and platform inspection", 397,
      "6eebb7f3150c6c978be0b93af28e0ed8739fdc7a", "56d52f013be8a602615bb312322ca0d346c3f882",
      "6b699eff1b510988eb794c02404ef76808f09442"),
    member("mutation-protocol", "Lock and mutation protocol", 399,
      "ba2ce7272fec5df48a133654e009ba6a0a5ca222", "6eebb7f3150c6c978be0b93af28e0ed8739fdc7a",
      "81a188fd6b8c6361bd615ca43e07fcb90efd18b3"),
    member("control-isolation", "Control-plane isolation", 400,
      "9c2f43ff9011411d1eb4cd47796701fe3d266458", "ba2ce7272fec5df48a133654e009ba6a0a5ca222",
      "0d56c8eb50a2f4ee4370056714709f4c994bc70b"),
    member("transient-identity", "Transient identity core", 401,
      "6b221838092d57d8a04180bfcf61df8ba4ee8429", "9c2f43ff9011411d1eb4cd47796701fe3d266458",
      "d696419abbdb6a99bfa769f782e1abc9759d82bc"),
    member("reconciliation", "Locus reconciliation", 402,
      "6a5a0b9733ab30b11984147d0d6190952acadfaa", "676d5d7c368cfa054b63d7b82a7ac2c32a6a394b",
      "02153d3e093d005399762bbe5626bdd4023d39d7"),
    member("roster-reader", "Evidence and roster reader", 405,
      "39e2f090ea416c317bfb8350b24edab3aafafeaa", "8f7728e90e71d05fc797e58e87a2ed00f277cd00",
      "334b4179c3377ce262eeaa5ad6bf681308cf09cf"),
    member("allocation", "Allocation and provisioning", 407,
      "578e06685301f46d42e2390eb01a8aea27441771", "663ae309286abcb415e6879f82b0d3ab990c5a86",
      "3d867fa9eb52415e893900dd642df90bcba12420"),
    member("errand-open-link", "Errand open and link", 410,
      "06c93e6b85cac207985ede3a4b7123bc3a253110", "0fd41c0ed9288f5da5dbdb43a99f7d735a16b9e1",
      "843504c63aa38f8401970569e487d844fb5b3416"),
    member("errand-terminals", "Errand terminals", 416,
      "ce9ce0fdb20b9ecd4df7fa32b26d3c9df51e0ffd", "06c93e6b85cac207985ede3a4b7123bc3a253110",
      "22d77f908b662516206f57325fa7df0bba10e86b"),
    member("process-boundary-fix", "Process-boundary correction", 419,
      "000770fb81e9ea76b2e67686ddbe3a6068a6bad3", "b94395b30c9aeb95c029a3aba71dd2e31c79e425",
      "8616e4f1576deb885dcb56e22b985749a60facbc"),
    member("errand-base-close-fix", "Base-context close correction", 421,
      "bc7b643ddcaee10b028c4f5f8fca3aeebb31c07f", "e76d1802594e6ae578e941277c0e692ba2508b07",
      "2fdb25fc34dadd3f76d75f5cf8f8f161a0071074"),
    member("errand-promotion", "Errand promotion", 422,
      "34b28d22a682ec75ebf94abe807453342f40c4fb", "bc7b643ddcaee10b028c4f5f8fca3aeebb31c07f",
      "51fb5ec3fa0300901d3bf43d262086e9f129b4ef"),
    member("work-unit-integration", "Work-unit locus integration", 423,
      "ca691fd385eadf8f30ab547f867570e1c96c17f1", "34b28d22a682ec75ebf94abe807453342f40c4fb",
      "d67abfd017b6bf1e2d91af4b167b63fe4a7f4af1"),
    member("recovery", "Locus recovery", 424,
      "0b0e64ee8fcda242b7433197f0bdb6b4dfc14e43", "ca691fd385eadf8f30ab547f867570e1c96c17f1",
      "04cd9b4652d439092558d0efb297f792714199fa"),
    member("work-unit-adoption-fix", "Work-unit adoption correction", 425,
      "4cde8b5759811d22aeda6e76af06a8352644d211", "827c5bc89ea2847b079094c4f0b03f13d144eb5c",
      "9a1f43a514b555dae07a734fe2a9da4562182754"),
    member("recovery-cursor-fix", "Recovery cursor correction", 428,
      "9b2d0b10ccca993f42be2087760492d1394c57ab", "4cde8b5759811d22aeda6e76af06a8352644d211",
      "c90b6c8522e4431d916490223bc4948abca62f1f"),
    member("errand-finalization-fix", "Errand finalization correction", 432,
      "d9ca2fba2e75d5093ecba5a881a64d86be7bbfa5", "9985aa6c71c92d1d0f7307fc290f54d26a84e054",
      "e1c6cac671b5f45189a4d8a44f6be8c4570eeb4a"),
    member("session-wiring", "Session wiring and locus surface", 429,
      "40e640faaa86b514ca7cda37e46468069f5f1b74", "d9ca2fba2e75d5093ecba5a881a64d86be7bbfa5",
      "69229c724ddf4d8b21baf1c691498e8725b6e503"),
    member("surface-reconciliation", "Documented-surface reconciliation", 433,
      "2bd5b01b026600550c3993b9c11039f7af367fee", "40e640faaa86b514ca7cda37e46468069f5f1b74",
      "cae74d0c7cf8b387b4abd424bfb9d3e2e8a92285"),
  ],
};

/** The recorded base absorb whose authored conflict resolution prevents a purity proof. */
export const SEVEN_MEMBER_AMBIENT_MERGE = "a0e6d1533e1d6fa0c9fd51b25f85208d451e8697";
/** Bespoke archival closeout is deliberately outside the rolling delivery plan. */
export const ROLLING_CLOSEOUT_MERGE = "53de48b0b0e279c96b1707f53969f27ac20bdf70";

/** One authored seam per rolling predecessor/successor boundary. */
export function adjacentFieldSeams(run: DeliveryFieldRun) {
  return run.members.slice(1).map((member, index) => {
    const predecessor = run.members[index];
    if (predecessor === undefined) throw new Error("expected predecessor member");
    return {
      seamKey: `into-${member.chunkKey}`,
      title: `${predecessor.title} into ${member.title}`,
      acceptance: `${member.title} preserves the predecessor contract`,
      incidentChunkKeys: [predecessor.chunkKey, member.chunkKey],
      designElementIds: [],
    };
  });
}

function member(
  chunkKey: string,
  title: string,
  pullRequest: number,
  mergeCommit: string,
  base: string,
  head: string,
): DeliveryFieldMember {
  return {
    chunkKey,
    title,
    contract: `Publish ${title.toLowerCase()}`,
    pullRequest,
    mergeCommit,
    base,
    head,
  };
}
