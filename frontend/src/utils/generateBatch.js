import { API_BASE_URL } from '../config';

// Turn an object URL / static path handed over by the Design page back into a
// File so it can be uploaded with the generate request.
async function urlToFile(url, name) {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Could not read ${name}`);
    return r.blob();
  });
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([blob], name?.includes('.') ? name : `${name}.${ext}`, { type: blob.type });
}

const canvasToFile = (canvas, name) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: 'image/png' }))
    : reject(new Error('Could not capture the template'))), 'image/png');
});

const absolute = (url) => (url?.startsWith('/api/') ? `${API_BASE_URL}${url}` : url);

// Absolute asset URLs for a batch returned by the API
export function withAbsoluteUrls(batch) {
  return {
    ...batch,
    thumbnails: (batch.thumbnails || []).map(absolute),
    designs: (batch.designs || []).map((d) => ({
      ...d, image: absolute(d.image), templateImage: absolute(d.templateImage),
    })),
  };
}

// POST /api/generate: the backend compiles the wearable drape (Output 1),
// stores the simulation's flat template (Output 2) and saves the batch to
// batches.json before responding.
export async function generateBatch({ assets, style, description, templateCanvas }) {
  const form = new FormData();
  const slots = { body: assets.bodyImage, border: assets.borderImage, pallu: assets.palluImage };
  for (const [key, url] of Object.entries(slots)) {
    if (url) form.append(key, await urlToFile(url, assets.assetNames?.[key] || key));
  }
  if (templateCanvas) form.append('template', await canvasToFile(templateCanvas, 'template.png'));
  form.append('style', style || 'normal');
  form.append('description', description || '');

  const res = await fetch(`${API_BASE_URL}/api/generate`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data.error || `Generation failed (${res.status})`);
  return withAbsoluteUrls(data);
}
