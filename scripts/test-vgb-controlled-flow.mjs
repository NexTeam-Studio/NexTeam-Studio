const contacts = [
  {
    id: "vgb-test-1",
    email: "aquatraceleak@gmail.com",
    propertyName: "Aquatrace Test Property 1",
  },
  {
    id: "vgb-test-2",
    email: "chris@candelafcs.com",
    propertyName: "Aquatrace Test Property 2",
  },
  {
    id: "vgb-test-3",
    email: "service@aquatraceleak.com",
    propertyName: "Aquatrace Test Property 3",
  },
  {
    id: "vgb-test-4",
    email: "noreply@example.com",
    propertyName: "Overflow Contact",
  },
];

const response = await fetch("http://127.0.0.1:3001/api/vgb/campaign/dry-run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subject: "Controlled VGB Test",
    bodyPreview: "Dry-run verification for the protected VGB campaign flow.",
    contacts,
  }),
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
