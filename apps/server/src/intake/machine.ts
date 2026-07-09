import { createActor, createMachine } from "xstate";

export type IntakeStep =
  | "business"
  | "services"
  | "serviceArea"
  | "pricing"
  | "brandVoice"
  | "appStack"
  | "plan"
  | "approval"
  | "provisioned";

export const INTAKE_STEPS: IntakeStep[] = [
  "business",
  "services",
  "serviceArea",
  "pricing",
  "brandVoice",
  "appStack",
  "plan",
  "approval",
  "provisioned"
];

export const intakeMachine = createMachine({
  id: "tenantIntake",
  initial: "business",
  states: {
    business: { on: { ANSWER: "services" } },
    services: { on: { ANSWER: "serviceArea" } },
    serviceArea: { on: { ANSWER: "pricing" } },
    pricing: { on: { ANSWER: "brandVoice" } },
    brandVoice: { on: { ANSWER: "appStack" } },
    appStack: { on: { ANSWER: "plan" } },
    plan: { on: { FINALIZE: "approval" } },
    approval: { on: { EXECUTE: "provisioned" } },
    provisioned: { type: "final" }
  }
});

export function intakeStateAfter(events: string[]): string {
  const actor = createActor(intakeMachine);
  actor.start();
  for (const event of events) {
    actor.send({ type: event });
  }
  const value = actor.getSnapshot().value;
  actor.stop();
  return String(value);
}

export function nextIntakeStep(answers: Record<string, unknown>): IntakeStep {
  if (!answers.businessName) return "business";
  if (!answers.services) return "services";
  if (!answers.serviceArea) return "serviceArea";
  if (!answers.pricingNotes) return "pricing";
  if (!answers.brandVoice) return "brandVoice";
  if (!answers.appStack) return "appStack";
  return "plan";
}

export function questionForStep(step: IntakeStep): string {
  switch (step) {
    case "business":
      return "What is the business name and what kind of work does it do?";
    case "services":
      return "What services should Nexi know how to talk about for this business?";
    case "serviceArea":
      return "What cities or service areas should this tenant cover first?";
    case "pricing":
      return "What pricing rules or quoting notes should Nexi remember?";
    case "brandVoice":
      return "How should Nexi sound for this business?";
    case "appStack":
      return "Which current apps should Nexi replace now, replace later, or keep working beside?";
    case "plan":
      return "I have enough to draft the tenant plan. Say finalize intake when you want it parked for approval.";
    case "approval":
      return "The tenant plan is waiting in the approval queue.";
    case "provisioned":
      return "The approved tenant has been created in NexTeam.";
  }
}
