#!/usr/bin/env node
// Creates a Klaviyo OAuth app through the beta Create Application API and writes its client ID and
// client secret into .env, without printing the secret.
//
//   KLAVIYO_API_KEY=pk_... node <skill-dir>/scripts/create-oauth-app.mjs \
//     --env <project-root>/.env \
//     --title "My integration" \
//     --redirect-uri http://localhost:3001/api/auth/callback \
//     --scopes "accounts:read profiles:read" \
//     [--description "..."]
//
// --env defaults to ./.env in the current directory, so pass the project's .env when running the
// script from the skill's own directory.
//
// KLAVIYO_API_KEY must be a private key with the applications:write scope. The script generates
// a throwaway RSA key pair, sends only the public half, and decrypts the returned client secret
// (a compact JWE, RSA-OAEP-256 / A256GCM) in memory. The private key is never written to disk.
//
// Node 18+, no dependencies. Exit codes: 0 created, 1 API or decrypt error, 2 bad usage.

import {
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  constants,
} from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const API_URL = 'https://a.klaviyo.com/api/applications';
// Create Application is beta, so it needs the beta revision.
const REVISION = '2026-10-15.pre';

const usage = (message) => {
  console.error(`${message}\nSee the header of this script for usage.`);
  process.exit(2);
};

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith('--') || value === undefined) usage(`Bad argument: ${key}`);
  args[key.slice(2)] = value;
}
const { title, scopes, description } = args;
const redirectUris = (args['redirect-uri'] ?? '').split(',').filter(Boolean);
const envPath = args.env ?? '.env';
const apiKey = process.env.KLAVIYO_API_KEY;
if (!apiKey) usage('Set KLAVIYO_API_KEY to a private key with applications:write.');
if (!title) usage('--title is required.');
if (redirectUris.length === 0) usage('--redirect-uri is required.');
if (!scopes) usage('--scopes is required, e.g. "accounts:read profiles:read".');
// Klaviyo returns the client secret once, so fail before creating the app if it can't be saved.
try {
  accessSync(dirname(envPath), fsConstants.W_OK);
} catch {
  usage(`Can't write to ${envPath}: its directory doesn't exist or isn't writable.`);
}

const b64url = (value) => Buffer.from(value, 'base64url');

/** Decrypts a compact JWE (RSA-OAEP-256 key wrap, A256GCM content) with an RSA private key. */
export const decryptJwe = (token, privateKey) => {
  const [headerB64, keyB64, ivB64, ciphertextB64, tagB64] = token.split('.');
  const header = JSON.parse(b64url(headerB64).toString('utf8'));
  if (header.alg !== 'RSA-OAEP-256' || header.enc !== 'A256GCM') {
    throw new Error(`Unexpected JWE header: ${JSON.stringify(header)}`);
  }
  const contentKey = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    b64url(keyB64),
  );
  const decipher = createDecipheriv('aes-256-gcm', contentKey, b64url(ivB64));
  // The additional authenticated data is the protected header exactly as it was sent.
  decipher.setAAD(Buffer.from(headerB64, 'ascii'));
  decipher.setAuthTag(b64url(tagB64));
  return Buffer.concat([decipher.update(b64url(ciphertextB64)), decipher.final()]).toString(
    'utf8',
  );
};

/** Sets each key in a .env file, replacing an existing line or appending one. */
const writeEnv = (path, values) => {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const separator = text && !text.endsWith('\n') ? '\n' : '';
    text = pattern.test(text)
      ? text.replace(pattern, () => line)
      : `${text}${separator}${line}\n`;
  }
  // A file created at a default 0644 umask is readable by other local users until `chmodSync` below,
  // and a write that fails partway would truncate an existing .env. Write a private temporary file
  // beside it and rename it over the target, so the secret is never world-readable and the old file
  // survives a failed write. `wx` makes the create exclusive, so a leftover or planted file at that
  // name fails the write instead of being reused, and `mode` applies because the file is always new.
  const temporary = join(dirname(path), `.env.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  // `renameSync` keeps the temporary file's mode, and an existing .env replaced this way keeps it
  // too; narrow explicitly for a target that already existed.
  chmodSync(path, 0o600);
};

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { kty, n, e } = publicKey.export({ format: 'jwk' });

const response = await fetch(API_URL, {
  method: 'POST',
  headers: {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    accept: 'application/vnd.api+json',
    'content-type': 'application/vnd.api+json',
    revision: REVISION,
  },
  body: JSON.stringify({
    data: {
      type: 'application',
      attributes: {
        title,
        ...(description ? { description } : {}),
        oauth_callback_urls: redirectUris,
        scopes: scopes.split(/[\s,]+/).filter(Boolean),
        client_jwk: { kty, n, e, alg: 'RSA-OAEP-256', use: 'enc' },
      },
    },
  }),
});

const body = await response.json().catch(() => ({}));
if (response.status !== 201) {
  // Error bodies describe the request, not the secret, so they're safe to show.
  console.error(`Create Application failed (HTTP ${response.status}):`);
  console.error(JSON.stringify(body.errors ?? body, null, 2));
  process.exit(1);
}

const { id } = body.data;
const { client_id: clientId, client_secret_jwe: secretJwe, install_url: installUrl } =
  body.data.attributes;
let clientSecret;
try {
  clientSecret = decryptJwe(secretJwe, privateKey);
} catch (error) {
  console.error(`The app was created (id ${id}), but its client secret couldn't be decrypted:`);
  console.error(error.message);
  console.error(
    'Klaviyo returns the secret only once: generate a new client secret for this app in the UI.',
  );
  process.exit(1);
}

writeEnv(envPath, {
  KLAVIYO_CLIENT_ID: clientId,
  KLAVIYO_CLIENT_SECRET: clientSecret,
  KLAVIYO_REDIRECT_URI: redirectUris[0],
});

console.log(`Created app ${id} (draft).`);
console.log(`Client ID: ${clientId}`);
console.log(`Wrote KLAVIYO_CLIENT_ID, KLAVIYO_CLIENT_SECRET and KLAVIYO_REDIRECT_URI to ${envPath}.`);
if (installUrl) console.log(`Install URL: ${installUrl}`);
