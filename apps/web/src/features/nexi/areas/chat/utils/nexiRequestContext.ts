const PERSONAL_DIRECTION_PATTERN = /\b(?:how\s+far|distance|miles?|drive\s+time|travel\s+time|directions?)\b/i;
const PERSONAL_ORIGIN_PATTERN = /\b(?:from\s+here|from\s+my\s+(?:house|home)|from\s+me)\b/i;

export function shouldUseRequestorOriginForNexiMessage(text: string): boolean {
  return PERSONAL_DIRECTION_PATTERN.test(text) && PERSONAL_ORIGIN_PATTERN.test(text);
}

export function requestorOriginFromCoordinates(coords: { latitude: number; longitude: number }): string {
  return `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`;
}

export async function resolveRequestorOriginForNexiMessage(
  text: string,
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
  timeoutMs = 2500
): Promise<string | undefined> {
  if (!shouldUseRequestorOriginForNexiMessage(text) || !geolocation) {
    return undefined;
  }
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        finish(requestorOriginFromCoordinates(position.coords));
      },
      () => {
        clearTimeout(timer);
        finish(undefined);
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 60_000
      }
    );
  });
}
