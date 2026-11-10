#!/usr/bin/env node
/**
 * One release for both platforms.
 *
 *   npm run release patch          # 2.0.11 -> 2.0.12
 *   npm run release minor          # 2.0.11 -> 2.1.0
 *   npm run release 2.1.4          # explicit version
 *   npm run release patch --dry-run
 *
 * Bumps package.json (the only version number in the project), commits, tags v<version> and
 * pushes. The Release workflow builds the Windows installer and the APK, publishes both in
 * one GitHub Release and marks it "latest", which is what both in-app updaters read. Nothing
 * is built or uploaded from this machine, so the artifacts always match the pushed commit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = 'harshadmaneai-dotcom/walnut-budget';
const TIMEOUT_MINUTES = Number(process.env.RELEASE_TIMEOUT_MINUTES ?? 35);

function log(message) {
  console.log(`[release] ${message}`);
}

function fail(message) {
  console.error(`\n[release] ${message}\n`);
  process.exit(1);
}

function capture(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

/** npm is npm.cmd on Windows, which needs a shell to spawn. */
function runNpm(args) {
  const command = ['npm', ...args].join(' ');
  execFileSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`"${version}" is not a MAJOR.MINOR.PATCH version.`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), text: version };
}

function bump(current, requested) {
  const before = parseVersion(current);
  if (/^\d+\.\d+\.\d+$/.test(requested)) return parseVersion(requested);
  if (requested === 'major') return { ...before, major: before.major + 1, minor: 0, patch: 0, text: `${before.major + 1}.0.0` };
  if (requested === 'minor') return { ...before, minor: before.minor + 1, patch: 0, text: `${before.major}.${before.minor + 1}.0` };
  if (requested === 'patch') return { ...before, patch: before.patch + 1, text: `${before.major}.${before.minor}.${before.patch + 1}` };
  fail(`Unknown version "${requested}". Use patch, minor, major or an explicit x.y.z.`);
}

function writeVersions(version) {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lockPath = path.join(ROOT, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages && lock.packages['']) lock.packages[''].version = version;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
}

async function assetExists(tag, name) {
  try {
    const response = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${name}`, {
      method: 'HEAD',
      redirect: 'follow',
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForAssets(tag, version) {
  const deadline = Date.now() + TIMEOUT_MINUTES * 60 * 1000;
  const assets = ['latest.yml', 'Walnut-Setup.exe', 'Walnut.apk'];
  let announced = false;

  while (Date.now() < deadline) {
    const ready = [];
    for (const asset of assets) {
      if (await assetExists(tag, asset)) ready.push(asset);
    }
    if (ready.length === assets.length) return true;

    if (!announced) {
      log(`waiting for the workflow to publish ${assets.join(', ')} …`);
      log(`  build: https://github.com/${REPO}/actions`);
      announced = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }

  fail(
    `Timed out after ${TIMEOUT_MINUTES} minutes waiting for ${tag}.\n` +
      `Check the workflow: https://github.com/${REPO}/actions\n` +
      'The tag is pushed, so fix the failure and re-run the workflow; the release script can be re-run safely afterwards.',
  );
}

async function verifyPublished(version) {
  const tag = `v${version}`;

  const latestYml = await (await fetch(`https://github.com/${REPO}/releases/latest/download/latest.yml`)).text();
  if (!latestYml.includes(`version: ${version}`)) {
    fail(`latest.yml does not advertise ${version} — the desktop updater would not see this release.`);
  }

  const release = await (
    await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'walnut-release' },
    })
  ).json();
  const names = (release.assets ?? []).map((asset) => asset.name);
  for (const required of ['Walnut.apk', 'Walnut-Setup.exe', 'latest.yml']) {
    if (!names.includes(required)) fail(`${tag} is missing the ${required} asset.`);
  }

  const latest = await (
    await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'walnut-release' },
    })
  ).json();
  if (latest.tag_name !== tag) {
    fail(`GitHub's latest release is ${latest.tag_name}, expected ${tag}.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const requested = args.find((arg) => !arg.startsWith('-')) ?? 'patch';

  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') fail(`Release from main, not ${branch}.`);

  if (capture('git', ['status', '--porcelain'])) {
    fail('Working tree is not clean. Commit or stash your changes first.');
  }

  log('fetching origin …');
  capture('git', ['fetch', '--quiet', 'origin', 'main']);
  if (capture('git', ['rev-parse', 'HEAD']) !== capture('git', ['rev-parse', 'origin/main'])) {
    fail('Local main has commits that origin does not (or the other way round). Pull or push first.');
  }

  if (!existsSync(path.join(ROOT, 'android/app/walnut-debug.jks'))) {
    fail('android/app/walnut-debug.jks is missing — the APK must be signed with the committed key or updates break.');
  }

  const current = CONFIG.version;
  const next = bump(current, requested);
  if (next.text === current) fail(`Version is already ${current}.`);

  log(`version ${current} → ${next.text}`);
  log('running typecheck and tests …');
  runNpm(['run', 'typecheck']);
  runNpm(['test']);

  if (dryRun) {
    log(`dry run: would commit, tag v${next.text} and push. Nothing was changed.`);
    return;
  }

  writeVersions(next.text);
  run('git', ['add', 'package.json', 'package-lock.json']);
  run('git', ['commit', '-m', `Release v${next.text}`]);
  run('git', ['tag', `v${next.text}`]);
  log('pushing …');
  run('git', ['push', 'origin', 'main']);
  run('git', ['push', 'origin', `v${next.text}`]);

  await waitForAssets(`v${next.text}`, next.text);
  await verifyPublished(next.text);

  const code = `${next.major * 10000 + next.minor * 100 + next.patch}`;
  log(`released v${next.text} (APK versionCode ${code})`);
  log(`  release: https://github.com/${REPO}/releases/tag/v${next.text}`);
  log('  desktop apps pick it up on the next check; Android apps prompt from Settings or on launch.');
  log('  website: deploy after the release (git deployments are off unless you enabled them).');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
