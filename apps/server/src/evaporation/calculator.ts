import { z } from "zod";

export const evaporationLossInputSchema = z.object({
  wholeInches: z.number().min(0).optional(),
  fractionInches: z.number().min(0).max(1).optional(),
  inches: z.number().min(0).optional(),
  observationDays: z.number().positive().default(1)
}).optional();

export const evaporationRunInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  clientName: z.string().min(1).optional(),
  address: z.string().min(1),
  zip: z.string().regex(/^\d{5}$/).optional(),
  surfaceAreaFt2: z.number().positive(),
  waterTempF: z.number().min(32).max(120),
  observedLoss: evaporationLossInputSchema,
  windMphOverride: z.number().min(0).max(150).optional()
});

export interface WeatherSnapshot {
  city: string;
  airTempF: number;
  relativeHumidityPct: number;
  windMph: number;
  fetchedAt: string;
  zip?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
}

export interface ForecastSlot {
  at: string;
  airTempF: number;
  relativeHumidityPct: number;
  windMph: number;
}

export interface EvaporationForecastResult extends ForecastSlot {
  evapInchesForThreeHours: number;
  evapGallonsForThreeHours: number;
}

export interface EvaporationCalculationResult {
  gallonsPerInch: number;
  observedLossInchesPerDay: number | null;
  evapInchesPerDay: number;
  evapGallonsPerDay: number;
  leakInchesPerDay: number | null;
  leakGallonsPerDay: number | null;
  totalLossInchesPerDay: number | null;
  totalLossGallonsPerDay: number | null;
  severity: "not_enough_loss_data" | "no_leak_detected" | "very_minor" | "moderate" | "significant";
  note: string;
  projected24HourEvapInches: number | null;
  projected24HourEvapGallons: number | null;
  forecast: EvaporationForecastResult[];
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function gallonsPerInch(surfaceAreaFt2: number): number {
  return surfaceAreaFt2 * (1 / 12) * 7.48052;
}

export function lossInchesPerDay(input: z.infer<typeof evaporationLossInputSchema>): number | null {
  if (!input) {
    return null;
  }
  const observedInches = input.inches ?? ((input.wholeInches ?? 0) + (input.fractionInches ?? 0));
  return round(observedInches / input.observationDays, 4);
}

export function calcEvapInchesPerDay(
  surfaceAreaFt2: number,
  waterTempF: number,
  airTempF: number,
  relativeHumidityPct: number,
  windMph: number
): number {
  const saturationPressureKpa = (tempC: number) => 0.61078 * Math.exp((17.2694 * tempC) / (tempC + 237.29));
  const waterTempC = (waterTempF - 32) * 5 / 9;
  const airTempC = (airTempF - 32) * 5 / 9;
  const waterPressurePsi = saturationPressureKpa(waterTempC) * 0.2953;
  const airPressurePsi = (relativeHumidityPct / 100) * saturationPressureKpa(airTempC) * 0.2953;
  const pressureDelta = Math.max(waterPressurePsi - airPressurePsi, 0);
  const poundsPerHour = surfaceAreaFt2 * pressureDelta * (0.089 + 0.0782 * windMph);
  return (poundsPerHour / 8.34) / (surfaceAreaFt2 * (1 / 12) * 7.48052) * 24;
}

function classifyLeak(leakInchesPerDay: number | null): Pick<EvaporationCalculationResult, "severity" | "note"> {
  if (leakInchesPerDay === null) {
    return {
      severity: "not_enough_loss_data",
      note: "Observed water loss was not provided, so this report only estimates normal evaporation."
    };
  }
  if (leakInchesPerDay <= 0) {
    return {
      severity: "no_leak_detected",
      note: "The observed water loss is within the expected evaporation range. Keep an eye on it if something still feels off."
    };
  }
  if (leakInchesPerDay < 0.125) {
    return {
      severity: "very_minor",
      note: "A very small amount of loss is above expected evaporation. Monitor closely."
    };
  }
  if (leakInchesPerDay < 0.5) {
    return {
      severity: "moderate",
      note: "Moderate unexplained water loss is above expected evaporation. A professional inspection is recommended."
    };
  }
  return {
    severity: "significant",
    note: "Significant unexplained water loss is above expected evaporation. This strongly suggests an active leak."
  };
}

export function calculateEvaporation(input: {
  surfaceAreaFt2: number;
  waterTempF: number;
  currentWeather: WeatherSnapshot;
  forecast?: ForecastSlot[] | undefined;
  observedLoss?: z.infer<typeof evaporationLossInputSchema>;
  windMphOverride?: number | undefined;
}): EvaporationCalculationResult {
  const windMph = input.windMphOverride ?? input.currentWeather.windMph;
  const evapInchesPerDay = calcEvapInchesPerDay(
    input.surfaceAreaFt2,
    input.waterTempF,
    input.currentWeather.airTempF,
    input.currentWeather.relativeHumidityPct,
    windMph
  );
  const gpi = gallonsPerInch(input.surfaceAreaFt2);
  const observed = lossInchesPerDay(input.observedLoss);
  const leakInches = observed === null ? null : Math.max(observed - evapInchesPerDay, 0);
  const severity = classifyLeak(leakInches);
  const forecast = (input.forecast ?? []).slice(0, 8).map((slot) => {
    const slotWind = input.windMphOverride ?? slot.windMph;
    const perDay = calcEvapInchesPerDay(input.surfaceAreaFt2, input.waterTempF, slot.airTempF, slot.relativeHumidityPct, slotWind);
    const threeHourInches = perDay / 8;
    return {
      ...slot,
      windMph: slotWind,
      evapInchesForThreeHours: round(threeHourInches, 4),
      evapGallonsForThreeHours: round(threeHourInches * gpi, 1)
    };
  });
  const projected24HourEvapInches = forecast.length
    ? forecast.reduce((total, slot) => total + slot.evapInchesForThreeHours, 0) / forecast.length * 8
    : null;
  return {
    gallonsPerInch: round(gpi, 4),
    observedLossInchesPerDay: observed,
    evapInchesPerDay: round(evapInchesPerDay, 4),
    evapGallonsPerDay: round(evapInchesPerDay * gpi, 1),
    leakInchesPerDay: leakInches === null ? null : round(leakInches, 4),
    leakGallonsPerDay: leakInches === null ? null : round(leakInches * gpi, 1),
    totalLossInchesPerDay: observed === null ? null : round(evapInchesPerDay + Math.max(observed - evapInchesPerDay, 0), 4),
    totalLossGallonsPerDay: observed === null ? null : round((evapInchesPerDay + Math.max(observed - evapInchesPerDay, 0)) * gpi, 1),
    ...severity,
    projected24HourEvapInches: projected24HourEvapInches === null ? null : round(projected24HourEvapInches, 4),
    projected24HourEvapGallons: projected24HourEvapInches === null ? null : round(projected24HourEvapInches * gpi, 1),
    forecast
  };
}

export function toImperialInches(inches: number | null): string {
  if (inches === null) {
    return "not provided";
  }
  const whole = Math.floor(inches);
  const frac = inches - whole;
  const fractions: Array<[number, string]> = [
    [7 / 8, "7/8"],
    [3 / 4, "3/4"],
    [5 / 8, "5/8"],
    [1 / 2, "1/2"],
    [3 / 8, "3/8"],
    [1 / 4, "1/4"],
    [1 / 8, "1/8"],
    [0, ""]
  ];
  const match = fractions.find(([value]) => frac >= value - 0.0625);
  return `${whole}${match?.[1] ? ` ${match[1]}` : ""}"`;
}
