const text = process.argv.slice(2).join(" ") || "REVISE tighten the opening paragraph";

const response = await fetch("http://127.0.0.1:3001/api/bragi/telegram/test-command", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ text }),
});

console.log(await response.text());
