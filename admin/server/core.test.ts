import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppError, ProjectContext, redact } from './core.js';

const fixtures: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'hexo-admin-'));
  fixtures.push(root);
  await Promise.all([mkdir(path.join(root, 'source', '_posts'), { recursive: true }), mkdir(path.join(root, 'source', '_drafts'), { recursive: true })]);
  await writeFile(path.join(root, '_config.yml'), 'title: Test\ntheme: pure\n', 'utf8');
  await writeFile(path.join(root, 'package.json'), '{"private":true}', 'utf8');
  return { root, context: await ProjectContext.open(root) };
}
afterEach(async () => { await Promise.all(fixtures.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('ProjectContext', () => {
  it('creates and preserves Front Matter content', async () => {
    const { context } = await fixture();
    const created = await context.createContent('post', { title: 'First post', data: { categories: ['Guide'], custom_field: 'keep-me' }, body: '# Hello' });
    const read = await context.getContent('post', created.path);
    expect(read.data.custom_field).toBe('keep-me');
    expect(read.body).toContain('# Hello');
  });

  it('rejects traversal beyond the project root', async () => {
    const { context } = await fixture();
    await expect(context.resolve('../outside.md')).rejects.toMatchObject({ code: 'PATH_FORBIDDEN' } satisfies Partial<AppError>);
  });

  it('does not allow a post API to modify project configuration files', async () => {
    const { context } = await fixture();
    await expect(context.saveContent('post', '_config.yml', { data: {}, body: '' })).rejects.toMatchObject({ code: 'CONTENT_KIND_MISMATCH' } satisfies Partial<AppError>);
  });

  it('backs up valid YAML and preserves invalid source YAML', async () => {
    const { root, context } = await fixture();
    await expect(context.saveYaml('_config.yml', 'title: [')).rejects.toMatchObject({ code: 'INVALID_YAML' } satisfies Partial<AppError>);
    expect(await readFile(path.join(root, '_config.yml'), 'utf8')).toContain('title: Test');
    await context.saveYaml('_config.yml', 'title: Updated\n');
    expect(await readFile(path.join(root, '_config.yml'), 'utf8')).toContain('Updated');
  });

  it('moves deleted content to the recycle bin and restores it', async () => {
    const { context } = await fixture();
    const created = await context.createContent('post', { title: 'Recover me' });
    const removed = await context.moveToRecycle('post', created.path, true);
    await expect(context.getContent('post', created.path)).rejects.toBeDefined();
    await context.restoreRecycle(removed.ticket);
    expect((await context.getContent('post', created.path)).title).toBe('Recover me');
  });

  it('redacts credential-like log fragments', () => {
    expect(redact('token: abc123 password=secret')).toContain('[REDACTED]');
  });
});
