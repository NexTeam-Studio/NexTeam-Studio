const res = await fetch('http://127.0.0.1:4173/api/vgb/send-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contactId: 'vgb-contact-1',
    toAddress: 'chris@aquatraceleak.com',
    subject: 'Pool Safety Documentation — Federal Compliance Notice for Aquatrace Test Contact',
    body: 'Hi Chris,\n\nThis is a controlled VGB outreach send test from NexTeam.\n\nChris\nOwner & Founder, Aquatrace Swimming Pool Leak Detection',
    propertyName: 'Aquatrace Test Contact'
  })
});
console.log(await res.text());
