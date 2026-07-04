const response = await fetch("http://127.0.0.1:3001/api/bragi/telegram/notify-draft", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    postId: 3307,
    title: "Bragi Proof of Life - Why a Pool Leak That Seems to Stop Is Still a Problem",
    draftUrl: "https://aquatraceleak.com/?p=3307",
    status: "draft",
    focusKeyphrase: "pool leak that seems to stop",
    summary: "Proof-of-life draft ready for Telegram approval workflow testing.",
  }),
});

console.log(await response.text());
