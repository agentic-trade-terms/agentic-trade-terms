#!/usr/bin/env node
/**
 * Compute the ATT termsHash of a manifest file.
 *
 *   npm install viem
 *   node tools/hash.mjs examples/standard.json
 *
 * termsHash = keccak256(utf8(stableStringify(manifest)))
 * stableStringify: object keys recursively sorted (code-unit order), no
 * whitespace, `undefined` dropped, `null` kept, arrays in declared order.
 */
import { readFileSync } from 'node:fs';
import { keccak256, toBytes } from 'viem';

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

export const stableStringify = (v) => JSON.stringify(sortJsonValue(v));
export const termsHash = (manifest) => keccak256(toBytes(stableStringify(manifest)));

const file = process.argv[2];
if (file) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  console.log(JSON.stringify({ file, canonical: stableStringify(manifest), termsHash: termsHash(manifest) }, null, 2));
}
