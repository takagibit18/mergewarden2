import { ReviewController } from "../application/review-controller.ts";
import { MemoryJournal } from "../adapters/memory-journal.ts";
const command = process.argv[2] ?? "status";
if (command === "status") {
  console.log(JSON.stringify({ scaffold: true, milestone: "M0 development baseline", core: "offline-tested", runtime: "Pi native-session smoke covered; strong durability not implemented",
    graph: "pinned Python grammar tested; index/resolver not implemented", advisor: "off; no Jev request is made",
    ide: "boundary and manifest only; no extension UI", review: "not implemented" }, null, 2));
} else if (command === "demo") {
  const snapshot = { id: "SYNTHETIC-DEMO", repositoryId: "fixture-only", baseCommit: "a".repeat(40), headCommit: "b".repeat(40),
    inputFingerprint: "synthetic-input", configurationFingerprint: "demo-final-only" };
  const journal = new MemoryJournal();
  const controller = new ReviewController(journal, "synthetic-run", snapshot);
  await controller.start("final_only", ["synthetic-unit"]);
  await controller.dispatch({ type: "candidates.submitted", channel: "final_only", candidates: [] });
  await controller.dispatch({ type: "unit.finished", unitId: "synthetic-unit", outcome: "done" });
  await controller.dispatch({ type: "run.finished", outcome: "completed", summary: "Synthetic control-flow demo. No repository or model was reviewed." });
  console.log(JSON.stringify({ demo: true, warning: "NOT a code review result", report: controller.report(), events: await journal.readActiveBranch() }, null, 2));
} else {
  console.error(`Command '${command}' is not implemented. Available: status, demo. No real review was performed.`);
  process.exitCode = 2;
}
