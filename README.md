# GroundTruth

**Evidence-grounded field media intelligence for NGO / sustainability impact reporting**, built on Cloudinary.

Most impact-media tools stop at "is this photo real" (Truepic, blockchain-provenance tools) or work purely from text claims ("does this sustainability report contradict the news," per academic greenwashing-detection systems like EmeraldMind). None of them close the loop between the two: **does the photographic evidence actually support the number in the report?**

GroundTruth does. It ingests field photos/videos through Cloudinary, runs grounded object detection (not an LLM's guess) to independently count what's visible, cross-checks that count against whatever claim a field team makes ("we planted 500 saplings"), and only then drafts the narrative impact report — using the verified number, with the gap flagged plainly if there is one.

## Why "grounded" matters

General-purpose vision-language models are unreliable at counting — they answer from learned priors about what a scene "should" contain rather than what's actually in the frame. Multiple 2026 benchmarks (ICML, ICLR) measured this directly; one found accuracy as low as ~17% on simple counting tasks. The fix is to ground counts in an actual object-detection model's bounding-box output instead of trusting a language model's eyeballed number. That's what `lib/verify.js` does: it reads real detection instances (via Cloudinary's Content Analysis add-on) and treats them as a **lower bound**, never a guess dressed up as a fact.

## Architecture

```
                     ┌─────────────────────┐
                     │  Auth gate          │
                     │  email+password     │
                     │  (scrypt) + signed  │
                     │  session cookie     │
                     │  lib/auth.js +      │
                     │  middleware.js      │
                     └──────────┬──────────┘
                                │ every request carries a verified user id
                                ▼
                     ┌─────────────────────┐
   field photo/video │   Next.js app       │
   ─────────────────▶│  (upload route)     │
                     └──────────┬──────────┘
                                │ upload + request add-ons
                                ▼
                     ┌─────────────────────┐
                     │     Cloudinary      │
                     │ - storage (source   │
                     │   of truth, never   │
                     │   overwritten)      │
                     │ - Content Analysis  │
                     │   (object detection)│
                     │ - auto-tagging      │
                     │ - EXIF/geo metadata │
                     └──────────┬──────────┘
                                │ detections + tags + geo
                                ▼
                     ┌─────────────────────┐        ┌────────────────────┐
                     │   SQLite (lib/db)   │───────▶│  Provenance ledger  │
                     │ projects / assets / │        │  (lib/receipts.js)  │
                     │ claims / verifs     │        │  HMAC hash-chained, │
                     └──────────┬──────────┘        │  append-only        │
                                │                    └────────────────────┘
                                ▼
                     ┌─────────────────────┐
                     │  Claim vs. evidence │
                     │  cross-check        │
                     │  (lib/verify.js)    │
                     └──────────┬──────────┘
                                ▼
                     ┌─────────────────────┐
                     │  Claude (lib/claude │
                     │  .js): claim parsing│
                     │  + report drafting  │
                     │  from VERIFIED data │
                     └─────────────────────┘
```

Every ingest, verification, and report-generation step writes a signed entry into the same append-only ledger — so the trail from raw upload to final report number is traceable and tamper-evident, without needing full C2PA infrastructure (see "Provenance roadmap" below).

## Accounts & access control

- **Passwords** are hashed with Node's built-in `scrypt` (no extra dependency) and compared with a timing-safe check — never stored or compared as plaintext.
- **Sessions** are a signed, stateless cookie: `<userId>.<expiry>.<HMAC-SHA256 signature>`. There's no session table to manage; anyone holding a valid, unexpired, correctly-signed cookie is authenticated. Signing happens in `lib/auth.js` (Node runtime, used by the login/signup routes); the *same* signature is independently re-verified in `middleware.js` using Web Crypto instead of Node's `crypto` module, because Next.js middleware runs on the Edge runtime, which doesn't have Node's `crypto`. Both are plain HMAC-SHA256 over the same bytes, so a token signed one way verifies correctly the other — this was tested directly (sign in Node, verify via SubtleCrypto) before being wired in, including tamper and wrong-secret cases.
- **Every project is owned by exactly one user.** All project/asset/verification/receipt routes check `project.owner_id` against the requesting session before returning anything, and return a plain 404 (not 403) for someone else's project, so the API doesn't leak which project ids exist.
- **Rate limiting** (`lib/rate-limit.js`) caps upload/verify/report calls per user, since each one spends money on Cloudinary add-ons or the Anthropic API. It's in-memory, which is fine for one instance — see the file's own comment for what changes if you scale to multiple instances.
- **Not included**: password reset, email verification, CSRF tokens (mitigated but not eliminated by the `SameSite=Lax` cookie setting), and multi-user roles within one project (it's single-owner only right now). See "Going to production."

## Mapping to the six required capabilities

| Capability | Where it lives |
|---|---|
| Intelligent media organization | Cloudinary folders + `phase`/`pair_id`/project structured metadata (`lib/db.js` `assets` table) |
| Before/after comparison | `pair_id`-linked assets rendered in `components/BeforeAfterSlider.js` |
| AI tagging & search | Cloudinary auto-tagging + Content Analysis on ingest (`lib/cloudinary.js`); natural-language search via `app/api/search/route.js`, which has Claude turn a free-text query into tag/category/phase filters (see "Honest limitations" — this is keyword filtering informed by AI, not vector-embedding semantic search) |
| Context & signal extraction | Object detection, EXIF geo, and (for video) transcription/scene add-ons — see "Extending detection" |
| Impact reporting & story generation | `lib/claude.js` `draftReport`, fed only verified figures |
| Traceability & provenance | `lib/receipts.js` hash-chained, HMAC-signed ledger; `components/ProvenanceLedger.js` |

## Setup

1. **Cloudinary account** — grab your cloud name, API key, and API secret from the console. In **Console → Add-ons**, enable an object-detection add-on (Content Analysis / AI Content Analysis) and a tagging add-on (Google Auto Tagging or similar). Exact add-on names and parameters vary by plan and have changed over time — confirm what's actually enabled on your account before assuming `CLOUDINARY_DETECTION_MODEL`/`CLOUDINARY_CATEGORIZATION_ADDON` in `.env.example` are correct; adjust them to match.
2. **Anthropic API key** — from console.anthropic.com.
3. Copy `.env.example` to `.env.local` and fill in every value, including real random values for both `RECEIPT_SIGNING_SECRET` and `SESSION_SECRET` (the command to generate each is in the comment above it — use two *different* random values, not the same one twice).
4. `npm install`
5. `npm run dev`, then open `http://localhost:3000` — you'll land on `/login`. Click through to create an account first; there's no seeded user.

No seed script is included on purpose — for the demo video, use 10–20 real photos from an actual or staged field site (2–3 before/after pairs are enough to show the slider, tagging, and verification loop convincingly).

## Honest limitations (read before demoing)

- **Detected counts are a floor, not an audit.** Occlusion, framing, and the detector's fixed class vocabulary (COCO's ~80 classes have no "sapling" or "debris bag" class) all cause undercounts. `lib/verify.js` and the report prompt both treat a low detected count as "the photos don't confirm this many," never as "this claim is false." Say this explicitly in your demo — it's a feature of honest design, not a bug to hide.
- **Search (`app/api/search`) is Claude-assisted keyword filtering, not vector-embedding semantic search.** Cloudinary doesn't ship native natural-language semantic search; its MCP asset-management tooling offers visual similarity search (reverse image search), which is a different thing. What's implemented: Claude turns your free-text query into a short list of literal keywords/phase, and those are matched against stored tags and detected-object categories. That covers "find the after photos with people in them" well; it won't do fuzzy conceptual matching the way real embedding search would on a large library. Swapping in embeddings (e.g. store a vector per asset from its tags/caption, query with cosine similarity) is the natural next step if your media library grows past a few hundred assets.
- **The synonym map in `lib/verify.js` (`SYNONYMS`) is intentionally small.** It's there to bridge a claim like "saplings" to a detector class like "potted plant." Extend it for your actual dataset's vocabulary before a real demo.

## Extending detection for domain-specific categories

COCO's general-purpose classes won't cover many field-evidence categories well (saplings vs. mature trees, specific debris types, construction milestones). Two upgrade paths, in order of effort:

1. **Prompt-based tagging** — Cloudinary's AI Vision add-on accepts natural-language category prompts at request time, which can approximate custom categories without training anything. Good for a hackathon timeline.
2. **Custom-trained detector** — for real deployments, a small fine-tuned YOLO-family model on your own labeled field photos will outperform COCO categories by a wide margin on domain-specific counting. Swap `extractInstanceCounts` in `lib/cloudinary.js` to call your own inference endpoint instead of (or alongside) Cloudinary's add-on; the rest of the pipeline (`lib/verify.js` onward) doesn't need to change.

## Provenance roadmap

This scaffold's ledger (HMAC hash-chain, `lib/receipts.js`) is a practical stand-in for full **C2PA / Content Credentials**, which Cloudinary supports in beta for images but currently gates behind a request-access program. The receipt shape here (actor, action, input/output hash, timestamp, chain link) maps directly onto a C2PA manifest's assertions — when/if beta access is granted, the migration is additive, not a rewrite.

## Going to production

- **Database**: swap `lib/db.js`'s better-sqlite3 calls for a hosted Postgres client (Neon, Supabase, RDS). SQLite's file won't persist on stateless serverless hosts (Vercel, most FaaS) between deploys or across instances. This is the single biggest remaining gap — everything else in this list is a refinement, this one is a required rewrite of one file before a real multi-instance deploy.
- **Auth is implemented** (email/password, scrypt hashing, signed sessions — see "Accounts & access control" above) but is intentionally minimal: no password reset, no email verification, no "forgot password" flow, and no roles/sharing within a project (one owner only). Add these before opening real user signups beyond a demo.
- **Rate limiting is in-memory**, per the note in `lib/rate-limit.js` — correct for one instance, needs a shared store (Redis/Upstash) once you run more than one.
- **Video at scale**: large video uploads and add-on processing (transcription, scene detection) should move to an async queue with a webhook callback rather than blocking the upload request, once files get bigger than a quick demo clip.
- **CSRF**: the session cookie is `SameSite=Lax`, which blocks the classic cross-site POST attack for an API-only backend like this, but isn't a substitute for real CSRF tokens if you later add cross-origin clients.

## Submission notes

- Cloudinary track deadline: 30 Sept 2026, via Cloudinary's Google Form (hackathon name: "Code Cubicle 2026").
- Evaluated only if the mandatory general problem statement (Concord) is separately submitted on Hack Culture.
- No live presentation round for this track — this README and a short demo video walkthrough (upload → tag → before/after slider → verify a claim → generate report → show the provenance ledger catching the claim's gap) are the pitch.
