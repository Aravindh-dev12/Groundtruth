import { NextResponse } from 'next/server';
import { getProject, listAssetsByProject, listVerificationsByProject } from '../../../lib/db';
import { draftReport } from '../../../lib/claude';
import { appendReceipt } from '../../../lib/receipts';
import { getUserIdFromRequest } from '../../../lib/auth';
import { checkRateLimit, LIMITS } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { allowed } = checkRateLimit(`${userId}:report`, LIMITS.report);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Report generation rate limit reached. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const { project_id } = await request.json();
  if (!project_id) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  const project = getProject(project_id);
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const assets = listAssetsByProject(project_id);
  const verifications = listVerificationsByProject(project_id);

  const parseJsonArray = (value) => {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const verdictCounts = verifications.reduce((counts, verification) => {
    counts[verification.verdict] = (counts[verification.verdict] || 0) + 1;
    return counts;
  }, {});

  const assetSummary = {
    total_assets: assets.length,
    before_count: assets.filter((a) => a.phase === 'before').length,
    after_count: assets.filter((a) => a.phase === 'after').length,
    paired_count: new Set(assets.filter((a) => a.pair_id).map((a) => a.pair_id)).size,
    all_tags: [...new Set(assets.flatMap((a) => parseJsonArray(a.tags)))],
    verification_count: verifications.length,
    verdict_counts: verdictCounts
  };

  let markdown;
  try {
    markdown = await draftReport({ project, verifications, assetSummary });
  } catch (err) {
    return NextResponse.json({ error: `Report generation failed: ${err.message}` }, { status: 502 });
  }

  appendReceipt({
    project_id,
    action: 'report_generated',
    actor: 'claude:report-generator',
    input: { asset_summary: assetSummary, verification_count: verifications.length },
    output: { markdown_length: markdown.length }
  });

  return NextResponse.json({ markdown });
}
