// Short vibration on supported touch devices; silently does nothing elsewhere.
export const haptic = (ms = 10) => {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ }
};
