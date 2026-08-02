import React from "react";

export type PaymentScheduleTrigger = "on_approval" | "on_job_close" | "on_date";
export type PaymentScheduleAmountKind = "amount" | "percent";

export interface PaymentScheduleMilestoneDraft {
  id: string;
  label: string;
  trigger: PaymentScheduleTrigger;
  amountKind: PaymentScheduleAmountKind;
  amount: number;
  dueAt: string;
}

export interface PaymentScheduleDraft {
  enabled: boolean;
  milestones: PaymentScheduleMilestoneDraft[];
}

export interface PaymentScheduleRecord {
  enabled: boolean;
  milestones: Array<{
    id: string;
    label: string;
    trigger: PaymentScheduleTrigger;
    amountKind: PaymentScheduleAmountKind;
    amount: number;
    dueAt?: string;
  }>;
}

function scheduleId(): string {
  return `milestone_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankMilestone(index = 0): PaymentScheduleMilestoneDraft {
  return {
    id: scheduleId(),
    label: index === 0 ? "Deposit" : `Milestone ${index + 1}`,
    trigger: index === 0 ? "on_approval" : "on_job_close",
    amountKind: "percent",
    amount: index === 0 ? 50 : 50,
    dueAt: ""
  };
}

export function blankPaymentSchedule(): PaymentScheduleDraft {
  return {
    enabled: false,
    milestones: [blankMilestone(0), blankMilestone(1)]
  };
}

export function paymentScheduleFromRecord(record?: PaymentScheduleRecord | undefined): PaymentScheduleDraft {
  if (!record) {
    return blankPaymentSchedule();
  }
  return {
    enabled: record.enabled,
    milestones: record.milestones.length
      ? record.milestones.map((milestone) => ({
          id: milestone.id,
          label: milestone.label,
          trigger: milestone.trigger,
          amountKind: milestone.amountKind,
          amount: milestone.amount,
          dueAt: milestone.dueAt ?? ""
        }))
      : [blankMilestone(0)]
  };
}

export function paymentScheduleToPayload(draft: PaymentScheduleDraft): PaymentScheduleRecord | undefined {
  if (!draft.enabled) {
    return undefined;
  }
  const milestones = draft.milestones
    .map((milestone) => ({
      ...milestone,
      label: milestone.label.trim(),
      dueAt: milestone.trigger === "on_date" ? milestone.dueAt : ""
    }))
    .filter((milestone) => milestone.label && milestone.amount > 0)
    .map((milestone) => ({
      id: milestone.id,
      label: milestone.label,
      trigger: milestone.trigger,
      amountKind: milestone.amountKind,
      amount: milestone.amount,
      ...(milestone.trigger === "on_date" && milestone.dueAt ? { dueAt: milestone.dueAt } : {})
    }));
  if (!milestones.length) {
    return {
      enabled: true,
      milestones: [{
        id: draft.milestones[0]?.id ?? scheduleId(),
        label: "Deposit",
        trigger: "on_approval",
        amountKind: "percent",
        amount: 100
      }]
    };
  }
  return { enabled: true, milestones };
}

interface PaymentScheduleEditorProps {
  value: PaymentScheduleDraft;
  onChange: (next: PaymentScheduleDraft) => void;
  title?: string;
  hint?: string;
}

export function PaymentScheduleEditor(props: PaymentScheduleEditorProps): React.ReactElement {
  function updateMilestone(id: string, patch: Partial<PaymentScheduleMilestoneDraft>): void {
    props.onChange({
      ...props.value,
      milestones: props.value.milestones.map((milestone) => milestone.id === id ? { ...milestone, ...patch } : milestone)
    });
  }

  function removeMilestone(id: string): void {
    props.onChange({
      ...props.value,
      milestones: props.value.milestones.filter((milestone) => milestone.id !== id)
    });
  }

  function addMilestone(): void {
    props.onChange({
      ...props.value,
      milestones: [...props.value.milestones, blankMilestone(props.value.milestones.length)]
    });
  }

  return (
    <section className="nexops-payment-schedule">
      <div className="nexops-jobs-card-heading">
        <div>
          <h3>{props.title ?? "Payment Schedule"}</h3>
          <p className="nexops-empty-copy">{props.hint ?? "Split billing into deposit and milestone payments when this work needs more than one invoice touchpoint."}</p>
        </div>
        <label className="nexops-payment-schedule-toggle">
          <input
            type="checkbox"
            checked={props.value.enabled}
            onChange={(event) => props.onChange({ ...props.value, enabled: event.target.checked })}
          />
          Enable
        </label>
      </div>
      {props.value.enabled ? (
        <div className="nexops-payment-schedule-list">
          {props.value.milestones.map((milestone) => (
            <div className="nexops-payment-schedule-row" key={milestone.id}>
              <label>
                <span>Label</span>
                <input value={milestone.label} onChange={(event) => updateMilestone(milestone.id, { label: event.target.value })} />
              </label>
              <label>
                <span>Trigger</span>
                <select value={milestone.trigger} onChange={(event) => updateMilestone(milestone.id, { trigger: event.target.value as PaymentScheduleTrigger })}>
                  <option value="on_approval">On Approval</option>
                  <option value="on_job_close">On Job Close</option>
                  <option value="on_date">On a Date</option>
                </select>
              </label>
              <label>
                <span>Amount Type</span>
                <select value={milestone.amountKind} onChange={(event) => updateMilestone(milestone.id, { amountKind: event.target.value as PaymentScheduleAmountKind })}>
                  <option value="percent">Percent</option>
                  <option value="amount">Dollar Amount</option>
                </select>
              </label>
              <label>
                <span>{milestone.amountKind === "percent" ? "Percent" : "Amount"}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={milestone.amount}
                  onChange={(event) => updateMilestone(milestone.id, { amount: Math.max(0, Number(event.target.value || 0)) })}
                />
              </label>
              {milestone.trigger === "on_date" ? (
                <label>
                  <span>Due Date</span>
                  <input type="date" value={milestone.dueAt} onChange={(event) => updateMilestone(milestone.id, { dueAt: event.target.value })} />
                </label>
              ) : <div className="nexops-payment-schedule-spacer" />}
              <button type="button" onClick={() => removeMilestone(milestone.id)} disabled={props.value.milestones.length === 1}>Remove</button>
            </div>
          ))}
          <button type="button" className="nexops-payment-schedule-add" onClick={addMilestone}>Add Milestone</button>
        </div>
      ) : null}
    </section>
  );
}
