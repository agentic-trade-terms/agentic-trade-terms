# Agentic Trade Terms (ATT)

**Machine-readable terms of trade for account-less API commerce.** Draft for comment · schema id `att/v1`.

An API key was never just authentication — it was a contract relationship: delivery criteria, refund rules, a license to the output, a liability cap, someone to complain to. Account-less pay-per-call payment protocols such as x402 remove the account, and the account was where the contract lived.

ATT restores those terms in a form sized for machines:

- a small **JSON manifest** of composable modules — **T-DEL** (what counts as delivered), **T-REF** (remedy when it isn't), **T-LIC** (license grants: cache / derive / train / redistribute / resell, + attribution duty), **T-LIA** (liability cap), **T-ARB** (designated, pluggable arbiter + escalation ladder), **T-ID** (identity tier)
- **content-addressed**: `termsHash = keccak256(canonical JSON)` — anyone can recompute, no registry
- **bound to the payment**: the hash rides in the 402 offer (`extra.att`) and is echoed in the payment; the settled payment referencing the hash *is* the license receipt
- **adjudicable**: disputes are resolved *against the declared terms*, by the arbiter the manifest designates, with an on-chain verdict receipt
- **profiled**: `MICRO` / `STANDARD` / `HIGH` presets so a $0.20 call carries no escrow ceremony — but its license terms still bind

## 30 seconds

Seller's 402 response:

```json
{ "accepts": [{ "...": "...", "extra": { "att": {
  "termsHash": "0xec528e2f7984053e3bfd1d2b920376c52a65005f99f2a04346fa81f5a85c0ca4",
  "termsUri": "https://seller.example/.well-known/att.json",
  "profile": "STANDARD"
} } }] }
```

The manifest behind that hash: [`examples/standard.json`](./examples/standard.json). Verify it yourself:

```
npm install viem
node tools/hash.mjs examples/standard.json
```

## Repo map

| File | What |
|---|---|
| [`SPEC.md`](./SPEC.md) | the specification — modules, profiles, canonicalization, assent binding, dispute lifecycle, prior art |
| [`schema/att-v1.schema.json`](./schema/att-v1.schema.json) | JSON Schema for the manifest |
| [`examples/`](./examples) | MICRO / STANDARD / HIGH example manifests, a unicode canonicalization vector, + [`test-vectors.json`](./examples/test-vectors.json) (canonical form + keccak256) |
| [`tools/hash.mjs`](./tools/hash.mjs) | reference hasher |

## Status & how to comment

`att/v1` is a **draft for comment** — feedback of any scope is welcome as a [GitHub issue](../../issues). The schema freezes at v1 publication; new modules come as optional v1.1 extensions (candidates are listed in the spec).

## Neutrality

ATT is arbiter-pluggable by design: `T-ARB.arbiter` is a field, not an assumption — name an accountable human court, a decentralized court for objective disputes, or none. **The spec names no default arbiter.** [Taste](https://humantaste.app) authors and stewards the spec and separately operates a production arbiter implementation (human adjudication, EIP-712-signed rulings, on-chain verdict certificates) — stated here as a conflict-of-interest disclosure. The spec stands on its own without it.

## License

Spec text: [CC-BY-4.0](./LICENSE-CC-BY-4.0) · JSON schema + tools: [MIT](./LICENSE-MIT)
