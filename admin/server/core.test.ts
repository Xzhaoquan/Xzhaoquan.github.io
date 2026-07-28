import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
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
  it('rejects a missing project directory with a usable validation error', async () => {
    await expect(ProjectContext.open(path.join(tmpdir(), `hexo-admin-missing-${Date.now()}`))).rejects.toMatchObject({ code: 'INVALID_PROJECT' } satisfies Partial<AppError>);
  });

  it('creates and preserves Front Matter content', async () => {
    const { context } = await fixture();
    const created = await context.createContent('post', { title: 'First post', data: { categories: ['Guide'], custom_field: 'keep-me' }, body: '# Hello' });
    const read = await context.getContent('post', created.path);
    expect(read.data.custom_field).toBe('keep-me');
    expect(read.data.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(read.body).toContain('# Hello');
  });

  it('does not convert legacy Hexo dates to ISO strings when saving', async () => {
    const { context } = await fixture();
    const created = await context.createContent('post', { title: 'Legacy date', data: { date: '2022-09-10 22:04:20' } });
    const saved = await context.saveContent('post', created.path, { data: created.data, body: `${created.body}\nUpdated`, hash: created.hash });
    expect(saved.data.date).toBe('2022-09-10 22:04:20');
  });

  it('keeps only the ten most recent recovery snapshots for a post', async () => {
    const { root, context } = await fixture();
    let post = await context.createContent('post', { title: 'Snapshot limit', body: 'Initial' });
    for (let index = 0; index < 12; index += 1) {
      post = await context.saveContent('post', post.path, { data: post.data, body: `Revision ${index}`, hash: post.hash });
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    const snapshots = await readdir(path.join(root, '.hexo-admin', 'snapshots'));
    expect(snapshots.filter(name => name.endsWith(`-${path.basename(post.path)}`))).toHaveLength(10);
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

  it('updates common config fields while retaining unrelated settings', async () => {
    const { root, context } = await fixture();
    await writeFile(path.join(root, '_config.yml'), 'title: Test\ntheme: pure\ncustom: keep\n', 'utf8');
    await context.saveCommonConfig({ title: 'New title', language: 'zh-CN' });
    const saved = await context.readYaml('_config.yml');
    expect(saved.value).toMatchObject({ title: 'New title', language: 'zh-CN', custom: 'keep' });
  });

  it('lists operation logs and switches only to installed themes', async () => {
    const { root, context } = await fixture();
    await mkdir(path.join(root, 'themes', 'pure'), { recursive: true });
    await writeFile(path.join(root, 'themes', 'pure', '_config.yml'), 'menu: []\n', 'utf8');
    await context.appendLog('test.action', 'succeeded', { object: 'post' });
    await expect(context.listOperationLogs()).resolves.toMatchObject([{ action: 'test.action', result: 'succeeded' }]);
    await expect(context.selectTheme('pure')).resolves.toMatchObject({ current: 'pure', installed: ['pure'] });
    await expect(context.selectTheme('../outside')).rejects.toMatchObject({ code: 'THEME_NOT_FOUND' } satisfies Partial<AppError>);
  });

  it('reports deployment readiness without modifying project files', async () => {
    const { context } = await fixture();
    await context.createContent('post', { title: 'Deploy check' });
    await expect(context.deploymentCheck()).resolves.toMatchObject({ configurationValid: true, frontMatterValid: true, posts: 1, drafts: 0, deploymentConfigured: false });
  });

  it('moves deleted content to the recycle bin and restores it', async () => {
    const { context } = await fixture();
    const created = await context.createContent('post', { title: 'Recover me' });
    const removed = await context.moveToRecycle('post', created.path, true);
    await expect(context.getContent('post', created.path)).rejects.toBeDefined();
    await context.restoreRecycle(removed.ticket);
    expect((await context.getContent('post', created.path)).title).toBe('Recover me');
  });

  it('moves drafts to posts and keeps the Markdown content', async () => {
    const { context } = await fixture();
    const draft = await context.createContent('draft', { title: 'Publish me', body: '# Ready' });
    const post = await context.transitionContent('draft', 'post', draft.path);
    expect(post.kind).toBe('post');
    expect(post.body).toContain('# Ready');
    await expect(context.getContent('draft', draft.path)).rejects.toBeDefined();
  });

  it('lists media from all posts with their owning post metadata', async () => {
    const { context } = await fixture();
    const post = await context.createContent('post', { title: 'Media owner' });
    await context.uploadMedia(post.path, 'diagram.png', Buffer.from('image-bytes'));
    await expect(context.mediaLibrary()).resolves.toMatchObject([{ name: 'diagram.png', postPath: post.path, postTitle: 'Media owner', used: false }]);
  });

  it('copies content and safely renames a page path', async () => {
    const { context } = await fixture();
    const post = await context.createContent('post', { title: 'Original', body: 'Keep body' });
    const copy = await context.copyContent('post', post.path, { title: 'Copy' });
    expect(copy.title).toBe('Copy');
    expect(copy.body).toContain('Keep body');
    const page = await context.createContent('page', { title: 'About' });
    const renamed = await context.renameContent('page', page.path, 'company/about');
    expect(renamed.path).toBe('source/company/about.md');
    await expect(context.renameContent('page', renamed.path, '../outside')).rejects.toMatchObject({ code: 'INVALID_PATH' } satisfies Partial<AppError>);
  });

  it('permanently removes an item from the recycle bin only when requested', async () => {
    const { context } = await fixture();
    const created = await context.createContent('post', { title: 'Discard me' });
    const removed = await context.moveToRecycle('post', created.path, true);
    await context.deleteRecycle(removed.ticket);
    await expect(context.listRecycle()).resolves.toEqual([]);
  });

  it('clears every recycle-bin item when explicitly requested', async () => {
    const { context } = await fixture();
    const first = await context.createContent('post', { title: 'First removed' });
    const second = await context.createContent('post', { title: 'Second removed' });
    await context.moveToRecycle('post', first.path, true);
    await context.moveToRecycle('post', second.path, true);
    await expect(context.clearRecycle()).resolves.toMatchObject({ deleted: 2 });
    await expect(context.listRecycle()).resolves.toEqual([]);
  });

  it('renames and removes taxonomy references without deleting posts', async () => {
    const { context } = await fixture();
    const post = await context.createContent('post', { title: 'Taxonomy', data: { categories: ['Old'], tags: ['legacy'] } });
    await expect(context.updateTaxonomy('categories', 'rename', 'Old', 'New')).resolves.toMatchObject({ affected: 1 });
    await expect(context.updateTaxonomy('tags', 'delete', 'legacy')).resolves.toMatchObject({ affected: 1 });
    const saved = await context.getContent('post', post.path);
    expect(saved.data.categories).toEqual(['New']);
    expect(saved.data.tags).toEqual([]);
  });

  it('stores and deletes media only within the selected post asset directory', async () => {
    const { context } = await fixture();
    const post = await context.createContent('post', { title: 'Assets' });
    await context.uploadMedia(post.path, 'diagram.png', Buffer.from('image-data'));
    await expect(context.mediaFor(post.path)).resolves.toMatchObject([{ name: 'diagram.png' }]);
    await context.deleteMedia(post.path, 'diagram.png');
    await expect(context.mediaFor(post.path)).resolves.toEqual([]);
  });

  it('reads media only from the selected post asset directory', async () => {
    const { context } = await fixture();
    const post = await context.createContent('post', { title: 'Read asset' });
    await context.uploadMedia(post.path, 'image.png', Buffer.from('binary-image'));
    await expect(context.readMedia(post.path, 'image.png')).resolves.toMatchObject({ name: 'image.png', bytes: Buffer.from('binary-image') });
    await expect(context.readMedia(post.path, '../image.png')).rejects.toMatchObject({ code: 'INVALID_MEDIA_PATH' } satisfies Partial<AppError>);
  });

  it('renames media and updates its Markdown reference', async () => {
    const { context } = await fixture();
    let post = await context.createContent('post', { title: 'Rename asset', body: '![Old](old.png)' });
    await context.uploadMedia(post.path, 'old.png', Buffer.from('image'));
    await context.renameMedia(post.path, 'old.png', 'new.png');
    post = await context.getContent('post', post.path);
    expect(post.body).toContain('new.png');
    await expect(context.mediaFor(post.path)).resolves.toMatchObject([{ name: 'new.png', used: true }]);
  });

  it('redacts credential-like log fragments', () => {
    expect(redact('token: abc123 password=secret')).toContain('[REDACTED]');
  });
});
