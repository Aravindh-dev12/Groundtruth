// lib/verify.js
//
// The core differentiator: cross-check a claimed number against what's
// independently detectable in the project's field media, using GROUNDED
// object-detection counts (see lib/cloudinary.js) rather than trusting an
// LLM's raw read of a photo.
//
// Read the verdicts honestly. `detected_total` is a lower bound (see the
// detection-limits note in lib/cloudinary.js) -- a "partial" or
// "insufficient_evidence" verdict means "the submitted photos don't show
// enough to confirm this number," not "this claim is false." Surface that
// distinction to users; don't let the UI or report imply more precision
// than the underlying signal supports.

// Minimal synonym map so "saplings" can match a detector's "potted plant"
// class, etc. Extend this as you plug in a domain-specific detector with
// its own class vocabulary (see README "Extending detection").
const SYNONYMS = {
  tree: ['tree', 'plant', 'potted plant', 'sapling', 'seedling'],
  sapling: ['tree', 'plant', 'potted plant', 'sapling', 'seedling'],
  plant: ['tree', 'plant', 'potted plant', 'sapling', 'seedling'],
  waste: ['trash', 'garbage', 'waste', 'debris', 'bag', 'bottle'],
  debris: ['trash', 'garbage', 'waste', 'debris', 'bag', 'bottle'],
  bag: ['bag', 'trash', 'garbage', 'waste'],
  person: ['person', 'people', 'volunteer'],
  volunteer: ['person', 'people', 'volunteer'],
  structure: ['building', 'house', 'structure'],
  building: ['building', 'house', 'structure']
};

function candidateCategories(subject) {
  if (!subject) return [];
  const lower = subject.toLowerCase();
  for (const [key, list] of Object.entries(SYNONYMS)) {
    if (lower.includes(key)) return list;
  }
  // No known synonym group -- fall back to matching the subject word
  // itself against detected category names.
  return [lower];
}

/**
 * @param {object} claim  { quantity, subject } from lib/claude.js
 * @param {Array}  assets  rows from listAssetsByProject, each with
 *                         parsed `detected_objects` JSON
 */
export function crossCheckClaim(claim, assets) {
  const categories = candidateCategories(claim.subject);

  const supporting = [];
  let detectedTotal = 0;

  for (const asset of assets) {
    const detections = JSON.parse(asset.detected_objects || '[]');
    let assetCount = 0;

    for (const d of detections) {
      const cat = (d.category || '').toLowerCase();
      if (categories.some((c) => cat.includes(c))) {
        assetCount += d.count;
      }
    }

    if (assetCount > 0) {
      supporting.push({ asset_id: asset.id, public_id: asset.public_id, matched_count: assetCount });
      detectedTotal += assetCount;
    }
  }

  let verdict;
  let confidence;
  const claimed = claim.quantity;

  if (claimed == null) {
    verdict = 'insufficient_evidence';
    confidence = 'No specific quantity was extracted from the claim text, so nothing to cross-check.';
  } else if (detectedTotal >= claimed * 0.8) {
    verdict = 'supported';
    confidence = `Detected ${detectedTotal} matching instances across ${supporting.length} asset(s), at or above 80% of the claimed ${claimed}.`;
  } else if (detectedTotal >= claimed * 0.3) {
    verdict = 'partial';
    confidence = `Detected ${detectedTotal} of the claimed ${claimed} (${Math.round(
      (detectedTotal / claimed) * 100
    )}%) across ${supporting.length} asset(s). Detection is a lower bound -- occlusion, framing, and the detector's fixed class list can all cause undercounts.`;
  } else {
    verdict = 'insufficient_evidence';
    confidence =
      detectedTotal === 0
        ? `No matching instances detected across ${assets.length} asset(s) for this project.`
        : `Only ${detectedTotal} of the claimed ${claimed} detected -- well below what the claim states.`;
  }

  return {
    verdict,
    detected_total: detectedTotal,
    claimed_quantity: claimed,
    supporting_assets: supporting,
    confidence
  };
}
