// Unifies AI-fusion designs (batches) and saved simulations into one list of
// "collection items" so the gallery and the detail page share a single shape.
import { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { loadSavedSimulations } from './savedSimulations';

export const STATUS = {
  ready: { key: 'ready', label: 'Production Ready' },
  compiled: { key: 'compiled', label: 'Digital Jacquard Compiled' },
  draft: { key: 'draft', label: 'Draft' },
};

const abs = (u) => (u && u.startsWith('/api/') ? `${API_BASE_URL}${u}` : u || null);

// "23 Oct 2026, 07.51 PM" -> timestamp (0 when unparseable)
const parseCreated = (s) => {
  const t = Date.parse(String(s || '').replace(/(\d)\.(\d{2})/, '$1:$2'));
  return Number.isNaN(t) ? 0 : t;
};

function swatchFor(batch, kind, label) {
  const list = batch.uploadedComponents?.[kind] || [];
  const hit = list.find((c) => c.label === label) || list[0];
  return hit ? { label: hit.label, image: abs(hit.image) } : null;
}

function fromBatch(batch, ordersByDesign) {
  const generating = batch.status === 'generating';
  const base = {
    kind: 'design',
    batchId: batch.id,
    created: parseCreated(batch.createdOn),
    createdLabel: batch.createdOn,
    engine: batch.engine,
    description: batch.description,
  };
  const designs = batch.designs || [];
  if (!designs.length) {
    const cover = abs(batch.thumbnails?.[0]);
    return [{ ...base, id: batch.id, name: batch.name, drape: cover, template: null,
      status: STATUS.draft, tags: [], swatches: {}, order: null }];
  }
  return designs.map((d) => {
    const [p, br, b] = d.tags || [];
    const order = ordersByDesign[d.id] || null;
    return {
      ...base,
      id: d.id,
      name: d.name,
      drape: abs(d.image),
      template: abs(d.templateImage),
      tags: d.tags || [],
      match: d.matchPercent,
      swatches: {
        border: swatchFor(batch, 'border', br),
        body: swatchFor(batch, 'body', b),
        pallu: swatchFor(batch, 'pallu', p),
      },
      order,
      status: generating ? STATUS.draft : order?.jacquardCardUrl ? STATUS.compiled : STATUS.ready,
    };
  });
}

function fromSimulation(sim) {
  return {
    id: sim.id,
    kind: 'simulation',
    name: sim.name || 'Untitled simulation',
    drape: sim.thumbnail,
    template: null,
    created: Date.parse(sim.savedAt) || 0,
    createdLabel: new Date(sim.savedAt).toLocaleString(),
    status: STATUS.draft,
    tags: [],
    swatches: {
      border: { label: 'Border', color: sim.palette?.border?.color },
      body: { label: 'Body', color: sim.palette?.body?.color },
      pallu: { label: 'Pallu', color: sim.palette?.pallu?.color },
    },
    order: null,
  };
}

export function useCollectionItems() {
  const [state, setState] = useState({ items: [], loading: true, error: null });

  const load = useCallback(() => {
    let stale = false;
    const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))));
    Promise.allSettled([
      json(`${API_BASE_URL}/api/batches`),
      loadSavedSimulations(),
      json(`${API_BASE_URL}/api/orders`),
    ]).then(([batches, sims, orders]) => {
      if (stale) return;
      const ordersByDesign = {};
      (orders.value || []).forEach((o) => {
        if (o.design?.id && (!ordersByDesign[o.design.id] || o.jacquardCardUrl)) ordersByDesign[o.design.id] = o;
      });
      const items = [
        ...(batches.value || []).flatMap((b) => fromBatch(b, ordersByDesign)),
        ...(sims.value || []).map(fromSimulation),
      ].sort((a, b) => b.created - a.created);
      setState({
        items,
        loading: false,
        error: batches.status === 'rejected' && sims.status === 'rejected' ? 'Could not load your collection.' : null,
      });
    });
    return () => { stale = true; };
  }, []);

  useEffect(() => load(), [load]);
  return { ...state, reload: load };
}

export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
