import type { CalendarResponse } from "../../../shared/contracts/scheduling";

export async function fetchCalendar(input: {
  tenantId: string;
  from: string;
  to: string;
}): Promise<CalendarResponse> {
  return fetch(
    `/api/scheduling/calendar?tenantId=${encodeURIComponent(input.tenantId)}&from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}`
  ).then((response) => response.json() as Promise<CalendarResponse>);
}
