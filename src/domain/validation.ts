import type { FindingCandidate, SnapshotIdentity } from "./contracts.ts";
export function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function requireText(value: unknown, label: string): asserts value is string {
  requireCondition(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty`);
}
export function assertSnapshot(value: unknown): asserts value is SnapshotIdentity {
  requireCondition(isRecord(value), "snapshot must be an object");
  for (const key of ["id", "repositoryId", "baseCommit", "headCommit", "inputFingerprint", "configurationFingerprint"]) {
    requireText(value[key], `snapshot.${key}`);
  }
  requireCondition(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(String(value.baseCommit)), "base must be a resolved commit id");
  requireCondition(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(String(value.headCommit)), "head must be a resolved commit id");
}
export function assertCandidate(value: unknown, snapshotId: string): asserts value is FindingCandidate {
  requireCondition(isRecord(value), "candidate must be an object");
  for (const key of ["id", "title", "claim", "trigger", "impact"]) requireText(value[key], key);
  requireCondition(["critical", "high", "medium", "low"].includes(String(value.severity)), "invalid severity");
  requireCondition(Array.isArray(value.evidence) && value.evidence.length > 0, "candidate needs evidence references");
  for (const evidence of value.evidence) {
    requireCondition(isRecord(evidence), "invalid evidence");
    requireCondition(evidence.snapshotId === snapshotId, "evidence snapshot mismatch");
    requireCondition(evidence.revision === "base" || evidence.revision === "head", "evidence revision required");
    requireText(evidence.path, "evidence.path");
    const path = evidence.path;
    requireCondition(!path.startsWith("/") && !path.includes("\\") && !path.includes(":") &&
      !path.split("/").some((part) => part === ".." || part === "." || part === ""), "unsafe relative evidence path");
    requireCondition(Number.isInteger(evidence.startLine) && Number(evidence.startLine) >= 1, "invalid start line");
    requireCondition(Number.isInteger(evidence.endLine) && Number(evidence.endLine) >= Number(evidence.startLine), "invalid end line");
    requireCondition(typeof evidence.contentSha256 === "string" && /^[a-f0-9]{64}$/i.test(evidence.contentSha256), "invalid content hash");
  }
}
