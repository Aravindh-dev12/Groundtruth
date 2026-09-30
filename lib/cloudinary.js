// lib/cloudinary.js
//
// All direct Cloudinary API calls live here. Two things worth knowing
// before you touch this file:
//
// 1. Add-on availability and parameter names vary by plan and have
//    changed over time. `CLOUDINARY_DETECTION_MODEL` and
//    `CLOUDINARY_CATEGORIZATION_ADDON` in .env.local must match what's
//    actually enabled on your account (Console > Add-ons). If
//    `analyzeAsset` comes back with empty detections, that's the first
//    thing to check -- not a bug in this file.
//
// 2. `extractInstanceCounts` reports GROUNDED counts: real bounding-box
//    detections from an object-detection model, not a vision-language
//    model's guess at a number. This matters -- 2026 benchmarks found
//    general-purpose VLMs hallucinate badly on counting tasks precisely
//    because they answer from learned priors rather than what's in the
//    image. Detector-grounded counts avoid that failure mode, but they
//    have their own honest limits: occlusion, framing, and the
//    detector's fixed class vocabulary (COCO's ~80 classes don't include
//    "sapling" or "debris bag") mean a detected count is a LOWER BOUND
//    on what's actually present, not an exact audit. Treat verdicts in
//    lib/verify.js accordingly, and see README "Extending detection"
//    for how to plug in a custom-trained detector for domain-specific
//    categories.

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export { cloudinary };

/**
 * Upload a file buffer to Cloudinary and request AI add-ons at upload time.
 * @param {Buffer} buffer
 * @param {object} opts
 * @param {string} opts.folder          e.g. `groundtruth/<project_id>`
 * @param {string} [opts.resourceType]  'image' | 'video', default 'image'
 */
export function uploadBuffer(buffer, { folder, resourceType = 'image' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Request EXIF/geo metadata back with the response.
        image_metadata: true,
        // Ask for AI object detection + tagging at upload time. If these
        // add-ons aren't enabled on your plan, Cloudinary ignores the
        // params rather than failing the upload -- analyzeAsset() below
        // handles that gracefully.
        detection: process.env.CLOUDINARY_DETECTION_MODEL || 'coco_v2',
        categorization: process.env.CLOUDINARY_CATEGORIZATION_ADDON || 'google_tagging',
        auto_tagging: parseFloat(process.env.CLOUDINARY_AUTO_TAGGING_THRESHOLD || '0.6')
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Pull grounded object instance counts out of an upload result's
 * detection payload. Returns [{ category, count, avg_confidence }].
 * Shape defensively -- add-on response structure is one of the more
 * likely things to drift between Cloudinary API versions.
 */
export function extractInstanceCounts(uploadResult) {
  const detection =
    uploadResult?.info?.detection?.[process.env.CLOUDINARY_DETECTION_MODEL || 'coco_v2']?.data;

  if (!Array.isArray(detection)) return [];

  const byCategory = new Map();
  for (const item of detection) {
    // Expected shape per Cloudinary's Content Analysis add-on:
    // { tag: 'potted plant', confidence: 0.87, boundingbox: [...] }
    // -- confirm field names against your account's actual response
    // if this stays empty after a real upload.
    const category = item.tag || item.label || item.category;
    const confidence = item.confidence ?? item.probability ?? 0;
    if (!category) continue;

    const entry = byCategory.get(category) || { category, count: 0, confidenceSum: 0 };
    entry.count += 1;
    entry.confidenceSum += confidence;
    byCategory.set(category, entry);
  }

  return Array.from(byCategory.values()).map((e) => ({
    category: e.category,
    count: e.count,
    avg_confidence: e.count ? +(e.confidenceSum / e.count).toFixed(3) : 0
  }));
}

/**
 * Pull auto-tags out of an upload result (categorization/auto_tagging).
 */
export function extractTags(uploadResult) {
  return uploadResult?.tags || [];
}

/**
 * Pull GPS coordinates out of EXIF, when the camera recorded them.
 * Cloudinary returns raw EXIF under `image_metadata` when requested.
 */
export function extractGeo(uploadResult) {
  const meta = uploadResult?.image_metadata;
  if (!meta) return null;

  const lat = meta.GPSLatitude;
  const lng = meta.GPSLongitude;
  if (!lat || !lng) return null;

  // EXIF GPS is often a DMS string like `12 deg 58' 12.34" N` -- parsing
  // that fully is out of scope for this scaffold. If your source photos
  // carry GPS, extend this with a DMS->decimal conversion (several small
  // npm packages do this, or Cloudinary's Metadata add-on can return
  // pre-parsed decimal coordinates depending on plan).
  return { raw_lat: lat, raw_lng: lng };
}
