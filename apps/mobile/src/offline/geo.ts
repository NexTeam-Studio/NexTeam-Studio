import type { GeoPoint, NearestClientMatch } from "./schemas.js";

export type ClientLocationCandidate = {
  tenantId: string;
  clientId: string;
  clientName: string;
  propertyId?: string;
  propertyName?: string;
  geo: GeoPoint;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(from: GeoPoint, to: GeoPoint) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function findNearestClientMatch(
  tenantId: string,
  point: GeoPoint,
  candidates: ClientLocationCandidate[],
  maxDistanceMeters = 300
): NearestClientMatch | null {
  const nearest = candidates
    .filter((candidate) => candidate.tenantId === tenantId)
    .map((candidate) => ({
      candidate,
      distance: distanceMeters(point, candidate.geo)
    }))
    .filter((entry) => entry.distance <= maxDistanceMeters)
    .sort((left, right) => left.distance - right.distance)[0];

  if (!nearest) return null;

  return {
    clientId: nearest.candidate.clientId,
    clientName: nearest.candidate.clientName,
    ...(nearest.candidate.propertyId ? { propertyId: nearest.candidate.propertyId } : {}),
    ...(nearest.candidate.propertyName ? { propertyName: nearest.candidate.propertyName } : {}),
    distanceMeters: Math.round(nearest.distance),
    matchedBy: "gps_nearest_client"
  };
}
