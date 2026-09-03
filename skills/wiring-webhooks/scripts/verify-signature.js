#!/usr/bin/env node
/**
 * Verify a Tribeunal webhook signature.
 *
 *   node verify-signature.js --secret <secret> --timestamp <ts> \
 *                            --signature <header> --body <file>
 *
 * Prints VALID or INVALID and exits 0 or 1, so a shell can branch on it.
 *
 * The signature covers "{timestamp}.{raw body bytes}" — the bytes exactly as
 * they arrived. Re-serialising the JSON is the mistake that costs an afternoon:
 * parse-then-stringify reorders keys and drops whitespace, so a genuine
 * delivery fails to verify and the receiver looks broken. Read the body as a
 * buffer, keep it, and verify against that.
 *
 * Loaded with dynamic import inside an async wrapper so this single file runs
 * whether Node treats it as ESM or CommonJS. That is not fussiness: this repo's
 * package.json says "type": "module", a directory without a package.json means
 * CommonJS, and static `require` or top-level `import` breaks in one of the two.
 * A verifier that crashes exits non-zero, which is indistinguishable from
 * "signature rejected" — so the broken case looks like a working one.
 */
(async () => {
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');

  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? undefined : process.argv[i + 1];
  };

  const secret = arg('secret');
  const timestamp = arg('timestamp');
  const signature = arg('signature');
  const bodyPath = arg('body');
  const toleranceSeconds = Number(arg('tolerance') ?? 300);

  if (!secret || !timestamp || !signature || !bodyPath) {
    console.error('usage: verify-signature.js --secret S --timestamp T --signature H --body FILE [--tolerance 300]');
    process.exit(2);
  }

  // Raw bytes, never a parsed-and-restringified object.
  const body = readFileSync(bodyPath);
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]))
    .digest('hex');

  // The header is `v1=<hex>`; compare only the digest, and in constant time so
  // a verifier cannot be used as an oracle to guess a signature byte by byte.
  const received = String(signature).replace(/^v1=/, '').trim();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  const digestMatches = a.length === b.length && timingSafeEqual(a, b);

  // A replayed delivery carries a valid signature forever, so the timestamp is
  // part of the check, not decoration.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  const fresh = Number.isFinite(age) && age <= toleranceSeconds;

  if (digestMatches && fresh) {
    console.log('VALID');
    process.exit(0);
  }

  console.log('INVALID');
  if (!digestMatches) console.error('  signature does not match the body');
  if (digestMatches && !fresh) {
    console.error(`  signature is valid but ${age}s old (tolerance ${toleranceSeconds}s) — possible replay`);
  }
  process.exit(1);
})();
