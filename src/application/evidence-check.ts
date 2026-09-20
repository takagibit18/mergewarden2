import { createHash } from "node:crypto";
import type { FindingCandidate } from "../domain/contracts.ts";
import type { SourceReader } from "../ports/source.ts";
/** Checks source integrity only; does not decide semantic correctness. */
export async function checkEvidence(candidate: FindingCandidate, source: SourceReader): Promise<{ ok: boolean; failures: string[] }> {
  const failures: string[] = [];
  for (const ref of candidate.evidence) {
    try {
      const result = await source.read(ref);
      const measured = createHash("sha256").update(result.text, "utf8").digest("hex");
      if (measured !== ref.contentSha256 || result.actualSha256 !== measured) failures.push(`${ref.path}: source hash mismatch`);
    } catch { failures.push(`${ref.path}: source unavailable`); }
  }
  return { ok: failures.length === 0, failures };
}
