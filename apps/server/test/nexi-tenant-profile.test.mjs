import test from "node:test";
import assert from "node:assert/strict";
import { MemoryNexiRepository } from "../dist/nexi/nexiRepository.js";
import { answerNexiMessage } from "../dist/nexi/nexiService.js";

const approvedReply = "Owens Bluewater Wash provides professional residential and commercial exterior cleaning. We offer house washing, roof soft washing, driveway and concrete cleaning, gutter cleaning, window cleaning, and other pressure-washing services. Our focus is dependable service, clear communication, and clean results that make your property look its best.";

test("Nexi returns the tenant-approved what-we-do reply without invoking the gateway", async () => {
  const repository = new MemoryNexiRepository();
  let gatewayCalled = false;
  const result = await answerNexiMessage({
    tenant: {
      id: "owens-bluewater-wash",
      name: "Owens Bluewater Wash",
      industryPack: "pressure_washing",
      branding: { assistantName: "Nexi" },
      nexiBusinessProfile: {
        mission: "Owens Bluewater Wash delivers dependable residential and commercial exterior cleaning that protects property, improves curb appeal, and leaves every customer proud of the result.",
        coreValues: ["Quality work, done right", "Clear communication and honest service"],
        approvedWhatWeDoReply: approvedReply
      },
      adapters: { crm: "native", media: "native", email: "gmail_relay" },
      approval: {},
      timezone: "America/New_York",
      plan: "suite"
    },
    message: "What does Owens Bluewater Wash do?",
    repository,
    tools: [],
    gateway: async () => {
      gatewayCalled = true;
      throw new Error("The gateway must not run for an approved tenant overview.");
    }
  });
  assert.equal(result.answer, approvedReply);
  assert.equal(gatewayCalled, false);
  assert.equal(result.toolRuns.length, 0);
});
