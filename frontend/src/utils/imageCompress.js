// Downscale large camera-roll photos before they are used as swatches.
// Returns the original file when compression would not help.
export async function compressImage(file, { maxEdge = 1600, quality = 0.88 } = {}) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 800 * 1024) { bitmap.close?.(); return file; }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name, { type, lastModified: Date.now() });
}
