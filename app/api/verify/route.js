import { NextResponse } from 'next/server';
import { createClaim, createVerification, getProject, listAssetsByProject } from '../../../lib/db';
import { parseClaimWithClaude } from '../../../lib/claude';
import { crossCheckClaim } from '../../../lib/verify';
import { appendReceipt } from '../../../lib/receipts';
import { getUserIdFromRequest } from '../../../lib/auth';
import { checkRateLimit, LIMITS } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { allowed } = checkRateLimit(`${userId}:verify`, LIMITS.verify);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Verification rate limit reached. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { project_id, claim_text } = body;

  if (!project_id || !claim_text || !claim_text.trim()) {
    return NextResponse.json({ error: 'project_id and claim_text are required' }, { status: 400 });
  }

  const project = getProject(project_id);
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let parsed;
  try {
    parsed = await parseClaimWithClaude(claim_text);
  } catch (err) {
    return NextResponse.json({ error: `Claim parsing failed: ${err.message}` }, { status: 502 });
  }

  const claim = createClaim({
    project_id,
    claim_text,
    parsed_quantity: parsed.quantity,
    parsed_subject: parsed.subject
  });

  const assets = listAssetsByProject(project_id);
  const result = crossCheckClaim({ quantity: parsed.quantity, subject: parsed.subject }, assets);

  const verification = createVerification({
    claim_id: claim.id,
    project_id,
    ...result
  });

  appendReceipt({
    project_id,
    action: 'verify',
    actor: `user:${userId}`,
    input: { claim_text, parsed },
    output: result
  });

  return NextResponse.json(
    { claim, verification: { ...verification, supporting_assets: result.supporting_assets } },
    { status: 201 }
  );
}
