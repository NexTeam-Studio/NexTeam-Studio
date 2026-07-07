# Evaporation Tool

This package wraps the Aquatrace v20 pool evaporation calculator as a tenant-scoped Nexi rail.

It takes an address or ZIP, pool surface area, water temperature, and optional observed water loss. The server pulls OpenWeather current conditions and the next eight 3-hour forecast slots, runs the same evaporation formula used by the existing Aquatrace calculator, and generates a branded PDF report.

Start here when something breaks:

- `calculator.ts` owns the v20 math, gallons-per-inch conversion, leak-loss thresholds, and forecast aggregation.
- `weather.ts` owns OpenWeather geocoding/current-weather/forecast calls. It reads `OPENWEATHER_API_KEY` or `OPENWEATHERMAP_API_KEY` from the runtime only.
- `routes.ts` exposes `/api/evaporation/run` and the PDF download endpoint.
- `nexiTools.ts` exposes the `runEvaporation` tool to Nexi.

The tool does not send email, publish anywhere, or write to CompanyCam. It returns report metadata, a PDF URL, and attachment metadata so approval-gated comms can attach the PDF later.
