import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { DispatchBridge, DispatchTrigger } from "../../../src/engine/dispatch-contracts.ts";
import { DISPATCH_MESSAGE, packageText } from "../../../src/engine/dispatch-service.ts";

/** Transport only. All anchor, retrieval, evidence and budget work belongs to the host. */
export function dispatchAdapter(pi: ExtensionAPI, bridge: DispatchBridge) {
  pi.on("before_provider_request", event => { bridge.providerPayload(event.payload); });
  return async (trigger: DispatchTrigger) => {
    const pack = await bridge.dispatch(trigger);
    if (!pack || pack.terminal === "cancelled") return;
    bridge.queued(pack);
    pi.sendMessage({ customType: DISPATCH_MESSAGE, content: packageText(pack), display: true }, { deliverAs: "steer" });
  };
}
