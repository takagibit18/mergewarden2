import type { ReviewEvent } from "../domain/contracts.ts";
/** SessionJournal is a business-event projection over Pi, not a second harness.
 * Production append must be durable and fail closed; MemoryJournal is test-only.
 * No implementation claims exactly-once. See ADR-0012. */
export interface SessionJournal {
  append(event: ReviewEvent): Promise<void>;
  readActiveBranch(): Promise<ReviewEvent[]>;
}
