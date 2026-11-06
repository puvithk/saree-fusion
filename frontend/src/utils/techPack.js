// Builds a print-ready tech-pack and opens the browser's "Save as PDF" dialog.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

function swatchCell(label, sw) {
  const visual = sw?.image
    ? `<img src="${esc(sw.image)}" alt="">`
    : `<div class="chip" style="background:${esc(sw?.color || '#eee')}"></div>`;
  return `<figure>${visual}<figcaption><b>${label}</b><br>${esc(sw?.label || sw?.color || '-')}</figcaption></figure>`;
}

export function printTechPack(item) {
  const { swatches = {} } = item;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tech-Pack ${esc(item.name)}</title>
<style>
@page { size: A4; margin: 14mm }
body { font: 13px/1.5 Inter, Arial, sans-serif; color: #1a1a2e }
h1 { font-size: 22px; margin: 0 0 2px } .sub { color: #666; margin-bottom: 16px }
.row { display: flex; gap: 14px; margin-bottom: 16px } .row > * { flex: 1 }
.hero img { width: 100%; max-height: 360px; object-fit: contain; border: 1px solid #ddd; border-radius: 8px }
.sw { display: flex; gap: 14px } figure { margin: 0; flex: 1; text-align: center }
figure img, .chip { width: 100%; height: 110px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; display: block }
table { width: 100%; border-collapse: collapse } td { border-bottom: 1px solid #eee; padding: 6px 4px } td:first-child { color: #666; width: 38% }
h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 2px solid #c9a227; padding-bottom: 4px }
</style></head><body>
<h1>${esc(item.name)}</h1><div class="sub">SareeFusion Tech-Pack &middot; ${esc(item.id)}</div>
<div class="row hero"><div><img src="${esc(item.drape)}" alt=""></div>${item.template ? `<div><img src="${esc(item.template)}" alt=""></div>` : ''}</div>
<h2>Component swatches</h2>
<div class="sw">${swatchCell('Border', swatches.border)}${swatchCell('Body / Motif', swatches.body)}${swatchCell('Pallu', swatches.pallu)}</div>
<h2>Specification</h2>
<table>
<tr><td>Design ID</td><td>${esc(item.id)}</td></tr>
<tr><td>Status</td><td>${esc(item.status.label)}</td></tr>
<tr><td>Created</td><td>${esc(item.createdLabel || '-')}</td></tr>
<tr><td>Engine</td><td>${esc(item.engine || 'SareeFusion Studio')}</td></tr>
<tr><td>Component codes</td><td>${esc((item.tags || []).join(' / ') || '-')}</td></tr>
<tr><td>Border construction</td><td>Continuous warp borders, top and bottom, through body, pallu and blouse piece</td></tr>
</table></body></html>`;

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
