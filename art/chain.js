import { secp256k1, keccak_256 } from './vendor/chain-crypto.js';

const CHAIN_ID = 137; // Polygon mainnet

// Single named constant for the Polygon RPC endpoint — change it in ONE place.
// The legacy public endpoint was deprecated 31 Jul 2026. The chosen primary is
// dRPC's keyless public Polygon endpoint (verified live: eth_chainId → 0x89);
// the old `.../ogrpc?network=polygon` URL now demands an API token, so it is
// NOT used here. One live public fallback is kept for resilience; the
// deprecated / key-locked entries are gone.
const POLYGON_RPC = 'https://polygon.drpc.org';
const RPCS = [
  POLYGON_RPC,
  'https://polygon-bor-rpc.publicnode.com',
];
const KEY_STORE = 'art_vaked_key';
const KDF_ITERATIONS = 210000; // PBKDF2-HMAC-SHA256

const memoryStore = new Map();
const store = {
  getItem: (k) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memoryStore.get(k) ?? null)),
  setItem: (k, v) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else memoryStore.set(k, v); },
  removeItem: (k) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memoryStore.delete(k); },
};

let sessionKey = null; // decrypted private key — memory only, never stored plaintext

function hexToBytes(h) {
  let s = String(h).replace(/^0x/, '');
  if (s.length % 2) s = '0' + s;
  if (s.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}
function bigintToBytes(v) {
  let s = v.toString(16);
  if (s.length % 2) s = '0' + s;
  return hexToBytes(s);
}
function toFixed32(v) {
  return hexToBytes(v.toString(16).padStart(64, '0'));
}
function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function rlpBytes(bytes) {
  const b = bytes;
  if (b.length === 1 && b[0] < 0x80) return b;
  if (b.length <= 55) {
    const out = new Uint8Array(b.length + 1);
    out[0] = 0x80 + b.length;
    out.set(b, 1);
    return out;
  }
  const lenBytes = bigintToBytes(BigInt(b.length));
  const out = new Uint8Array(b.length + 1 + lenBytes.length);
  out[0] = 0xb7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(b, 1 + lenBytes.length);
  return out;
}
function rlpList(items) {
  let payload = new Uint8Array(0);
  for (const it of items) payload = concat(payload, rlpBytes(it));
  if (payload.length <= 55) {
    const out = new Uint8Array(payload.length + 1);
    out[0] = 0xc0 + payload.length;
    out.set(payload, 1);
    return out;
  }
  const lenBytes = bigintToBytes(BigInt(payload.length));
  const out = new Uint8Array(payload.length + 1 + lenBytes.length);
  out[0] = 0xf7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(payload, 1 + lenBytes.length);
  return out;
}

function toChecksumAddress(address) {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = keccak_256(lower);
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

function privateToAddress(priv) {
  const pub = secp256k1.getPublicKey(hexToBytes(priv), false);
  const hash = keccak_256(pub.slice(1));
  return toChecksumAddress('0x' + hash.slice(-40));
}

// EIP-161 CREATE address: keccak256(rlp([sender, nonce]))[12..]. Used to
// predict a contract's address before broadcasting its creation transaction.
function createAddress(from, nonce) {
  const fromBytes = hexToBytes(from);
  const n = BigInt(nonce);
  const nonceBytes = n === 0n ? new Uint8Array(0) : bigintToBytes(n);
  const encoded = rlpList([fromBytes, nonceBytes]);
  const hash = keccak_256(encoded);
  return toChecksumAddress('0x' + hash.slice(-40));
}

function generateKey() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return '0x' + bytesToHex(b);
}

// ---- honest-irc auth vault: PBKDF2-SHA256 → AES-256-GCM ------------------
async function kdfKey(password, saltBytes, iterations) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptPrivateKey(privHex, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await kdfKey(password, salt, KDF_ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, hexToBytes(privHex)
  );
  const blob = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iters: KDF_ITERATIONS,
    alg: 'AES-256-GCM',
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };
  store.setItem(KEY_STORE, JSON.stringify(blob));
}

function hasVault() {
  const raw = store.getItem(KEY_STORE);
  if (!raw) return false;
  try { return JSON.parse(raw).v === 1; } catch (e) { return false; }
}

function getVaultRaw() {
  return store.getItem(KEY_STORE);
}

async function unlock(password) {
  const raw = store.getItem(KEY_STORE);
  if (!raw) return { ok: false, reason: 'no-vault' };
  let blob;
  try { blob = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'bad-vault' }; }
  if (!blob || blob.v !== 1) return { ok: false, reason: 'bad-vault' };
  try {
    const key = await kdfKey(password, hexToBytes(blob.salt), blob.iters);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(blob.iv) }, key, hexToBytes(blob.ct)
    );
    sessionKey = '0x' + bytesToHex(new Uint8Array(pt));
    return { ok: true, address: privateToAddress(sessionKey) };
  } catch (e) {
    sessionKey = null;
    return { ok: false, reason: 'wrong-passphrase' };
  }
}

function lock() { sessionKey = null; }

function isUnlocked() { return sessionKey !== null; }
function sessionAddress() { return sessionKey ? privateToAddress(sessionKey) : null; }
function sessionKeyHex() { return sessionKey; }

async function createVault(password) {
  if (!password) throw new Error('passphrase required');
  const priv = generateKey();
  await encryptPrivateKey(priv, password);
  sessionKey = priv;
  return { address: privateToAddress(priv) };
}

// ---- RPC + signing -------------------------------------------------------
async function rpc(method, params) {
  let lastErr = null;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all rpcs failed');
}

function signLegacyTx({ nonce, gasPrice, gasLimit, to, value, data, priv }) {
  const fields = [nonce, gasPrice, gasLimit, to, value, data].map(f => hexToBytes(f));
  const empty = new Uint8Array(0);
  const unsigned = rlpList([...fields, bigintToBytes(BigInt(CHAIN_ID)), empty, empty]);
  const hash = hexToBytes(keccak_256(unsigned));
  const sig = secp256k1.sign(hash, hexToBytes(priv), { format: 'recovered', prehash: false });
  let r = BigInt('0x' + bytesToHex(sig.slice(1, 33)));
  let s = BigInt('0x' + bytesToHex(sig.slice(33, 65)));
  const rec = sig[0] & 1;
  const v = BigInt(CHAIN_ID) * 2n + 35n + BigInt(rec);
  const signed = rlpList([...fields, hexToBytes(v.toString(16)), toFixed32(r), toFixed32(s)]);
  return '0x' + bytesToHex(signed);
}

async function sendRawTx({ to, value, data }) {
  if (!sessionKey) throw new Error('wallet locked');
  const from = privateToAddress(sessionKey);
  const nonce = await rpc('eth_getTransactionCount', [from, 'pending']);
  const gasPrice = await rpc('eth_gasPrice', []);
  let gasLimit;
  try {
    const est = await rpc('eth_estimateGas', [{ from, to, value, data }]);
    gasLimit = (BigInt(est) * 2n).toString(16);
  } catch (e) {
    gasLimit = '16e360';
  }
  const signed = signLegacyTx({ nonce, gasPrice, gasLimit, to, value, data, priv: sessionKey });
  return rpc('eth_sendRawTransaction', [signed]);
}

const chain = {
  CHAIN_ID,
  POLYGON_RPC,
  RPCS,
  privateToAddress,
  createAddress,
  generateKey,
  signLegacyTx,
  hasVault,
  getVaultRaw,
  createVault,
  unlock,
  lock,
  isUnlocked,
  sessionAddress,
  sessionKeyHex,
  rpc,
  sendRawTx,
  getReceipt: (hash) => rpc('eth_getTransactionReceipt', [hash]),
  call: (to, data) => rpc('eth_call', [{ to, data }, 'latest']),
  gasPrice: () => rpc('eth_gasPrice', []),
};

if (typeof window !== 'undefined') window.chain = chain;
export { chain };
