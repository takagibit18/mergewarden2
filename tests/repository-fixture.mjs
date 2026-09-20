import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const exec = promisify(execFile);
export async function repositoryFixture(t, initial = { 'app.py': 'def ratio(total, count):\n    return total / max(count, 1)\n' }) {
  const parent = resolve(tmpdir()); const directory = await mkdtemp(join(parent, 'mergewarden-engine-'));
  t.after(async () => { assert.ok(resolve(directory).startsWith(parent + sep)); await rm(directory, { recursive: true, force: true }); });
  const repository = join(directory, 'checkout'); const state = join(directory, 'state'); await mkdir(repository); await mkdir(state);
  const git = async (...args) => (await exec('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', repository, ...args], { windowsHide: true })).stdout.trim();
  const write = async (path, text) => { const target = join(repository, path); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, text); };
  const commit = async () => { await git('add', '.'); await git('commit', '-m', 'fixture', '--allow-empty'); return git('rev-parse', 'HEAD'); };
  await git('init'); for (const [path, content] of Object.entries(initial)) await write(path, content); const base = await commit();
  return { directory, repository, state, git, write, commit, base, async change() { await write('app.py', 'def ratio(total, count):\n    return total / count\n'); return commit(); } };
}
