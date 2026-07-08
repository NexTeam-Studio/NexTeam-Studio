import { DryRunApprovalExecutor, type ApprovalExecutor, type ApprovalItem } from "@nexteam/core";

export interface ApprovalExecutorRoute {
  canExecute(item: ApprovalItem): boolean;
  executor: ApprovalExecutor;
}

export class CompositeApprovalExecutor implements ApprovalExecutor {
  constructor(
    private readonly routes: ApprovalExecutorRoute[],
    private readonly fallback: ApprovalExecutor = new DryRunApprovalExecutor()
  ) {}

  execute(item: ApprovalItem): Promise<unknown> {
    const route = this.routes.find((candidate) => candidate.canExecute(item));
    return (route?.executor ?? this.fallback).execute(item);
  }
}
