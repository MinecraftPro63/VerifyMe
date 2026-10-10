// pages.js: HTML pages served by the verification server (black theme)

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const logo =
  '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" fill="#f7f8f8"/><path d="M6.2 10.2l2.6 2.6 5-5.2" stroke="#08090a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const keyIcon =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#8a8f98" stroke-width="1.5"><circle cx="8" cy="8" r="6.75"/><circle cx="8" cy="8" r="2"/></svg>';

const chevron =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

const css = `
:root{--bg:#08090a;--panel:#0e0f11;--line:rgba(255,255,255,.08);--text:#f7f8f8;--muted:#8a8f98;--accent:#5e6ad2;--pad:20px}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--bg) radial-gradient(ellipse 70% 40% at 50% 0,rgba(255,255,255,.07),transparent) no-repeat;color:var(--text);font:15px/1.6 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
nav{height:52px;display:flex;align-items:center;padding:0 24px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:600}
main{flex:1;display:grid;place-items:center;padding:48px 24px}
.card{width:100%;max-width:440px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 40px 100px -30px rgba(140,145,160,.28);overflow:hidden}
.bar{display:flex;justify-content:space-between;align-items:center;padding:12px var(--pad);border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:7px;color:var(--c)}
.chip i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.body{padding:32px var(--pad) var(--pad)}
h1{font-size:32px;line-height:1.1;letter-spacing:-.03em;font-weight:500}
.sub{margin-top:12px;color:var(--muted)}
.btn{display:block;margin-top:28px;padding:10px 16px;border-radius:8px;background:var(--text);color:#08090a;font-size:14px;font-weight:500;text-align:center;text-decoration:none;transition:background .15s}
.btn:hover{background:#d0d6e0}
.btn:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hint{margin-top:12px;font-size:13px;color:var(--muted);text-align:center}
details{border-top:1px solid var(--line)}
summary{display:flex;justify-content:space-between;align-items:center;padding:14px var(--pad);font-size:13px;color:var(--muted);cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary svg{transition:transform .2s}
details[open] summary svg{transform:rotate(180deg)}
.row{display:flex;gap:12px;padding:0 var(--pad) 16px;font-size:14px}
.row svg{flex:none;margin-top:3px}
.row b{display:block;font-weight:500}
.row span{color:var(--muted)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

// Browsers only let a script close tabs it opened itself, so closing is best effort.
// If the tab stays open, the hint under the button tells the person to close it.
const script = `
var b=document.getElementById('back'),h=document.getElementById('hint');
b.addEventListener('click',function(){
  setTimeout(function(){window.close()},400);
  setTimeout(function(){h.hidden=false},1000);
});`;

const page = ({ title, brand, headline, sub, chip, chipColor, button, details }) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<nav><span class="brand">${logo}${esc(brand)}</span></nav>
<main>
<section class="card">
<div class="bar"><span>${esc(title)}</span><span class="chip" style="--c:${chipColor}"><i></i>${esc(chip)}</span></div>
<div class="body">
<h1>${esc(headline)}</h1>
<p class="sub">${esc(sub)}</p>
<a class="btn" id="back" href="${esc(button.href)}"${button.close ? ' target="_blank" rel="noopener"' : ''}>${esc(button.label)}</a>
${button.close ? '<p class="hint" id="hint" hidden>You can close this tab now.</p>' : ''}
</div>
${
  details
    ? `<details><summary>${esc(details.name)}${chevron}</summary>${details.rows
        .map(([strong, text]) => `<div class="row">${keyIcon}<div><b>${esc(strong)}</b><span>${esc(text)}</span></div></div>`)
        .join('')}</details>`
    : ''
}
</section>
</main>
${button.close ? `<script>${script}</script>` : ''}
</body></html>`;

const DISCORD_APP = 'https://discord.com/app';

const success = ({ username, guildName, guildId }) =>
  page({
    title: 'Verification complete',
    brand: guildName,
    headline: "You're verified.",
    sub: `Signed in as ${username}. You now have access to all channels in ${guildName}.`,
    chip: 'Complete',
    chipColor: '#4cb782',
    button: { label: 'Back to Discord', href: `https://discord.com/channels/${encodeURIComponent(guildId)}`, close: true },
    details: {
      name: 'What you authorized',
      rows: [
        ['Identify', 'Read your Discord username and ID'],
        ['Join servers for you', 'Lets this app add you to servers it manages. Revoke it anytime in Discord under Settings, then Authorized Apps.'],
      ],
    },
  });

const failure = (message) =>
  page({
    title: 'Verification failed',
    brand: 'Verification',
    headline: "Couldn't verify you.",
    sub: `${message}. Press Verify Me in Discord to get a new link. Links expire after 10 minutes.`,
    chip: 'Failed',
    chipColor: '#eb5757',
    button: { label: 'Back to Discord', href: DISCORD_APP, close: true },
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
    sub: `Online, running for ${uptime()}.`,
    chip: 'Operational',
    chipColor: '#4cb782',
    button: { label: 'Open Discord', href: DISCORD_APP, close: false },
  });

module.exports = { success, failure, status };
