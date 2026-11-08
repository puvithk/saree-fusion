import { useEffect, useState } from 'react';
import { adminFetch } from './api.js';

export default function Settings() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    adminFetch('/settings')
      .then((d) => { setPhone(d.helpPhone || ''); setMessage(d.helpMessage || ''); setLoaded(true); })
      .catch((e) => setErr(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setOk('');
    try {
      await adminFetch('/settings', { method: 'PUT', body: JSON.stringify({ helpPhone: phone, helpMessage: message }) });
      setOk(phone.trim() ? 'Saved. Weavers now see this on the Help page.' : 'Cleared. The Help page shows no phone number.');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <>
      <h1 className="ad-h1">Help & Settings</h1>
      <form className="ad-glass ad-panel ad-form" onSubmit={save}>
        <h2>Help contact shown to weavers</h2>
        <p className="ad-muted small">Weavers see this on the Help page (Help button in the menu). Leave the number empty to hide it.</p>
        <label>Support phone number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" disabled={!loaded} />
        </label>
        <label>Note (optional, max 200 characters)
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Available Mon–Sat, 9am–6pm" maxLength={200} disabled={!loaded} />
        </label>
        {err && <div className="ad-error" role="alert">{err}</div>}
        {ok && <div className="ad-ok" role="status">{ok}</div>}
        <button className="ad-btn primary" disabled={busy || !loaded}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </>
  );
}
