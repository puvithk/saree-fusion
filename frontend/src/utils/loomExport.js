// Shared loom-file compilation: places an order if needed, then asks the backend
// to compile the Jacquard / dobby files for it.
import { API_BASE_URL } from '../config';

export const filesFromOrder = (order) => {
  const outputs = order?.loomOutputs;
  if (!outputs) return [];
  return Object.values(outputs).flatMap((o) =>
    (o.files || []).map((f) => ({ ...f, group: o.name, url: `${API_BASE_URL}${f.url}` })));
};

export async function compileLoomFiles({ batchId, designId, order }) {
  let target = order;
  if (!target) {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, designId }),
    });
    if (!res.ok) throw new Error('Could not create a production order for this design.');
    target = await res.json();
  }
  const gen = await fetch(`${API_BASE_URL}/api/orders/${target.id}/generate-jacquard`, { method: 'POST' });
  const data = await gen.json().catch(() => ({}));
  if (!gen.ok) throw new Error(data.error || 'Loom file generation failed.');
  const files = filesFromOrder(data);
  if (!files.length) throw new Error('The loom compiler returned no files.');
  return { order: data, files };
}
