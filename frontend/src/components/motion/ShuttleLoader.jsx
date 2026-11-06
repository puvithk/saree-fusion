// A weaving shuttle sliding across warp threads; used while compiling loom files.
export default function ShuttleLoader({ label = 'Weaving…' }) {
  return (
    <div className="shuttle-loader" role="status" aria-live="polite">
      <div className="shuttle-loom" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => <span key={i} className="shuttle-warp" style={{ '--i': i }} />)}
        <span className="shuttle-weft" />
        <span className="shuttle" />
      </div>
      <span className="shuttle-label">{label}</span>
    </div>
  );
}
