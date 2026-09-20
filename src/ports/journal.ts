import type { ReviewEvent } from "../domain/contracts.ts";
/** SessionJournal is a business-event projection over Pi, not a second harness.
 * append() acceptance is NOT an fsync/exactly-once guarantee. See ADR-004. */
export interface SessionJournal {
  append(event: ReviewEvent): Promise<void>;
  readActiveBranch(): Promise<ReviewEvent[]>;
}
