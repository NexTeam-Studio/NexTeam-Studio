import { request } from "node:https";

function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(text) });
        } catch {
          resolve({ status: res.statusCode || 0, body: { raw: text } });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const response = await getJson("https://api.elevenlabs.io/v1/voices", {
  "xi-api-key": process.env.ELEVENLABS_API_KEY || ""
});

if (response.status < 200 || response.status >= 300) {
  console.log(JSON.stringify({ ok: false, status: response.status, error: response.body?.detail?.message || response.body?.message || "voice list failed" }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  voices: (response.body.voices || []).map((voice) => ({
    name: voice.name,
    voice_id: voice.voice_id,
    category: voice.category
  }))
}, null, 2));
