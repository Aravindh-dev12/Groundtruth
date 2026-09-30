// lib/claude.js
//
// Two Claude calls, both deliberately narrow:
//   1. parseClaimWithClaude -- turn free-text into {quantity, unit, subject}
//   2. draftReport          -- turn VERIFIED numbers into narrative prose
//
// Report generation is given only verified/detected figures, never the raw
// claim text as ground truth -- the prompt explicitly instructs Claude to
// report what the evidence supports and flag anything it doesn't. That's
// the whole point of this app: the story should follow the evidence, not
// the other way around.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude({ system, messages, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in .env.local');
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: maxTokens,
      system,
      messages
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract a structured {quantity, unit, subject} from a free-text claim,
 * e.g. "we planted about 500 mangrove saplings across the site" ->
 * { quantity: 500, unit: 'saplings', subject: 'mangrove saplings' }.
 * Falls back to null fields if Claude can't find a clear quantity.
 */
export async function parseClaimWithClaude(claimText) {
  const raw = await callClaude({
    maxTokens: 300,
    system:
      'You extract a single quantified claim from field-report text. ' +
      'Respond with ONLY a JSON object, no prose, no markdown fences: ' +
      '{"quantity": number|null, "unit": string|null, "subject": string|null}. ' +
      'If multiple quantities appear, pick the one most central to the claim. ' +
      'If no clear quantity is present, return null for all three fields.',
    messages: [{ role: 'user', content: claimText }]
  });

  try {
    return JSON.parse(raw.trim());
  } catch {
    return { quantity: null, unit: null, subject: null };
  }
}

/**
 * Turn a free-text search query into structured filters over what's
 * actually stored (tags, detected-object categories, phase). This is NOT
 * vector-embedding semantic search -- Cloudinary doesn't ship that
 * natively (see README "Honest limitations"). What this buys you: a user
 * can type "cleanup photos with people in them" instead of knowing the
 * exact tag string, and get filters Claude inferred from that. Returns
 * { keywords: string[], phase: 'before'|'after'|null }.
 */
export async function parseSearchQuery(query) {
  const raw = await callClaude({
    maxTokens: 200,
    system:
      'You turn a natural-language media search query into filter keywords. ' +
      'Respond with ONLY a JSON object, no prose, no markdown fences: ' +
      '{"keywords": string[], "phase": "before"|"after"|null}. ' +
      'keywords should be short, literal words likely to appear as tags or detected-object ' +
      'categories (e.g. object names, activity words) -- not the full sentence. ' +
      'phase is "before" or "after" only if the query clearly asks for one of those, else null.',
    messages: [{ role: 'user', content: query }]
  });

  try {
    const parsed = JSON.parse(raw.trim());
    return {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [],
      phase: ['before', 'after'].includes(parsed.phase) ? parsed.phase : null
    };
  } catch {
    return { keywords: [], phase: null };
  }
}

/**
 * Draft a narrative impact report from verified project data. Only
 * verified/detected numbers go in -- never the raw unverified claim as
 * if it were fact.
 */
export async function draftReport({ project, verifications, assetSummary }) {
  const system =
    'You are drafting a short, donor-ready impact report section for an NGO field project. ' +
    'You are given VERIFIED figures (independently cross-checked against detected evidence in ' +
    "field photos) and each verification's verdict. Write in plain, concrete, non-hyperbolic " +
    'language. For any claim with verdict "partial" or "insufficient_evidence", say so plainly ' +
    'in the text rather than reporting the original claimed number as fact -- e.g. "field photos ' +
    'confirm at least 120 of the reported 500 saplings; the remainder could not be independently ' +
    'verified from submitted media." Do not invent figures that are not in the data provided. ' +
    'Output markdown with a title, a 2-3 sentence executive summary, and a short "Verified ' +
    'evidence" section listing each claim and its status.';

  const userContent = JSON.stringify(
    {
      project: { name: project.name, location: project.location, description: project.description },
      asset_summary: assetSummary,
      verifications: verifications.map((v) => ({
        claim: v.claim_text,
        claimed_quantity: v.claimed_quantity,
        detected_total: v.detected_total,
        verdict: v.verdict,
        confidence_note: v.confidence
      }))
    },
    null,
    2
  );

  return callClaude({ system, messages: [{ role: 'user', content: userContent }], maxTokens: 1200 });
}
