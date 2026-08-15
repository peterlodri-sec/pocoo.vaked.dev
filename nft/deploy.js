#!/usr/bin/env node
// nft/deploy.js — zero-dependency deploy runner for PaintingsForSecrets.
//
// Builds + signs + broadcasts the constructor transaction for the
// PaintingsForSecrets ERC-721 contract on Polygon mainnet (chain id 137),
// reusing the repo's own hand-rolled EIP-155 signing (art/chain.js →
// art/vendor/chain-crypto.js: noble-curves secp256k1 + js-sha3 keccak).
// No ethers, no hardhat/foundry, nothing loaded by the browser site.
//
// The compiled bytecode is NOT bundled here — it comes from a file produced
// by the compile step in nft/DEPLOY.md (default: nft/PaintingsForSecrets.bin).
//
// USAGE (from the repo root):
//   PRIVATE_KEY=0x... node nft/deploy.js                 # dry-run: build + sign + print, NO broadcast
//   PRIVATE_KEY=0x... node nft/deploy.js --broadcast     # broadcast the constructor tx
//   PRIVATE_KEY=0x... TREASURY=0x... node nft/deploy.js --broadcast
//   RPC_URL=https://... PRIVATE_KEY=0x... node nft/deploy.js --broadcast   # override RPC
//
// ENV:
//   PRIVATE_KEY     hex private key of the deploying account (required)
//   TREASURY        initialTreasury constructor arg (default: constellation
//                   payment wallet 0x4f584F6fd3a0a8C807aF2F00571c172603600578)
//   RPC_URL         RPC override (default: POLYGON_RPC in art/chain.js)
//   BYTECODE        creation bytecode as hex, OR a path to a .bin file
//                   (default: nft/PaintingsForSecrets.bin)
//   NONCE           optional explicit nonce (hex), default: from chain
//   GAS_PRICE_WEI   optional explicit gas price (hex wei), default: eth_gasPrice
//   GAS_LIMIT_MULT  gas limit multiplier over eth_estimateGas (default 2)
//
// Safety: dry-run by default. `--broadcast` sends REAL funds on mainnet.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chain } from '../art/chain.js';

const DEFAULT_TREASURY = '0x4f584F6fd3a0a8C807aF2F00571c172603600578';
const BROADCAST = process.argv.includes('--broadcast');
const DRY_RUN = !BROADCAST;
const IS_VAKED = process.argv.includes('--vaked') || (process.argv.includes('--contract') && process.argv[process.argv.indexOf('--contract') + 1]?.toUpperCase() === 'VAKED');

const RPC_URL = process.env.RPC_URL || chain.POLYGON_RPC;

// ---- tiny JSON-RPC helper (single named endpoint, matches POLYGON_RPC) ----
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(method + ': ' + j.error.message);
  return j.result;
}

function hexBytes(s) {
  let h = String(s).replace(/^0x/, '').replace(/\s+/g, '');
  if (h.length % 2) h = '0' + h;
  return h;
}

function argAddress(addr) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error('invalid address: ' + addr);
  return addr.slice(2).toLowerCase().padStart(64, '0');
}

function loadBytecode() {
  const cliIdx = process.argv.indexOf('--bytecode');
  const explicit = cliIdx !== -1 ? process.argv[cliIdx + 1] : process.env.BYTECODE;
  if (explicit) {
    if (explicit.startsWith('0x') && /^0x[0-9a-fA-F]+$/.test(explicit)) return explicit;
    if (existsSync(explicit)) return '0x' + hexBytes(readFileSync(explicit, 'utf8'));
    throw new Error('--bytecode value is neither hex nor an existing file: ' + explicit);
  }

  const candidateFiles = IS_VAKED
    ? [
        fileURLToPath(new URL('./VAKED.bin', import.meta.url)),
        fileURLToPath(new URL('./VAKED_sol_VAKED.bin', import.meta.url)),
      ]
    : [
        fileURLToPath(new URL('./PaintingsForSecrets.bin', import.meta.url)),
        fileURLToPath(new URL('./PaintingsForSecrets_sol_PaintingsForSecrets.bin', import.meta.url)),
      ];

  for (const f of candidateFiles) {
    if (existsSync(f)) {
      return '0x' + hexBytes(readFileSync(f, 'utf8'));
    }
  }

  const targetName = IS_VAKED ? 'VAKED' : 'PaintingsForSecrets';
  throw new Error(
    'no bytecode found for ' + targetName +
    '\n  Compile first — see nft/DEPLOY.md step 1, e.g.:\n' +
    '    cd /tmp/pfs-deploy && npx solc --base-path . --include-path node_modules \\\n' +
    '      --optimize --optimize-runs=200 --bin --abi -o build ' + targetName + '.sol\n' +
    '  then copy the .bin here:  cp /tmp/pfs-deploy/build/' + targetName + '_sol_' + targetName + '.bin nft/' + targetName + '.bin'
  );
}

function buildCreationData(bytecode, treasury) {
  if (IS_VAKED) {
    // VAKED constructor has 0 arguments
    const data = hexBytes(bytecode);
    if (!/^6080/i.test(data)) {
      console.warn('warning: bytecode does not start with 0x6080 — this does not look like standard init code.');
    }
    return '0x' + data;
  }
  // Constructor: PaintingsForSecrets(address initialTreasury)
  // ABI-encode the single address arg: left-padded into a 32-byte word.
  const data = hexBytes(bytecode) + argAddress(treasury);
  if (!/^6080/i.test(data)) {
    console.warn('warning: bytecode does not start with 0x6080 — this does not look like standard init code. proceed anyway? (Ctrl-C to abort)');
  }
  return '0x' + data;
}

function parseWeiHex(v, label) {
  const h = hexBytes(v);
  if (h.length === 0) throw new Error(label + ' empty');
  return BigInt('0x' + h);
}

function usage() {
  console.log(
    'usage: PRIVATE_KEY=0x... node nft/deploy.js [--contract PFS|VAKED] [--vaked] [--broadcast] [--bytecode <hex|file>] [--help]\n' +
    'env: TREASURY, RPC_URL, BYTECODE, NONCE, GAS_PRICE_WEI, GAS_LIMIT_MULT'
  );
}

export async function main() {
  if (process.argv.includes('--help')) { usage(); return; }
  const priv = process.env.PRIVATE_KEY;
  if (!priv || !/^0x[0-9a-fA-F]{64}$/.test(priv)) {
    throw new Error('PRIVATE_KEY env required (0x + 64 hex chars) — this script never stores or logs it');
  }
  const treasury = process.env.TREASURY || DEFAULT_TREASURY;
  const bytecode = loadBytecode();
  const data = buildCreationData(bytecode, treasury);
  const from = chain.privateToAddress(priv);
  const fromLower = from.toLowerCase();

  const nonceHex = process.env.NONCE || (await rpc('eth_getTransactionCount', [fromLower, 'pending']));
  const nonce = BigInt(nonceHex);
  const gasPriceHex = process.env.GAS_PRICE_WEI || (await rpc('eth_gasPrice', []));
  const gasPrice = BigInt(gasPriceHex);

  let gasLimit;
  try {
    const est = BigInt(await rpc('eth_estimateGas', [{ from: fromLower, data }]));
    const mult = BigInt(process.env.GAS_LIMIT_MULT || 2);
    gasLimit = (est * mult).toString(16);
  } catch (e) {
    gasLimit = '5b8d80'; // 6_000_000 wei of gas — generous floor for ~20 KB of init code
    console.warn('eth_estimateGas failed (' + (e && e.message ? e.message : e) + ') — using fallback gas limit 0x' + gasLimit);
  }

  const predicted = chain.createAddress(fromLower, nonce);

  const signed = chain.signLegacyTx({
    nonce: '0x' + nonce.toString(16),
    gasPrice: '0x' + gasPrice.toString(16),
    gasLimit,
    to: '',            // contract creation
    value: '0x0',
    data,
    priv,
  });

  const targetName = IS_VAKED ? 'VAKED (Mineable ERC-20)' : 'PaintingsForSecrets (ERC-721)';
  console.log('=== ' + targetName + ' deployment (Polygon mainnet, chain id ' + chain.CHAIN_ID + ') ===');
  console.log('from:            ' + from);
  if (!IS_VAKED) {
    console.log('treasury:        ' + treasury + (treasury === DEFAULT_TREASURY ? ' (default — override with TREASURY=... if needed)' : ''));
  }
  console.log('nonce:           ' + nonce.toString());
  console.log('gasPrice:        ' + gasPrice.toString() + ' wei');
  console.log('gasLimit:        ' + BigInt('0x' + gasLimit).toString());
  console.log('data length:     ' + (data.length - 2) / 2 + ' bytes (init code' + (IS_VAKED ? '' : ' + constructor arg') + ')');
  console.log('predicted addr:  ' + predicted);
  console.log('rpc:             ' + RPC_URL);
  console.log('signed tx:       ' + signed);
  if (DRY_RUN) {
    console.log('----------------------------------------------------------------------');
    console.log('DRY RUN — transaction signed but NOT broadcast. To send it (REAL FUNDS):');
    console.log('  PRIVATE_KEY=0x... node nft/deploy.js --broadcast');
    console.log('Or broadcast the raw tx above with any wallet/eth_sendRawTransaction.');
    return { dryRun: true, from, predicted, nonce: nonce.toString(), gasPrice: gasPrice.toString(), signed };
  }

  const txHash = await rpc('eth_sendRawTransaction', [signed]);
  console.log('broadcast!       tx: ' + txHash);
  console.log('polygonscan:     https://polygonscan.com/tx/' + txHash);
  console.log('contract:        https://polygonscan.com/address/' + predicted);
  return { dryRun: false, txHash, predicted, from };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file://' + process.cwd() + '/'));
if (isMain) {
  main().then(() => process.exit(0)).catch(e => {
    console.error('deploy failed: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}
