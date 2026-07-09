# Agentic Trade Terms (ATT) — v1

**Status:** draft for comment · **Schema id:** `att/v1` · **Author/steward:** [Taste](https://humantaste.app)
**License:** [CC-BY-4.0](./LICENSE-CC-BY-4.0) (this text) · [MIT](./LICENSE-MIT) (JSON schema + tools)
**Comment venue:** [GitHub issues](../../issues) on this repo.

---

x402 settles the payment. Nothing settles the terms. An API key used to carry a contract relationship — delivery criteria, refund rules, a license to the output, a liability cap, someone to complain to. Account-less pay-per-call deletes all of it. ATT puts it back: a small, modular, machine-readable terms manifest that binds to the payment by hash.

One sentence for integrators: **the seller declares a terms manifest; its keccak256 hash rides with the 402 offer and the payment; delivery, refunds, licensing, and dispute resolution then have a shared, content-addressed reference both agents — and any arbiter — can resolve.**

## design goals

| Goal | Meaning |
|---|---|
| modular | sellers compose modules; buyer policies require modules (Creative Commons pattern) |
| dual-form | canonical JSON for machines + optional human-readable legal mirror; one hash covers the manifest |
| content-addressed | `termsHash = keccak256(canonical JSON)`; anyone can recompute; no registry required to verify |
| profiled | preset bundles per ticket band, so a $0.20 call carries no escrow ceremony |
| arbiter-pluggable | the arbiter is a designated field, not an assumption — decentralized courts, named accountable experts, or none |
| rail-neutral | binds to x402 today; nothing in the manifest is x402-specific — the hash can ride any rail with a per-payment metadata slot (Google AP2 cart mandates, OpenAI/Stripe ACP, Stripe/Tempo's MPP) |

## manifest

Top-level object:

```json
{
  "schema": "att/v1",
  "profile": "STANDARD",
  "seller": "0x…",
  "legalMirrorUri": "https://seller.example/terms.pdf",
  "legalMirrorHash": "0x…",
  "modules": { "T-DEL": {}, "T-REF": {}, "T-LIC": {}, "T-LIA": {}, "T-ARB": {}, "T-ID": {} }
}
```

| Field | Req | Notes |
|---|---|---|
| `schema` | MUST | exactly `att/v1` |
| `profile` | MUST | `MICRO` \| `STANDARD` \| `HIGH` — declares the preset; explicit modules override preset defaults |
| `seller` | SHOULD | the wallet that receives payment; ties the manifest to the payee |
| `legalMirrorUri/Hash` | MAY | human-readable legal text; hash pins it. Absence means the JSON is the whole agreement; when present, **the JSON modules prevail on any conflict**, and the mirror MUST state that precedence itself |
| `modules` | MUST | at least `T-DEL` and `T-REF`; unknown module keys are invalid in v1 (no silent extension) |

## canonicalization and termsHash

`termsHash = keccak256(utf8(stableStringify(manifest)))`, where `stableStringify` is deterministic JSON: object keys recursively sorted (code-unit order), no whitespace, `undefined` members dropped, `null` kept, arrays in declared order.

```js
function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortJsonValue(value[key]);
    }
    return out;
  }
  return value;
}
const stableStringify = (v) => JSON.stringify(sortJsonValue(v));
```

A working tool and test vectors live in this repo: [`tools/hash.mjs`](./tools/hash.mjs), [`examples/test-vectors.json`](./examples/test-vectors.json).

Two rules keep the bytes identical across languages (the vectors alone cannot catch either, being all-ASCII and all-integer): numeric fields in v1 are **integers** and serialize as plain digits — no decimal point, no exponent (`capFixed` is a string for exactly this reason); and non-ASCII characters serialize as **literal UTF-8**, never `\u`-escaped (Python implementations: `ensure_ascii=False`). Cf. RFC 8785 for the general cross-language problem; v1 sidesteps it by construction.

The hash is the identity. `termsUri` (where the manifest is hosted — https or ipfs) is a convenience; a mismatch between fetched content and hash MUST be treated as no-terms.

keccak256 rather than SHA-256 is a stated trade-off: it is the EVM-native primitive — on-chain verifiers and verdict certificates recompute it at near-zero marginal cost — at the price of sitting outside WebCrypto, so non-EVM implementers need a library. For a spec whose finality layer is on-chain, the trade goes to keccak.

A hash without its preimage proves nothing: parties that may later rely on the terms SHOULD archive the manifest bytes at binding time — `termsUri` liveness is the seller's choice, not a protocol guarantee. Content addressing also supports confidential bilateral terms: a manifest need not be public — share it privately with the counterparty and bind it publicly by hash; anyone later shown the manifest can still verify.

## modules

### T-DEL — delivery

What counts as delivered. Machine-checkable first; these criteria feed tier-0 auto-adjudication.

| Field | Type | Default | Semantics |
|---|---|---|---|
| `schemaRef` | uri or 0x-hash | — | JSON Schema the response must validate against |
| `latencyMs` | int | — | max time from settled payment to response |
| `nonEmpty` | bool | true | response body non-empty and well-formed for its content type |
| `custom` | string ≤500 | — | free-text criteria; anything here is tier-1 (human) territory by definition |

`custom` is bounded three ways: it adds criteria and cannot override the structured fields; ambiguity in it is construed against the seller (the drafter wrote it); and arbiters SHOULD disregard criteria that are not objectively evaluable. Buyer policies MAY treat its presence as raising the effective risk tier.

Auto-adjudication has an evidence precondition, stated plainly: x402 delivery is direct seller→buyer, so no facilitator or arbiter witnesses the response unless the integration provides a witness (delivery through the facilitator, seller-signed responses, or an escrow that takes a delivery receipt). Where no witness exists, `auto` triggers degrade to tier-`human` questions about which artifact is authentic — the same limit x402r's README concedes by leaving delivery criteria "to external oracle conditions." A `responseSig` field (seller signs the response hash) is the v1.1 candidate that closes this for content criteria.

### T-REF — remedy

What happens when delivery fails.

| Field | Type | Default | Semantics |
|---|---|---|---|
| `auto` | array | `["5xx","timeout","schema-fail"]` | triggers refundable without human review |
| `windowHours` | int | 72 | dispute window from delivery (or from latency breach) |
| `remedy` | enum | `refund` | `refund` \| `redo` \| `partial` |
| `openBy` | enum | `buyer` | `buyer` \| `seller` \| `both` — who may open a dispute |

The stated remedy is the **exclusive** remedy for delivery failure (the "sole and exclusive remedy" pattern standard in production SLAs), except where T-LIA applies to losses beyond the price paid. For calibration: production credit-claim windows typically run ~30 days (Google Maps SLA; AWS credit requests run to the end of the second billing cycle); 72h is a deliberate agentic-speed deviation for machine-checkable triggers — the HIGH profile widens it (see profiles).

### T-LIC — license

Rights in the output. The settled payment referencing this manifest's hash **is** the license receipt: (payer, payee, amount, termsHash, timestamp) — a provable license chain with no extra ceremony.

| Grant flag | Meaning |
|---|---|
| `use-internal` | use inside the buying agent/org, **including ordinary retention** — context, logs, embeddings for the buyer's own operation (default; always implied) |
| `cache:<ttl\|perpetual>` | **reuse in place of a repeat purchase** — serving the stored result where a new paid call would otherwise be made |
| `derive` | create derivative works |
| `train` | use as ML training data |
| `redistribute` | share externally, non-commercial |
| `resell` | commercial resale |

| Field | Type | Default | Semantics |
|---|---|---|---|
| `grants` | array | `["use-internal"]` | grant flags per the table above |
| `conditions` | array | `[]` | duties attached to the grants; v1 defines one value: `attribution` (buyer must credit the seller when output is displayed/redistributed). Attribution is a standard duty in production display licensing (maps, market data). |

`grants: ["use-internal"]` if the module is present but empty. Sellers granting `train`/`resell` SHOULD hold the rights they grant — see T-ID `attested`.

**ODRL mapping (T-LIC is an ODRL-mappable profile, per the RightsML/Gaia-X profile pattern):** `use-internal`→`odrl:use`, `cache`→`odrl:reproduce` (+temporal constraint), `derive`→`odrl:derive`, `redistribute`→`odrl:distribute`, `resell`→`odrl:sell`, `attribution`→`odrl:attribute` (duty). `train` has no ODRL action — the vocabulary is being defined at IETF (AI-Pref WG, layered on ODRL/TDMRep); ATT's flag aliases to that term once it lands. Full ODRL policies (~20–25 lines JSON-LD minimum) are too heavy for a payment payload; the enum IS the wire format, the mapping is the standards bridge. Known expressiveness limit, accepted for v1: real licenses carry scoped carve-outs (e.g. "use outputs, except to train competing models") that a binary `train` cannot express — that nuance belongs in the legal mirror.

### T-LIA — liability

| Field | Type | Default | Semantics |
|---|---|---|---|
| `capMultiple` | int | 10 | liability cap = N × price paid |
| `capFixed` | decimal string | — | fixed cap, denominated in USD stablecoin (USDC in v1); overrides capMultiple if lower |
| `consequential` | bool | false | consequential damages excluded unless true |

Defaults vs common practice: production API liability caps typically track **trailing fees paid** (12 months is the usual formula) — ≈1× of aggregate relationship spend — with flat dollar caps at the extremes. The per-call translation of that norm is 1× price paid, which would make T-LIA redundant with T-REF's refund; `capMultiple: 10` is a buyer-protective deviation that gives the module meaning in one-shot trade, and `capFixed` carries the flat-cap pattern. Excluding consequential damages by default matches production terms across the board.

### T-ARB — arbiter

Who judges, how, and what the ruling produces. This module stands where a "governing law and forum" clause stood — with its limit stated: it designates forum and procedure, not governing law. Rulings are private ordering, enforced positionally (escrow, bond, reputation), not judgments with a recognition path in national courts; high-ticket trade that needs the latter should add choice of law and seat in the legal mirror.

| Field | Type | Default | Semantics |
|---|---|---|---|
| `ladder` | array | `["auto","human"]` | ordered tiers: `auto` (T-DEL criteria, machine), `human` (single accountable arbiter), `panel` (appeal) |
| `arbiter` | string | — | designated tier-1+ arbiter, e.g. `arbiter.example#disputes` — see *arbiter id resolution* below |
| `altArbiters` | array | — | acceptable substitutes (e.g. an optimistic oracle for objectively checkable disputes); the opener files with `arbiter` — an alternate applies only by mutual agreement or the facilitator's published policy, never unilateral pick |
| `feeSchedule` | object | — | e.g. `{ "human": "max(5%, 5 USDC)" }` — informative in v1, binding via facilitator config |
| `decisionWindowHours` | int | 72 | ruling deadline per tier |
| `finality` | enum | `cert-on-base` | `cert-on-base` = ruling hashed to an on-chain content certificate; `none` = verdict message only |
| `callback` | string | — | delivery contract for the ruling, e.g. `att-verdict-callback/v1` — a named contract declaring its payload (dispute id, verdict, cert id, rationale hash, termsHash, finality/overturn flags) |

Fee allocation default: the party opening a tier-`human`+ dispute fronts that tier's fee; a ruling against the respondent shifts it to them (loser pays). Facilitator config MAY override. This prices frivolous disputes without pricing out honest ones.

**Arbiter id resolution.** An arbiter id is either an `https://` URI (the arbiter's dispute-intake endpoint, used as-is) or a DNS-anchored id of the form `<domain>#<service>` (e.g. `arbiter.example#disputes`), resolved by fetching `https://<domain>/.well-known/att-arbiter.json` — an arbiter descriptor declaring `services` (service name → intake endpoint), supported ladder tiers, fee schedule, supported callback contracts, and finality options. Resolution locates the arbiter; it does not establish trust: facilitators SHOULD pin the arbiters they are willing to act on, and MAY maintain static id→endpoint mappings instead of live resolution. Sellers SHOULD prefer the DNS-anchored form for long-lived manifests: the arbiter id is hashed into the terms, so a descriptor lets the intake endpoint move without changing every published termsHash. Ids under other schemes (e.g. on-chain courts with no HTTP intake) are facilitator-resolved in v1; a descriptor format for those is a v1.1 candidate.

An accountable-human ruling under `finality: cert-on-base` is third-party checkable: recompute the rationale hash from the delivered assessment, resolve it on-chain, and (where the arbiter supports signed evidence) verify the reviewer's EIP-712 signature + personhood attestation. Integrity and timing need no trust in the arbiter's database; *availability* of the rationale text remains a retention duty — the arbiter's, and any party's who saved the delivered assessment.

### T-ID — identity (optional)

| Tier | Meaning |
|---|---|
| `anonymous` | wallet only (default) |
| `attested` | seller wallet bound to a verified legal entity (KYB) via a named attestor |
| `bonded` | `attested` + seller bond posted; bond slashable by ruling |

T-ID is seller-side by design: the seller carries the performance obligations the tiers vouch for, while the buyer's only obligation — payment — is already cryptographically settled. Buyer identity, mandates, and spend limits belong to the payment/identity layer (AP2 mandates, ERC-8004), not the terms.

## profiles

| Profile | Ticket band | Preset |
|---|---|---|
| `MICRO` | < $1 | direct settle (no escrow); T-REF `auto` triggers only, remedy = refund-claim; T-ARB ladder `["auto"]`; T-LIC applies in full |
| `STANDARD` | $1–100 | escrow; 72h window; ladder `["auto","human"]`; T-LIA capMultiple 10 |
| `HIGH` | > $100 | STANDARD + T-ID `bonded` + ladder `["auto","human","panel"]` + T-REF `windowHours: 168` (human-dispute claim windows commonly run ~30 days; 7 days is the high-ticket compromise) |

MICRO is not a terms-free zone: license terms bind even where dispute economics don't exist. Nobody arbitrates $0.20 — but $0.20 × 10⁶ calls of training data is a licensing question, and the hash chain answers it.

## assent binding

How the hash binds buyer and seller, in ascending strength:

| Level | Mechanism | Status |
|---|---|---|
| a | **facilitator-recorded**: seller's 402 response carries `extra.att = { termsHash, termsUri, profile }`; buyer echoes `termsHash` in the payment payload; facilitator validates match and records the pair with settlement | v0 — works with x402 today, no protocol change |
| b | **buyer co-signature**: EIP-712 signature over `{ paymentNonce, termsHash }` delivered with payment | v1 — cryptographic assent, zero facilitator trust |
| c | **scheme extension**: `termsHash` carried via the x402 extensions mechanism (cf. the shipped `offer-and-receipt` extension, which already signs per-call offers for dispute evidence) | proposal track, in parallel with (a) |

Level-a duties for the facilitator: fetch and schema-validate the manifest before recording the pair — an echoed hash whose manifest is unresolvable or invalid at settlement time is recorded as **no-terms** (fail closed) — and persist the manifest bytes with the settlement record (see retention above).

Sellers MUST treat a payment that echoes a stale/unknown hash as unbound (serve or refuse — but no terms attach). Buyers' policies SHOULD refuse 402 offers without ATT terms above a configured ticket size.

## dispute lifecycle

1. Delivery fails T-DEL or a party invokes T-REF within the window.
2. Tier `auto`: facilitator/escrow applies machine-checkable criteria (subject to the evidence precondition in T-DEL); refund or release.
3. Tier `human`: dispute (with `termsHash`, the delivered artifact, both positions) goes to the designated arbiter. Ruling = `approve | reject | partial` + reasoning citing module findings (e.g. "T-DEL.latencyMs breached; T-LIC not at issue").
4. Ruling delivered per `callback`; escrow acts on it; under `cert-on-base` the ruling's content hash is certified on-chain — the receipt either party can present later.
5. Tier `panel` (if laddered): appeal per the arbiter's published appeal rules; overturn re-fires the callback with `overturned: true`.

## enforceability — scope and limits

ATT v1 targets B2B and agent-to-agent commerce; consumer-agent trade is out of scope — in several jurisdictions (the EU in particular) pre-dispute arbitration terms do not bind consumers, and none of v1's defaults are calibrated to consumer-protection law. Hash-referenced terms are contract-of-adhesion territory, comparable to clickwrap. Factors that help: B2B context, explicit echo of the hash in the payment (level a) or a buyer signature (level b), and a human-readable legal mirror. Remedy *execution* is positional: where funds sit in escrow, a ruling executes mechanically; in direct-settled trade a ruling is a documented claim backed by the receipt chain, the seller's standing with facilitators, and — under T-ID `bonded` — a slashable bond. This draft has not had legal review; treat T-LIA and T-LIC as best-effort risk allocation until it has. The license *receipt* (who paid whom under which grant flags, when) is evidentiary regardless — the chain of custody exists even where a clause might not hold.

## prior art and composition

The nearest prior pattern we have identified is the **Ricardian contract** (Grigg, 1996; formalized 2004: hash-identified legal prose + machine parameters bound to transactions; deployed per-listing with designated moderators in OpenBazaar, per-asset with real arbitration in Mattereum) — the deltas here are per-HTTP-call granularity, machine-first JSON modules instead of a legal-markup DSL, facilitator-level enforcement, and tiered adjudication with on-chain verdict receipts. Adjacent live work ATT composes with rather than competes against:

| Neighbor | What it has | Composition |
|---|---|---|
| x402 `offer-and-receipt` extension (shipped) | signed per-call offer for dispute evidence — no terms modules, no arbiter | `termsHash` can ride the same extensions mechanism |
| x402r / Refund Protocol | per-call designated pluggable arbiter (`captureAuthorizer`) + escrow — no terms; adjudicates ad-hoc evidence | an x402r escrow whose arbiter resolves against an ATT manifest = the full stack |
| Legal Context Protocol (AAA-ICDR + Integra Ledger; founding contributors incl. Google, IBM, Circle) | `.well-known` pointer to an opaque terms document (explicitly terms-agnostic) + SHA-256 `atrHash` + optional signed acceptance; its `disputeResolution` names an institution and jurisdiction — not a machine-executable arbiter (no ladder, finality, or ruling callback) | the two nest: LCP's `terms` URL can point to an ATT manifest, its `atrHash` pins the served bytes, its signed acceptance is assent level b — ATT is the structured layer LCP leaves open |
| W3C ODRL / IETF AI-Pref | rights vocabulary | T-LIC is an ODRL-mappable profile (see T-LIC) |
| Accord Project (LF) | document-scale machine-readable contract templates | the legal mirror is instantiable as an Accord/Cicero template (Concerto-modeled) |
| Google AP2 mandates | signed per-transaction payment intent; disputes routed to card networks | an ATT termsHash can ride inside a Cart Mandate; ATT is rail-neutral by design |

No shipped system combines structured terms modules, per-call hash assent inside the 402 flow, adjudication against the declared terms, and an on-chain verdict receipt — that composition is ATT's claim, stated with these citations rather than as greenfield. The table is what our July 2026 sweep identified, not a completed map of the field; a counterexample shipping the full composition is the cheapest refutation, and exactly the comment this draft invites.

## versioning

`att/v1` freezes at this repo's v1.0 tag; until then it is draft for comment. Extensions come as `att/v1.1` with new optional modules. Candidates, drawn from clauses that recur in production API contracts: **T-DATA** (PII/DPA declarations); **T-IND** (indemnification — universal in real contracts but unenforceable against an anonymous wallet, so gated on T-ID `attested`+); **T-USE** (buyer-side service obligations — no-benchmarking / no-competing-product clauses are common in production API terms and nothing in v1 binds the buyer's use of the *service*); a `credit` remedy in T-REF for recurring buyer-seller pairs; **T-SLA** (uptime — likely ceded to infra; only per-call latency lives in T-DEL); a **capAsset** field on T-LIA (fixed caps in assets beyond USD stablecoins); **responseSig** in T-DEL (seller-signed response hash — authenticated evidence for `auto` triggers). Unknown modules are invalid rather than ignored — a manifest either parses under a version you support or binds nothing.

## implementations

- canonicalization + hashing: [`tools/hash.mjs`](./tools/hash.mjs) in this repo (reference; the test vectors are the conformance bar)
- arbiter side: the spec steward operates a production arbiter implementing T-ARB end-to-end — human adjudication, EIP-712-signed rulings, on-chain verdict certificates — which doubles as the spec's dogfood deployment. Implementation reports from other arbiters, sellers, and facilitators are welcome as issues.

The arbiter is pluggable by design; this spec names no default arbiter.
