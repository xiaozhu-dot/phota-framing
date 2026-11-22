// Run: node --test eval/stage0/registry_test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage0-registry-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('stage0-registry-'));
    await rm(root, { recursive: true, force: true });
  });
  const put = async (p, value) => {
    await mkdir(join(root, p, '..'), { recursive: true });
    await writeFile(join(root, p), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const get = async p => JSON.parse(await readFile(join(root, p), 'utf8'));
  const cases = ['dev', 'holdout'].map((split, i) => ({ id: `n${i}`, split, group: `group${i}`, person: `person${i}`, source: `https://source/${i}`, file: `photos/${i}.jpg` }));
  const sources = cases.map((c, i) => ({ url: c.source, author: `author${i}`, group: `author-group${i}` }));
  await put('docs/evaluations/phota-scoring-v2.md', 'rules');
  await put('docs/superpowers/plans/2026-10-24-phota-training-roadmap.md', 'roadmap');
  await put('eval/stage0/consistency.mjs', 'checker');
  await put('eval/portrait-novice-cases.json', cases);
  await put('eval/portrait-novice-sources.json', { sources });
  await put('eval/portrait-cases.json', []);
  await put('eval/portrait-sources.json', { sources: [] });
  await mkdir(join(root, 'eval/results'), { recursive: true });
  await copyFile(new URL('./registry.mjs', import.meta.url), join(root, 'eval/stage0/registry.mjs'));
  const run = (...args) => spawnSync(process.execPath, [join(root, 'eval/stage0/registry.mjs'), ...args], { encoding: 'utf8' });
  return { put, get, run, cases, sources };
}

test('登记从原帖元数据写入作者及作者组', async t => {
  const f = await fixture(t);
  assert.equal(f.run().status, 0);
  const registry = await f.get('eval/stage0/registry.json');
  assert.equal(registry.cases[0].author, 'author0');
  assert.equal(registry.cases[0].authorGroup, 'author-group0');
});

for (const field of ['author', 'authorGroup', 'group', 'person', 'source', 'file', 'legacySplit']) {
  test(`verify 拒绝冻结身份字段被篡改：${field}`, async t => {
    const f = await fixture(t);
    assert.equal(f.run().status, 0);
    const registry = await f.get('eval/stage0/registry.json');
    registry.cases[0][field] = 'tampered';
    await f.put('eval/stage0/registry.json', registry);
    assert.equal(f.run('--verify').status, 1);
  });
}

for (const mode of ['added-case', 'removed-case', 'duplicate-case', 'tier-index', 'extra-tier', 'hash-file', 'hash-value']) {
  test(`verify 拒绝登记集合、索引或哈希变更：${mode}`, async t => {
    const f = await fixture(t);
    assert.equal(f.run().status, 0);
    const registry = await f.get('eval/stage0/registry.json');
    if (mode === 'added-case') { f.cases.push({ ...f.cases[0], id: 'new' }); await f.put('eval/portrait-novice-cases.json', f.cases); }
    if (mode === 'removed-case') registry.cases.pop();
    if (mode === 'duplicate-case') registry.cases.push({ ...registry.cases[0] });
    if (mode === 'tier-index') registry.tiers.sealed.push('n0');
    if (mode === 'extra-tier') registry.tiers.extra = [];
    if (mode === 'hash-file') registry.hashes.rules.file = 'wrong.md';
    if (mode === 'hash-value') registry.hashes.checker.sha256 = 'wrong';
    await f.put('eval/stage0/registry.json', registry);
    assert.equal(f.run('--verify').status, 1);
  });
}

for (const field of ['author', 'authorGroup', 'group', 'person', 'source']) {
  test(`登记拒绝跨层共享身份：${field}`, async t => {
    const f = await fixture(t);
    if (field === 'author' || field === 'authorGroup') {
      const key = field === 'author' ? 'author' : 'group';
      f.sources[1][key] = f.sources[0][key];
      await f.put('eval/portrait-novice-sources.json', { sources: f.sources });
    } else {
      f.cases[1][field] = f.cases[0][field];
      await f.put('eval/portrait-novice-cases.json', f.cases);
    }
    assert.equal(f.run().status, 1);
    await assert.rejects(f.get('eval/stage0/registry.json'), { code: 'ENOENT' });
  });
}

test('追加运行曝光不改变冻结身份且 verify 不重写登记', async t => {
  const f = await fixture(t);
  assert.equal(f.run().status, 0);
  const before = await f.get('eval/stage0/registry.json');
  await f.put('eval/results/portrait-novice-v99-candidate-dev.json', [{ case: 'n0' }]);
  assert.equal(f.run('--verify').status, 0);
  assert.deepEqual(await f.get('eval/stage0/registry.json'), before);
});

test('现有语料 legacy 分层保持 dev3 regression6 reference29 sealed0', async t => {
  const f = await fixture(t);
  for (const prefix of ['portrait-novice', 'portrait']) for (const kind of ['cases', 'sources']) {
    const name = `${prefix}-${kind}.json`;
    await f.put(`eval/${name}`, JSON.parse(await readFile(new URL(`../${name}`, import.meta.url))));
  }
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const registry = await f.get('eval/stage0/registry.json');
  assert.deepEqual(Object.fromEntries(Object.entries(registry.tiers).map(([k, ids]) => [k, ids.length])), { dev: 3, regression: 6, sealed: 0, reference: 29 });
  assert.ok(registry.cases.every(c => c.author && c.authorGroup));
  assert.equal(f.run('--verify').status, 0);
});
