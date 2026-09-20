import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ReviewEvent } from "../../../src/domain/contracts.ts";
import type { SessionJournal } from "../../../src/ports/journal.ts";
const NAMESPACE = "mergewarden.review-event.v1";
/** Adapter over native Pi CustomEntry. Does not write a parallel message log.
 * Pi 0.84.1 defers a new session's file until its first assistant message.
 * Append is not an fsync acknowledgement; this is not crash-safe exactly-once. */
export class PiSessionJournal implements SessionJournal {
  private manager: SessionManager;
  constructor(manager: SessionManager) { this.manager = manager; }
  async append(event: ReviewEvent): Promise<void> { this.manager.appendCustomEntry(NAMESPACE, structuredClone(event)); }
  async readActiveBranch(): Promise<ReviewEvent[]> {
    return this.manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === NAMESPACE)
      .map((entry) => {
        if (entry.type !== "custom") throw new Error("unexpected native entry");
        return structuredClone(entry.data) as ReviewEvent; // Domain reducer validates the replay.
      });
  }
}
