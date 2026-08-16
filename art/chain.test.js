import test from 'node:test';
import assert from 'node:assert/strict';
import { chain, rlpBytes, rlpList } from './chain.js';

const hex = (arr) => Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');

// The regression that bit the first mainnet broadcast: a fresh wallet's first
// tx has nonce 0, and value 0. RLP's canonical form for the integer 0 is the
// EMPTY byte string (0x80) — NOT a single 0x00 byte, which Polygon nodes reject
// as "non-canonical integer (leading zero bytes)".

test('rlpBytes: integer 0 = empty byte string = 0x80', () => {
  assert.equal(hex(rlpBytes(new Uint8Array(0))), '80');
});

test('rlpBytes: single byte < 0x80 is its own encoding', () => {
  assert.equal(hex(rlpBytes(Uint8Array.of(0x00))), '00'); // a literal 0x00 byte string (NOT an integer)
  assert.equal(hex(rlpBytes(Uint8Array.of(0x7f))), '7f');
});

test('rlpBytes: single byte >= 0x80 gets a 0x81 prefix', () => {
  assert.equal(hex(rlpBytes(Uint8Array.of(0x80))), '8180');
});

test('rlpBytes: short string (2-55 bytes) gets 0x80+len prefix', () => {
  assert.equal(hex(rlpBytes(Uint8Array.of(0xde, 0xad))), '82dead');
});

test('rlpBytes: long string (>55 bytes) gets 0xb7+lenlen prefix', () => {
  const b = new Uint8Array(56).fill(0xaa);
  assert.equal(hex(rlpBytes(b)).slice(0, 4), 'b838'); // 0xb8 + len(56)=0x38
});

test('rlpList: empty list = 0xc0', () => {
  assert.equal(hex(rlpList([])), 'c0');
});

test('signLegacyTx: nonce=0 encodes as 0x80 (canonical), not 0x00', () => {
  const signed = chain.signLegacyTx({
    nonce: '0x0',
    gasPrice: '0x1',
    gasLimit: '0x5208',
    to: '',
    value: '0x0',
    data: '0x',
    priv: '0x' + '11'.repeat(32),
  }).slice(2);

  // Minimal RLP list-header decode to locate the first field (nonce).
  let i = 2;
  const first = parseInt(signed.slice(0, 2), 16);
  if (first >= 0xf8) i += (first - 0xf7) * 2; // long list: length-of-length bytes
  assert.equal(signed.slice(i, i + 2), '80', 'nonce=0 must be 0x80, got 0x' + signed.slice(i, i + 2));
});

test('createAddress(nonce=0) reproduces the live deployed contract address', () => {
  const addr = chain.createAddress('0x6fCf4790cC08eE4887d8b47e42A5a9Af8FAc8aBa', 0);
  assert.equal(addr, '0x2Ae7DA713A2c8527AF70825C0F79632AF2e2ae4A');
});

// ---- vault KDF migration (v1 210k iters → v2 600k iters) --------------------
// Node has no localStorage, so these tests install a fake one; the module's
// store checks `typeof localStorage` at call time, so it picks it up.

/** Encrypt privHex with PBKDF2-SHA256(password, 210000) → AES-256-GCM, v:1 blob. */
async function makeV1Blob(password, privHex) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, Buffer.from(privHex.replace(/^0x/, ''), 'hex')
  );
  return JSON.stringify({
    v: 1, kdf: 'PBKDF2-SHA256', iters: 210000, alg: 'AES-256-GCM',
    salt: hex(salt), iv: hex(iv), ct: hex(new Uint8Array(ct)),
  });
}

/** Run fn with a fake localStorage installed, restoring the env afterwards. */
async function withLocalStorage(fn) {
  const ls = new Map();
  globalThis.localStorage = {
    getItem: (k) => ls.get(k) ?? null,
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: (k) => ls.delete(k),
  };
  try {
    return await fn(ls);
  } finally {
    delete globalThis.localStorage;
  }
}

test('vault: new blobs are v:2 with 600000 PBKDF2 iterations', async () => {
  await withLocalStorage(async () => {
    await chain.createVault('hunter2');
    const blob = JSON.parse(chain.getVaultRaw());
    assert.equal(blob.v, 2);
    assert.equal(blob.iters, 600000);
    assert.equal(blob.kdf, 'PBKDF2-SHA256');
    assert.equal(chain.hasVault(), true);
    assert.equal((await chain.unlock('hunter2')).ok, true);
    chain.lock();
    assert.equal((await chain.unlock('wrong')).ok, false);
  });
});

test('vault: a v:1 blob re-encrypts to v:2 with the stronger KDF on unlock', async () => {
  await withLocalStorage(async (ls) => {
    const priv = '0x' + 'ab'.repeat(32);
    const v1raw = await makeV1Blob('hunter2', priv);
    ls.set('art_vaked_key', v1raw);

    const res = await chain.unlock('hunter2');
    assert.equal(res.ok, true, 'old-format blob still unlocks');
    assert.equal(chain.sessionAddress(), chain.privateToAddress(priv), 'same key material');

    const migrated = JSON.parse(chain.getVaultRaw());
    assert.equal(migrated.v, 2, 'migrated blob is v:2');
    assert.equal(migrated.iters, 600000, 'migrated blob uses the stronger KDF');
    // Fresh salt/iv — the re-encrypt is a brand-new envelope, not a header edit.
    assert.notEqual(migrated.salt, JSON.parse(v1raw).salt, 'fresh salt on migration');

    // The migrated blob unlocks with the same passphrase; wrong ones still fail.
    chain.lock();
    assert.equal((await chain.unlock('hunter2')).ok, true);
    chain.lock();
    assert.equal((await chain.unlock('nope')).ok, false);
  });
});
