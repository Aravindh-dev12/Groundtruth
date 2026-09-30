'use client';

export default function Gallery({ assets }) {
  if (!assets.length) {
    return <p className="empty-note">No media uploaded yet.</p>;
  }

  return (
    <div className="gallery-grid">
      {assets.map((a) => (
        <div key={a.id} className="asset-thumb">
          {a.resource_type === 'video' ? (
            <video src={a.secure_url} muted style={{ width: '100%', height: 90, objectFit: 'cover' }} />
          ) : (
            <img src={a.secure_url} alt={a.tags.join(', ') || a.public_id} />
          )}
          <div className="caption">
            {a.phase}
            {a.pair_id ? ` · ${a.pair_id}` : ''}
            {a.detected_objects.length > 0 && (
              <>
                <br />
                {a.detected_objects
                  .slice(0, 3)
                  .map((d) => `${d.category}×${d.count}`)
                  .join(', ')}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
