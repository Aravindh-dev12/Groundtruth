import { NextResponse } from 'next/server';
import { createAsset, getProject } from '../../../lib/db';
import { uploadBuffer, extractInstanceCounts, extractTags, extractGeo } from '../../../lib/cloudinary';
import { appendReceipt, hashPayload } from '../../../lib/receipts';
import { getUserIdFromRequest } from '../../../lib/auth';
import { checkRateLimit, LIMITS } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_PREFIXES = ['image/', 'video/'];

export async function POST(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { allowed } = checkRateLimit(`${userId}:upload`, LIMITS.upload);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Upload rate limit reached. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const projectId = formData.get('project_id');
  const phase = formData.get('phase') || 'unspecified'; // 'before' | 'after' | 'unspecified'
  const pairId = formData.get('pair_id') || null;

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!ALLOWED_PREFIXES.some((p) => (file.type || '').startsWith(p))) {
    return NextResponse.json({ error: 'Only image or video files are accepted' }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` },
      { status: 413 }
    );
  }

  const resourceType = (file.type || '').startsWith('video') ? 'video' : 'image';

  let uploadResult;
  try {
    uploadResult = await uploadBuffer(buffer, {
      folder: `groundtruth/${projectId}`,
      resourceType
    });
  } catch (err) {
    return NextResponse.json({ error: `Cloudinary upload failed: ${err.message}` }, { status: 502 });
  }

  const detectedObjects = extractInstanceCounts(uploadResult);
  const tags = extractTags(uploadResult);
  const geo = extractGeo(uploadResult);

  const asset = createAsset({
    project_id: projectId,
    public_id: uploadResult.public_id,
    secure_url: uploadResult.secure_url,
    resource_type: resourceType,
    phase,
    pair_id: pairId,
    tags,
    detected_objects: detectedObjects,
    geo,
    captured_at: uploadResult.image_metadata?.DateTimeOriginal || null
  });

  // Provenance: record the ingest step. We hash the Cloudinary response
  // (the untampered source-of-truth) plus what we derived from it, so any
  // later dispute about "what did the original analysis actually show"
  // can be checked against this hash.
  appendReceipt({
    project_id: projectId,
    asset_id: asset.id,
    action: 'ingest',
    actor: `user:${userId}`,
    input: { original_filename: file.name, size_bytes: buffer.length, phase, pair_id: pairId },
    output: {
      public_id: uploadResult.public_id,
      resource_type: resourceType,
      detected_objects: detectedObjects,
      tags,
      content_hash: hashPayload({ bytes: buffer.length, public_id: uploadResult.public_id })
    }
  });

  return NextResponse.json({ asset }, { status: 201 });
}
