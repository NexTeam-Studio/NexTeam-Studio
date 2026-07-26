export function recordBrowserEvent(event: string, detail: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) {
    return;
  }
  console.info(`[browser] ${event}`, detail);
}
