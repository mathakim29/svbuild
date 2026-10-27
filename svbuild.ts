#!/usr/bin/env node
// svbuild.ts
import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const TMP = '/tmp/build';
const USAGE = `Usage: svbuild -i <dir with App.svelte> -o <output dir> [-t]
  -i  input dir
  -o  output dir
  -t  enable Tailwind
  -h  help`;

const fail = (msg: string, code = 1): never => {
  console.error(`✖ ${msg}`);
  process.exit(code);
};

// ---------- args ----------
let values: { i?: string; o?: string; t?: boolean; h?: boolean };
try {
  ({ values } = parseArgs({
    options: {
      i: { type: 'string', short: 'i' },
      o: { type: 'string', short: 'o' },
      t: { type: 'boolean', short: 't', default: false },
      h: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (e) {
  console.error(USAGE);
  fail((e as Error).message);
}
if (values.h) { console.log(USAGE); process.exit(0); }
if (!values.i || !values.o) { console.error(USAGE); process.exit(1); }

const input = resolve(values.i!);
const out = resolve(values.o!);
const useTailwind = !!values.t;

// ---------- helpers ----------
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k !== 'LD_LIBRARY_PATH'),
);

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function packageManifests(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await packageManifests(path));
    else if (entry.isFile() && entry.name === 'packages.txt') found.push(path);
  }
  return found;
}

async function packagesFrom(manifest: string): Promise<string[]> {
  const lines = (await readFile(manifest, 'utf8')).split(/\r?\n/);
  return lines
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
}

// Cross-compatible spawn wrapper
async function run(cmd: string, args: string[], cwd?: string): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env, shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    
    p.stdout?.on('data', (d) => (out += d.toString()));
    p.stderr?.on('data', (d) => (err += d.toString()));
    
    p.on('error', (e) => resolve({ ok: false, out, err: e.message }));
    p.on('close', (code) => resolve({ ok: code === 0, out, err }));
  });
}

async function retry<T extends { ok: boolean; err: string }>(
  fn: () => Promise<T>, tries = 3, label = 'task',
): Promise<T> {
  let r!: T;
  for (let n = 1; n <= tries; n++) {
    r = await fn();
    if (r.ok) return r;
    console.warn(`⚠ ${label} failed (try ${n}/${tries})`);
    if (n < tries) await new Promise((res) => setTimeout(res, 1000 * n));
  }
  return r;
}

// ---------- runtime detection ----------
const isBun = typeof process.versions.bun !== 'undefined';
const pmCmd = isBun ? 'bun' : 'npm';
const pmInstallArgs = isBun ? ['install', '--no-progress'] : ['install', '--no-audit', '--no-fund'];
const pmxCmd = isBun ? 'bun' : 'npx';
const pmxArgs = isBun ? ['x'] : [];

// ---------- validate input ----------
if (!(await exists(input))) fail(`Input dir not found: ${input}`);
const appFile = (await exists(join(input, 'App.svelte')))
  ? 'App.svelte'
  : (await exists(join(input, 'app.svelte')))
  ? 'app.svelte'
  : fail(`No App.svelte in ${input}`);

try {
  await mkdir(out, { recursive: true });
  await mkdir(TMP, { recursive: true });
} catch (e) {
  fail(`Cannot create dirs: ${(e as Error).message}`);
}

// ---------- deps ----------
const deps: Record<string, string> = { svelte: '^5' };
for (const manifest of await packageManifests(input)) {
  for (const spec of await packagesFrom(manifest)) {
    const match = spec.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@(.+))?$/);
    if (!match) fail(`Invalid package spec in ${manifest}: ${spec}`);
    deps[match[1]] = match[2] ? `^${match[2]}` : 'latest';
  }
}
if (useTailwind) {
  deps['tailwindcss'] = '^4';
  deps['@tailwindcss/cli'] = '^4';
}

const missing: string[] = [];
for (const d of Object.keys(deps)) {
  if (!(await exists(join(TMP, 'node_modules', d)))) missing.push(d);
}

if (missing.length) {
  console.log(`📦 Installing: ${missing.join(', ')} (using ${pmCmd})`);
  await writeFile(
    join(TMP, 'package.json'),
    JSON.stringify({ name: 'svbuild-tmp', private: true, dependencies: deps }),
  );

  let r = await retry(
    () => run(pmCmd, pmInstallArgs, TMP),
    2, `${pmCmd} install`,
  );
  if (!r.ok) fail(`Dependency install failed:\n${r.err}`);

  for (const d of Object.keys(deps)) {
    if (!(await exists(join(TMP, 'node_modules', d)))) {
      fail(`Dependency missing after install: ${d}`);
    }
  }
}

// ---------- tailwind (non-fatal) ----------
let cssOk = false;
if (useTailwind) {
  console.log('🎨 Tailwind');
  const entry = join(TMP, 'tw-input.css');
  await writeFile(entry, `@import "tailwindcss" source("${input}");\n`);
  
  const r = await retry(
    () => run(
      pmxCmd,
      [...pmxArgs, 'tailwindcss', '-i', entry, '-o', join(out, 'style.css')],
      TMP,
    ),
    2, 'tailwind',
  );
  
  if (r.ok && (await exists(join(out, 'style.css')))) {
    cssOk = true;
  } else {
    console.warn(`⚠ Tailwind skipped:\n${r.err.trim()}`);
  }
}

// ---------- svelte bundle ----------
let exitCode = 0;
try {
  console.log('⚡ Bundling');
  const result = await esbuild.build({
    stdin: {
      contents:
        `import { mount } from 'svelte';\nimport App from './${appFile}';\nmount(App, { target: document.body });`,
      loader: 'js',
      resolveDir: input,
    },
    bundle: true,
    format: 'esm',
    external: ['https://*'],
    outfile: join(out, 'bundle.js'),
    conditions: ['svelte', 'browser'],
    nodePaths: [join(TMP, 'node_modules')],
    logLevel: 'warning',
    plugins: [sveltePlugin({ compilerOptions: { css: 'injected' } })],
  });
  if (result.errors.length) throw new Error('esbuild reported errors');
} catch (e) {
  console.error(`✖ Bundle failed: ${(e as Error).message}`);
  exitCode = 1;
} finally {
  await esbuild.stop();
}

if (exitCode) process.exit(exitCode);

console.log(`✨ Done → ${out}${useTailwind && !cssOk ? ' (without Tailwind)' : ''}`);
