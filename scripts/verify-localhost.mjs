// Agents should run `npm run verify:live` after code changes when the dev server is already running (http://localhost:5175/).
// Start `npm run dev` in a separate terminal first; cold check without dev: `npm run verify:localhost` (optional HTTP). Override: `DASHBOARD_DEV_URL=...`.

import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const DEV_URL = process.env.DASHBOARD_DEV_URL ?? 'http://127.0.0.1:5175/';
const REQUIRE_DEV = process.env.VERIFY_REQUIRE_DEV === '1';

function runBuild() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['run', 'build'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
    shell: false,
  });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.signal) {
    console.error(`Build killed by signal: ${r.signal}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function httpCheck(urlString) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(
      url,
      {
        timeout: 8000,
        headers: { Connection: 'close' },
      },
      (res) => {
        res.resume();
        resolve({ statusCode: res.statusCode });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('Request timeout'), { code: 'ETIMEDOUT' }));
    });
  });
}

async function main() {
  console.log('[verify:localhost] Step A: npm run build\n');
  runBuild();
  console.log('\n[verify:localhost] Build OK.\n');
  console.log(`[verify:localhost] Step B: HTTP GET ${DEV_URL}\n`);

  try {
    const { statusCode } = await httpCheck(DEV_URL);
    console.log(
      `[verify:localhost] Dev server responded (HTTP ${statusCode}). Success.\n`,
    );
    process.exit(0);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
    const isRefused = code === 'ECONNREFUSED';
    if (isRefused) {
      console.warn(
        'Start `npm run dev` in another terminal, then re-run `npm run verify:localhost`\n',
      );
      if (REQUIRE_DEV) {
        console.error(
          'Run: npm run dev (separate terminal) then npm run verify:live\n',
        );
        console.error(
          '[verify:localhost] VERIFY_REQUIRE_DEV=1: treating missing dev server as failure.\n',
        );
        process.exit(1);
      }
      process.exit(0);
    }
    console.error('[verify:localhost] HTTP check failed:', err?.message ?? err);
    process.exit(1);
  }
}

main();
