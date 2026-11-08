import { ro } from "@/i18n/ro";
import { TIME_ZONE } from "@/lib/time/bucharest";

export const DEFAULT_LOCATION = {
  name: "Constanța",
  latitude: 44.1598,
  longitude: 28.6348,
};

const LABELS: Record<number, string> = {
  0: ro.weatherClear,
  1: ro.weatherMainlyClear,
  2: ro.weatherPartly,
  3: ro.weatherOvercast,
  45: ro.weatherFog,
  48: ro.weatherFog,
  51: ro.weatherDrizzle,
  53: ro.weatherDrizzle,
  55: ro.weatherDrizzle,
  56: ro.weatherFreezingDrizzle,
  57: ro.weatherFreezingDrizzle,
  61: ro.weatherRainLight,
  63: ro.weatherRain,
  65: ro.weatherRainHeavy,
  66: ro.weatherFreezingRain,
  67: ro.weatherFreezingRain,
  71: ro.weatherSnowLight,
  73: ro.weatherSnow,
  75: ro.weatherSnowHeavy,
  77: ro.weatherSnow,
  80: ro.weatherShowers,
  81: ro.weatherShowers,
  82: ro.weatherShowersHeavy,
  85: ro.weatherSnowShowers,
  86: ro.weatherSnowShowers,
  95: ro.weatherThunder,
  96: ro.weatherThunderHail,
  99: ro.weatherThunderHail,
};

export type ForecastHour = { time: string; code: number; precipitationMm: number };

export function openMeteoUrl(latitude: number, longitude: number): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", coordinate(latitude));
  url.searchParams.set("longitude", coordinate(longitude));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("hourly", "weather_code,precipitation");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", TIME_ZONE);
  return url.toString();
}

export function isRain(code: number, precipitationMm = 0): boolean {
  if (precipitationMm >= 0.2) return true;
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

export function parseForecast(body: unknown): ForecastHour[] {
  if (!body || typeof body !== "object") return [];
  const hourly = (body as { hourly?: unknown }).hourly;
  if (!hourly || typeof hourly !== "object") return [];
  const fields = hourly as { time?: unknown; weather_code?: unknown; precipitation?: unknown };
  if (!Array.isArray(fields.time) || !Array.isArray(fields.weather_code)) return [];
  const hours: ForecastHour[] = [];
  const count = Math.min(fields.time.length, fields.weather_code.length, 48);
  for (let index = 0; index < count; index += 1) {
    const time = fields.time[index];
    const code = fields.weather_code[index];
    const rain = Array.isArray(fields.precipitation) ? fields.precipitation[index] : 0;
    if (typeof time !== "string" || typeof code !== "number" || !Number.isFinite(code)) continue;
    const precipitationMm = typeof rain === "number" && Number.isFinite(rain) ? rain : 0;
    hours.push({ time, code, precipitationMm });
  }
  return hours;
}

export function weatherLabel(code: number): string {
  return LABELS[code] ?? ro.weatherUnknown;
}

export function parseOpenMeteo(body: unknown): { tempC: number; code: number; label: string } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { current?: unknown; current_weather?: unknown };
  const current = record.current ?? record.current_weather;
  if (!current || typeof current !== "object") return null;
  const fields = current as {
    temperature_2m?: unknown;
    temperature?: unknown;
    weather_code?: unknown;
    weathercode?: unknown;
  };
  const temp = fields.temperature_2m ?? fields.temperature;
  const code = fields.weather_code ?? fields.weathercode;
  if (typeof temp !== "number" || !Number.isFinite(temp)) return null;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  const rounded = Math.round(temp);
  return { tempC: rounded, code, label: weatherLabel(code) };
}

function coordinate(value: number): string {
  return (Math.round(value * 10000) / 10000).toString();
}
