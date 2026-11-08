import { API_BASE_URL } from '../config';
import { shrinkToJpeg } from './imageCompress';

// Vercel rejects request bodies over ~4.5 MB (HTTP 413), so keep the whole upload under this
const MAX_UPLOAD_BYTES = 4.0 * 1024 * 1024;
const SHRINK_STEPS = [
  { maxEdge: 1280, quality: 0.85 },
  { maxEdge: 1024, quality: 0.78 },
  { maxEdge: 800, quality: 0.7 },
];

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

const canvasToFile = (canvas, name, type = 'image/jpeg', quality = 0.9) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type }))
    : reject(new Error('Could not capture the template'))), type, quality);
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
  const slots = { body: assets.bodyImage, border: assets.borderImage, pallu: assets.palluImage };
  const originals = {};
  for (const [key, url] of Object.entries(slots)) {
    if (url) originals[key] = await urlToFile(url, assets.assetNames?.[key] || key);
  }

  // Shrink progressively until the whole upload fits the request-size limit
  let files = {};
  let template = null;
  for (const step of SHRINK_STEPS) {
    files = {};
    for (const [key, file] of Object.entries(originals)) files[key] = await shrinkToJpeg(file, step);
    template = templateCanvas ? await canvasToFile(templateCanvas, 'template.jpg', 'image/jpeg', step.quality + 0.05) : null;
    const total = Object.values(files).reduce((n, f) => n + f.size, 0) + (template?.size || 0);
    if (total <= MAX_UPLOAD_BYTES) break;
  }

  const form = new FormData();
  for (const [key, file] of Object.entries(files)) form.append(key, file);
  if (template) form.append('template', template);
  form.append('style', style || 'normal');
  form.append('description', description || '');

  const res = await fetch(`${API_BASE_URL}/api/generate`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (res.status === 413) throw new Error('The images are too large to upload. Try smaller swatch images.');
  if (!res.ok || !data.id) throw new Error(data.error || `Generation failed (${res.status})`);
  return withAbsoluteUrls(data);
}
