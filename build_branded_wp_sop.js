const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outPath = 'C:\\Users\\Peyto\\NexTeam-Studio\\docs\\internal\\clawdia\\sops\\nexteam-admin-client-wordpress-setup-verification-sop-branded.pdf';
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({ size: 'LETTER', margin: 54, bufferPages: true });
doc.pipe(fs.createWriteStream(outPath));

const colors = {
  bg: '#07111F',
  panel: '#0B172A',
  text: '#DCE7F5',
  muted: '#8EA3BF',
  accent: '#4F46E5',
  aqua: '#10B981',
  gold: '#F59E0B',
  line: '#20314D',
  white: '#F8FAFC',
};

function footer() {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const page = i + 1;
    doc.fontSize(9).fillColor(colors.muted)
      .text(`NexTeam Internal SOP · Aquatrace Reference Implementation #1 · Page ${page}`, 54, 756, { align: 'center', width: 504 });
  }
}

function sectionTitle(kicker, title, subtitle) {
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.accent).text(kicker.toUpperCase());
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(colors.white).text(title);
  if (subtitle) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).fillColor(colors.muted).text(subtitle, { lineGap: 3 });
  }
  doc.moveDown(0.8);
}

function bullet(text, color = colors.text) {
  doc.font('Helvetica').fontSize(11).fillColor(color).text(`• ${text}`, { indent: 10, lineGap: 3 });
}

function keyValue(label, value) {
  doc.font('Helvetica-Bold').fillColor(colors.white).text(label + ': ', { continued: true });
  doc.font('Helvetica').fillColor(colors.text).text(value);
}

function hr() {
  const y = doc.y + 2;
  doc.moveTo(54, y).lineTo(558, y).strokeColor(colors.line).lineWidth(1).stroke();
  doc.moveDown(0.8);
}

// Cover
const h = doc.page.height;
doc.rect(0,0,doc.page.width,h).fill(colors.bg);
doc.fillColor(colors.aqua).rect(54,58,130,24).fill();
doc.fillColor(colors.bg).font('Helvetica-Bold').fontSize(12).text('NEXTEAM', 87, 64);
doc.fillColor(colors.gold).roundedRect(406,58,152,24,12).fill();
doc.fillColor(colors.bg).font('Helvetica-Bold').fontSize(11).text('AQUATRACE · REF #1', 425, 64);
doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(28).text('Client WordPress Access', 54, 140);
doc.fontSize(28).text('Setup & Verification SOP', 54, 175);
doc.moveDown(0.8);
doc.font('Helvetica').fontSize(13).fillColor(colors.text).text('Polished review edition for NexTeam admin operations and Aquatrace co-branded reference use.', 54, 235, { width: 470, lineGap: 4 });
doc.roundedRect(54, 300, 504, 150, 18).fillAndStroke(colors.panel, colors.line);
doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(16).text('Purpose', 78, 326);
doc.font('Helvetica').fontSize(12).fillColor(colors.text)
  .text('This SOP locks the verified NexTeam workflow for setting up and validating client WordPress access for Brokk and Bragi, using Aquatrace as reference implementation #1.', 78, 356, { width: 458, lineGap: 4 });
doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.white).text('Locked posting rule:', 78, 408, { continued: true });
doc.font('Helvetica').fillColor(colors.text).text(' all Bragi-created posts must have comments disabled by default, with pingbacks and trackbacks disabled as well.');
doc.font('Helvetica').fontSize(11).fillColor(colors.muted).text('Internal admin review edition · approval before publish remains locked.', 54, 700, { align: 'center', width: 504 });

doc.addPage();
doc.rect(0,0,doc.page.width,doc.page.height).fill(colors.bg);
doc.x = 54; doc.y = 54;
sectionTitle('NexTeam standard', 'Standard workflow and setup checklist', 'This is the reusable workflow standard for future client WordPress onboarding.');
keyValue('Recommended access model', 'Dedicated client-specific WordPress user + Application Password for REST/API workflows. Start with Editor and only raise privileges temporarily if testing proves it is necessary.');
doc.moveDown(0.6);
keyValue('Security rule', 'Do not use the site owner’s personal login for automation. Do not paste normal passwords into chat. Keep privileges minimal and never publish without explicit client approval.');
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Standard setup checklist');
doc.moveDown(0.4);
[
  'Phase 1 — Intake: collect the admin URL, public site URL, Yoast status, REST/API restrictions, post type target, and editor environment.',
  'Phase 2 — Dedicated user: create a client-specific user, assign Editor first, and avoid using the site owner’s personal account.',
  'Phase 3 — Application Password: generate an Application Password for that user and store it only in the approved secure location.',
  'Phase 4 — Permission verification: verify draft creation, editing, media upload, featured image handling, scheduling, discussion controls, and Yoast field access.',
  'Phase 5 — API verification: confirm public /wp-json/ access, then verify authenticated REST access using the dedicated user and Application Password.',
  'Phase 6 — Agent readiness: confirm Bragi can target article draft flow and Brokk can use the same WordPress connection model later for site operations where applicable.'
].forEach(bullet);
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Reusable NexTeam checklist items');
doc.moveDown(0.4);
[
  'Admin URL, public site URL, dedicated username, dedicated email, post type target, editor environment, and Yoast status must be captured on every client.',
  'Permissions must be tested for drafts, edits, media upload, featured image, scheduling, discussion controls, and REST/API access.',
  'Host-specific request quirks must be recorded if REST auth needs browser-like headers or a custom request pattern.',
  'Brokk and Bragi should share the same clean WordPress connection model even if their workflows differ later.'
].forEach(bullet);

doc.addPage();
doc.rect(0,0,doc.page.width,doc.page.height).fill(colors.bg);
doc.x = 54; doc.y = 54;
sectionTitle('Aquatrace reference implementation', 'Verified setup summary', 'Aquatrace is the first fully verified client reference for this SOP.');
[
  ['Admin URL', 'https://aquatraceleak.com/wp-login'],
  ['Public site URL', 'https://aquatraceleak.com'],
  ['Dedicated user', 'aquatrace-bragi · Bragi NexTeam · Editor'],
  ['Yoast', 'Installed, active, visible, and editable'],
  ['Editor environment', 'Standard WordPress Posts in Gutenberg; site layout applies automatically'],
  ['Media + featured image', 'Verified working'],
  ['Scheduling', 'Verified working'],
  ['Discussion controls', 'Comments can be closed; pingbacks and trackbacks can be disabled and settings persist'],
  ['Application Password', 'Generated successfully and stored securely'],
  ['REST/API auth', 'Authenticated request returned the aquatrace-bragi user profile successfully']
].forEach(([a,b]) => { keyValue(a,b); doc.moveDown(0.25); });
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Verified permissions and results');
doc.moveDown(0.4);
[
  'Login to dashboard worked in direct and incognito sessions.',
  'Create new post draft succeeded.',
  'Draft save and reopen succeeded.',
  'Image upload and featured image assignment succeeded.',
  'Future-date scheduling succeeded.',
  'Yoast fields were editable.',
  'Comments, pingbacks, and trackbacks settings persisted correctly.',
  'Authenticated REST access succeeded with the dedicated user + Application Password.'
].forEach(bullet);

doc.addPage();
doc.rect(0,0,doc.page.width,doc.page.height).fill(colors.bg);
doc.x = 54; doc.y = 54;
sectionTitle('API and auth verification', 'Verified request notes and Bragi posting standard', 'Operational notes extracted from the verified Aquatrace setup.');
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('API/auth verification note');
doc.moveDown(0.4);
doc.font('Helvetica').fontSize(11).fillColor(colors.text).text('Early command-line tests returned 406 Not Acceptable even though the WordPress setup was valid. Public /wp-json/ access proved the REST API was available. Auth succeeded when the request used a more browser-like style with Accept: application/json and a normal User-Agent.', { lineGap: 4 });
doc.moveDown(0.5);
doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.white).text('Recommended authenticated test pattern');
doc.moveDown(0.3);
doc.font('Courier').fontSize(9.5).fillColor('#C7D2FE').text('curl -A "Mozilla/5.0" -H "Accept: application/json" -u "aquatrace-bragi:PASTE_APP_PASSWORD_HERE" https://aquatraceleak.com/wp-json/wp/v2/users/me', { lineGap: 2 });
doc.moveDown(0.6);
doc.font('Helvetica').fontSize(11).fillColor(colors.text).text('Expected result: JSON for the aquatrace-bragi user profile. Store the Application Password only in the approved secure location and revoke/regenerate it if exposure is ever suspected.', { lineGap: 4 });
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Bragi posting standards');
doc.moveDown(0.4);
[
  'Nothing publishes until the user approves.',
  'All posts created by any Bragi must have comments disabled by default.',
  'Pingbacks and trackbacks must be disabled by default.',
  'Draft-first behavior is the required default state for article production workflows.'
].forEach(bullet);
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Aquatrace-specific findings');
doc.moveDown(0.4);
[
  'Aquatrace uses standard WordPress Posts in Gutenberg.',
  'The site post layout applies automatically, reducing custom article assembly complexity.',
  'The dedicated aquatrace-bragi Editor account is sufficient for the verified draft/media/scheduling/Yoast workflow.',
  'REST authentication may require browser-like headers even when the core setup is correct.'
].forEach(bullet);

doc.addPage();
doc.rect(0,0,doc.page.width,doc.page.height).fill(colors.bg);
doc.x = 54; doc.y = 54;
sectionTitle('Reusable implementation assets', 'Checklist, client config, and agent preflight', 'These extracted items should be reused as the standard onboarding package for future Bragi/Brokk deployments.');
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Client config template items');
doc.moveDown(0.4);
[
  'Client name and reference label',
  'Public site URL and admin URL',
  'Dedicated automation username and email',
  'Application Password secure storage reference',
  'Post type target',
  'Editor environment',
  'SEO plugin status',
  'Permissions matrix',
  'Discussion default policy',
  'Host/API request quirks',
  'Scheduling policy and approval rule'
].forEach(bullet);
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('Agent preflight checklist items');
doc.moveDown(0.4);
[
  'Can the agent authenticate with the dedicated user and Application Password?',
  'Can it create, save, reopen, and update a draft?',
  'Can it upload media and set a featured image?',
  'Can it edit Yoast fields?',
  'Can it disable comments, pingbacks, and trackbacks by default?',
  'Can it schedule a post without publishing it?',
  'Does authenticated REST access return the expected user profile?',
  'Have client-specific request quirks been documented before automation starts?'
].forEach(bullet);
hr();
doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.white).text('What remains client-specific');
doc.moveDown(0.4);
[
  'Credentials, URLs, editor environment, theme/builder differences, post type target, and host security behavior stay client-specific.',
  'Bragi and Brokk should follow the same standard connection model, but each client still needs its own verified config and capability check.'
].forEach(bullet);

footer();
doc.end();
console.log(outPath);
