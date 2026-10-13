// Placeholder for modules scheduled in later phases. Still protected by authentication.
import { mountShell, NAV } from './shell.js';

const page = document.body.dataset.page;
const item = NAV.find((n) => n.id === page);
const ctx = await mountShell({ page, title: item?.label || 'OPK HARDWARES' });
if (ctx) {
  ctx.content.innerHTML = `<div class="panel" style="margin-top:0"><div class="empty"><strong>${item?.label}</strong> is scheduled for Phase ${item?.phase}. This page is not built yet.</div></div>`;
}
