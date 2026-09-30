'use client';

import { useMemo, useRef, useState } from 'react';

function groupPairs(assets) {
  const pairs = new Map();
  for (const a of assets) {
    if (!a.pair_id || a.resource_type !== 'image') continue;
    const entry = pairs.get(a.pair_id) || {};
    if (a.phase === 'before') entry.before = a;
    if (a.phase === 'after') entry.after = a;
    pairs.set(a.pair_id, entry);
  }
  return Array.from(pairs.entries())
    .filter(([, v]) => v.before && v.after)
    .map(([pairId, v]) => ({ pairId, ...v }));
}

export default function BeforeAfterSlider({ assets }) {
  const pairs = useMemo(() => groupPairs(assets), [assets]);
  const [selected, setSelected] = useState(0);
  const [pos, setPos] = useState(50);
  const wrapRef = useRef(null);
  const dragging = useRef(false);

  if (pairs.length === 0) {
    return (
      <p className="empty-note">
        No complete before/after pair yet — upload two images with the same phase set on each and a
        matching Pair ID.
      </p>
    );
  }

  const pair = pairs[selected];

  function updateFromClientX(clientX) {
    const rect = wrapRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }

  return (
    <div>
      {pairs.length > 1 && (
        <div className="field">
          <label htmlFor="pairSelect">Pair</label>
          <select id="pairSelect" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {pairs.map((p, i) => (
              <option key={p.pairId} value={i}>
                {p.pairId}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        className="slider-wrap"
        ref={wrapRef}
        onMouseDown={(e) => {
          dragging.current = true;
          updateFromClientX(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && updateFromClientX(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
        onTouchStart={(e) => updateFromClientX(e.touches[0].clientX)}
        onTouchMove={(e) => updateFromClientX(e.touches[0].clientX)}
      >
        <img src={pair.before.secure_url} alt="Before" />
        <img
          src={pair.after.secure_url}
          alt="After"
          className="after-clip"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        />
        <div className="slider-handle" style={{ left: `${pos}%` }} />
      </div>
      <p className="empty-note" style={{ marginTop: 8 }}>
        Drag to compare &ldquo;before&rdquo; (left) against &ldquo;after&rdquo; (right) for {pair.pairId}.
      </p>
    </div>
  );
}
