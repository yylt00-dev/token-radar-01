// Token Launch Radar (token-radar-01 entry): reads the sealed snapshot, ranks the
// pre-token protocols by implied value with lib/model.ts, and hands in the board, the
// dashboard's data, the dashboard itself, the screenshots and the dossier.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
//
// Node 22, standard library only. Deterministic: the same snapshot writes the same
// bytes on every run (no clock, no randomness, no network).

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1] !== undefined) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const snapshotFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  process.stderr.write(`radar: no snapshot at ${snapshotFile}\n`);
  process.exit(2);
}
const outDir = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`radar: refusing to hand in a board the gate rejects: ${issue}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

function copyTree(from: string, to: string): string[] {
  const copied: string[] = [];
  if (!existsSync(from)) return copied;
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyTree(join(root, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyTree(join(root, 'screenshots'), join(outDir, 'screenshots'));
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
if (shots.length < 3 || shots.length > 4) {
  process.stderr.write(`radar: screenshots/ holds ${shots.length} images; the gate wants 3 or 4\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!NAME.test(name)) {
    process.stderr.write(`radar: bad screenshot name ${name}\n`);
    process.exit(1);
  }
}

// Written last, from the finished output, byte for byte as the scorer rebuilds it.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${board.length} rows; ` +
    `top: ${board[0]!.name} at $${board[0]!.implied_value_usd.toLocaleString('en-US')} implied\n`,
);
