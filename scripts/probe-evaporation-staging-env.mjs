const presence = {
  OPENWEATHER_API_KEY: Boolean(process.env.OPENWEATHER_API_KEY?.trim()),
  OPENWEATHERMAP_API_KEY: Boolean(process.env.OPENWEATHERMAP_API_KEY?.trim()),
  TENANT_ID: process.env.TENANT_ID || null
};

console.log(JSON.stringify(presence, null, 2));
