import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPhone, FiArrowLeft } from 'react-icons/fi';
import { API_BASE_URL } from '../config';

export default function Help() {
  const [info, setInfo] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/help`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
      .then(setInfo)
      .catch(() => setFailed(true));
  }, []);

  const phone = info?.phone || '';
  // tel: links must not contain spaces or punctuation other than a leading +
  const dial = phone.replace(/[^\d+]/g, '');

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-8 sm:pt-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
        Need <span className="text-gold">help?</span>
      </h1>
      <p className="mt-2 text-sm text-muted sm:text-base">Call us and we'll sort it out.</p>

      <div className="mt-6 rounded-3xl border border-line bg-glass p-6 backdrop-blur-md">
        {failed ? (
          <p className="text-muted">We couldn't load the contact details. Please try again in a moment.</p>
        ) : !info ? (
          <p className="text-muted">Loading…</p>
        ) : phone ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold"><FiPhone size={22} /></span>
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Support phone</div>
                <div className="break-words font-display text-2xl font-bold text-fg">{phone}</div>
              </div>
            </div>
            {info.message && <p className="text-sm text-muted">{info.message}</p>}
            <a href={`tel:${dial}`}
              className="sf-tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#f2d874] to-gold px-5 font-semibold text-[#1d1700]">
              <FiPhone size={18} /> Call now
            </a>
          </div>
        ) : (
          <p className="text-muted">Support contact details haven't been added yet. Please check back soon.</p>
        )}
      </div>

      <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold">
        <FiArrowLeft /> Back to home
      </Link>
    </div>
  );
}
