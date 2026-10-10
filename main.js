// pages.js: HTML pages served by the verification server (black theme)

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (stroke, shape) =>
  `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.75"/>${shape}</svg>`;

const icon = {
  ok: svg('#4cb782', '<path d="M5.2 8.2l1.9 1.9 3.7-3.9"/>'),
  bad: svg('#eb5757', '<path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>'),
  key: svg('#8a8f98', '<circle cx="8" cy="8" r="2"/>'),
};

const logo =
  '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" fill="#f7f8f8"/><path d="M6.2 10.2l2.6 2.6 5-5.2" stroke="#08090a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const css = `
:root{--bg:#08090a;--panel:#0e0f11;--line:rgba(255,255,255,.08);--text:#f7f8f8;--muted:#8a8f98;--accent:#5e6ad2}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--bg) radial-gradient(ellipse 70% 40% at 50% 0,rgba(255,255,255,.07),transparent) no-repeat;color:var(--text);font:15px/1.6 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{width:100%;max-width:960px;margin:0 auto;padding:0 24px}
nav{border-bottom:1px solid var(--line)}
nav .wrap{display:flex;align-items:center;justify-content:space-between;height:52px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600}
.btn{background:var(--text);color:#08090a;font-size:13px;font-weight:500;padding:6px 12px;border-radius:6px;text-decoration:none;transition:background .15s}
.btn:hover{background:#d0d6e0}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
main{flex:1;padding:88px 24px 72px}
h1{font-size:clamp(36px,6vw,60px);line-height:1.05;letter-spacing:-.035em;font-weight:500;max-width:12em}
.sub{margin-top:20px;max-width:34em;font-size:16px;color:var(--muted)}
.win{margin-top:56px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 40px 100px -30px rgba(140,145,160,.28);overflow:hidden}
.bar{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:7px;color:var(--c)}
.chip i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.grp{padding:16px 20px 6px;font-size:13px;color:var(--muted)}
.row{display:flex;gap:12px;padding:10px 20px 14px;font-size:14px}
.row svg{flex:none;margin-top:3px}
.row b{display:block;font-weight:500}
.row span{color:var(--muted)}
.grp+.row{border-top:0}
.row+.grp{border-top:1px solid var(--line);margin-top:6px}
`;

const page = ({ title, brand, headline, sub, chip, chipColor, groups }) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<nav><div class="wrap"><span class="brand">${logo}${esc(brand)}</span><a class="btn" href="https://discord.com/app">Open Discord</a></div></nav>
<main class="wrap">
<h1>${esc(headline)}</h1>
<p class="sub">${esc(sub)}</p>
<section class="win">
<div class="bar"><span>${esc(title)}</span><span class="chip" style="--c:${chipColor}"><i></i>${esc(chip)}</span></div>
${groups
  .map(
    (g) =>
      `<div class="grp">${esc(g.name)}</div>` +
      g.rows.map(([ic, strong, text]) => `<div class="row">${icon[ic]}<div><b>${esc(strong)}</b><span>${esc(text)}</span></div></div>`).join('')
  )
  .join('')}
</section>
</main>
</body></html>`;

const success = ({ username, guildName, roleName }) =>
  page({
    title: 'Verification complete',
    brand: guildName,
    headline: "You're verified.",
    sub: `Your account is verified in ${guildName}. You can close this tab and return to Discord.`,
    chip: 'Complete',
    chipColor: '#4cb782',
    groups: [
      {
        name: 'Activity',
        rows: [
          ['ok', 'Account identified', `Signed in as ${username}`],
          ['ok', `${roleName} role granted`, 'Applied to your account in this server'],
          ['ok', 'Channels unlocked', `You now have access to all channels in ${guildName}`],
        ],
      },
      {
        name: 'Permissions you granted',
        rows: [
          ['key', 'Identify', 'Read your Discord username and ID'],
          ['key', 'Join servers for you', 'Lets this app add you to servers it manages. Revoke it anytime in Discord under Settings, then Authorized Apps.'],
        ],
      },
    ],
  });

const failure = (message) =>
  page({
    title: 'Verification failed',
    brand: 'Verification',
    headline: "Couldn't verify you.",
    sub: `${message}.`,
    chip: 'Failed',
    chipColor: '#eb5757',
    groups: [
      {
        name: 'What to do',
        rows: [['bad', 'Start again from Discord', 'Press Verify Me in the verification channel to get a new link. Links expire after 10 minutes.']],
      },
    ],
  });

const uptime = () => {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const status = () =>
  page({
    title: 'Server status',
    brand: 'Verification',
    headline: 'Verification server',
    sub: 'Handles Discord sign-in for server verification.',
    chip: 'Operational',
    chipColor: '#4cb782',
    groups: [{ name: 'Status', rows: [['ok', 'Web server', `Online, running for ${uptime()}`]] }],
  });

module.exports = { success, failure, status };
