import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import sharp from 'sharp';
import type { ContentDocument, ContentKind, TaskRecord } from './types.js';

const META_DIR = '.hexo-admin';
const CONTENT_DIRS: Record<ContentKind, string> = { post: 'source/_posts', draft: 'source/_drafts', page: 'source' };
const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules', 'public', '.deploy_git', META_DIR, 'admin']);
const SECRET_PATTERN = /(token|secret|password|private[_-]?key|access[_-]?key)\s*[:=]\s*([^\s,]+)/gi;
const COMMON_CONFIG_FIELDS = ['title', 'subtitle', 'description', 'author', 'language', 'timezone', 'url', 'root', 'permalink', 'per_page'] as const;
const frontMatterOptions = {
  engines: {
    yaml: {
      parse: (source: string): object => (YAML.parse(source) ?? {}) as object,
      stringify: (value: object) => YAML.stringify(value)
    }
  }
};

function hexoDate(value = new Date()) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function scheduledDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly changed = false, public readonly recovery?: string) { super(message); }
}

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const redact = (value: string) => value.replace(SECRET_PATTERN, '$1: [REDACTED]');

async function exists(target: string) { try { await fs.access(target); return true; } catch { return false; } }
async function ensureDirectory(target: string) { await fs.mkdir(target, { recursive: true }); }

export class ProjectContext {
  readonly root: string;
  readonly metaRoot: string;
  readonly tasks = new Map<string, TaskRecord>();
  preview?: { process: ChildProcess; port: number; taskId: string };

  private constructor(root: string) { this.root = root; this.metaRoot = path.join(root, META_DIR); }

  static async open(candidate: string) {
    let root: string;
    try { root = await fs.realpath(candidate); }
    catch { throw new AppError('INVALID_PROJECT', 'The selected directory does not exist or cannot be accessed.', false, 'Select an existing directory containing _config.yml and package.json.'); }
    if (!await exists(path.join(root, '_config.yml')) || !await exists(path.join(root, 'package.json'))) throw new AppError('INVALID_PROJECT', 'The selected directory is not a valid Hexo project.', false, 'Select a directory containing _config.yml and package.json.');
    const context = new ProjectContext(root);
    await Promise.all(['recycle-bin', 'backups', 'snapshots', 'logs', 'ssh'].map(name => ensureDirectory(path.join(context.metaRoot, name))));
    return context;
  }

  async resolve(relativePath: string, allowMeta = false) {
    if (!relativePath || path.isAbsolute(relativePath)) throw new AppError('INVALID_PATH', 'Paths must be relative to the Hexo project.');
    const normalized = path.normalize(relativePath).replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (parts.includes('..') || parts.some(part => BLOCKED_SEGMENTS.has(part) && !(allowMeta && part === META_DIR))) throw new AppError('PATH_FORBIDDEN', 'This path cannot be accessed by the admin.');
    const full = path.resolve(this.root, normalized);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) throw new AppError('PATH_FORBIDDEN', 'The path is outside the Hexo project.');
    let existing = full;
    while (!await exists(existing)) {
      const parent = path.dirname(existing);
      if (parent === existing) throw new AppError('PATH_FORBIDDEN', 'The path cannot be resolved safely.');
      existing = parent;
    }
    const real = await fs.realpath(existing);
    if (!real.startsWith(this.root + path.sep) && real !== this.root) throw new AppError('PATH_FORBIDDEN', 'The path resolves outside the Hexo project.');
    return full;
  }

  private assertContentPath(kind: ContentKind, full: string) {
    const expectedBase = path.resolve(this.root, CONTENT_DIRS[kind]);
    if (!full.startsWith(expectedBase + path.sep) && full !== expectedBase) throw new AppError('CONTENT_KIND_MISMATCH', 'The file does not belong to this content type.');
    if (kind === 'page') {
      const relative = path.relative(expectedBase, full).replace(/\\/g, '/');
      if (relative.startsWith('_posts/') || relative.startsWith('_drafts/')) throw new AppError('CONTENT_KIND_MISMATCH', 'Posts and drafts cannot be edited through the pages API.');
    }
  }

  private assertArticlePath(full: string) {
    const postBase = path.resolve(this.root, CONTENT_DIRS.post);
    const draftBase = path.resolve(this.root, CONTENT_DIRS.draft);
    if ((!full.startsWith(postBase + path.sep) && full !== postBase) && (!full.startsWith(draftBase + path.sep) && full !== draftBase)) throw new AppError('CONTENT_KIND_MISMATCH', 'The file does not belong to a post or draft.');
  }

  async writeAtomic(target: string, content: string) {
    await ensureDirectory(path.dirname(target));
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, content, 'utf8');
    await fs.rename(temporary, target);
  }

  async appendLog(action: string, result: 'succeeded' | 'failed', detail: Record<string, unknown>) {
    const entry = JSON.stringify({ at: new Date().toISOString(), action, result, detail: JSON.parse(redact(JSON.stringify(detail))) });
    await fs.appendFile(path.join(this.metaRoot, 'logs', 'operations.jsonl'), `${entry}\n`, 'utf8');
  }

  async listOperationLogs(limit = 100) {
    const file = path.join(this.metaRoot, 'logs', 'operations.jsonl');
    if (!await exists(file)) return [];
    const raw = await fs.readFile(file, 'utf8');
    return raw.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).slice(-limit).reverse();
  }

  async readYaml(relativePath: string) {
    const full = await this.resolve(relativePath);
    const raw = await fs.readFile(full, 'utf8');
    try { return { raw, value: YAML.parse(raw) ?? {} }; } catch { throw new AppError('INVALID_YAML', 'YAML is invalid; the original file was not changed.', false, 'Fix the YAML syntax and save again.'); }
  }

  async saveYaml(relativePath: string, raw: string) {
    try { YAML.parse(raw); } catch { throw new AppError('INVALID_YAML', 'YAML is invalid; the original file was not changed.', false, 'Fix the YAML syntax and save again.'); }
    const target = await this.resolve(relativePath);
    const backup = path.join(this.metaRoot, 'backups', `${path.basename(relativePath)}-${Date.now()}.yml`);
    await fs.copyFile(target, backup);
    await this.writeAtomic(target, raw);
    await this.appendLog('config.save', 'succeeded', { path: relativePath, backup: path.relative(this.root, backup) });
  }

  async commonConfig() {
    const config = await this.readYaml('_config.yml');
    return Object.fromEntries(COMMON_CONFIG_FIELDS.map(field => [field, String((config.value as Record<string, unknown>)[field] ?? '')]));
  }

  async saveCommonConfig(values: Partial<Record<(typeof COMMON_CONFIG_FIELDS)[number], string>>) {
    const config = await this.readYaml('_config.yml');
    const next = { ...(config.value as Record<string, unknown>) };
    for (const field of COMMON_CONFIG_FIELDS) if (values[field] !== undefined) next[field] = values[field];
    await this.saveYaml('_config.yml', YAML.stringify(next));
    return this.readYaml('_config.yml');
  }

  async themes() {
    const directory = path.join(this.root, 'themes');
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const config = await this.readYaml('_config.yml');
    return { current: String((config.value as Record<string, unknown>).theme ?? ''), installed: entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort() };
  }

  async selectTheme(theme: string) {
    const name = path.basename(theme);
    if (!name || name !== theme || !await exists(path.join(this.root, 'themes', name))) throw new AppError('THEME_NOT_FOUND', 'The selected theme is not installed in this project.');
    const config = await this.readYaml('_config.yml');
    await this.saveYaml('_config.yml', YAML.stringify({ ...(config.value as Record<string, unknown>), theme: name }));
    await this.appendLog('theme.select', 'succeeded', { theme: name });
    return this.themes();
  }

  async themeProfile() {
    const themes = await this.themes();
    const config = await this.readYaml(`themes/${themes.current}/_config.yml`);
    const profile = ((config.value as Record<string, unknown>).profile ?? {}) as Record<string, unknown>;
    return {
      enabled: profile.enabled === undefined ? true : Boolean(profile.enabled),
      articleSelfBlock: Boolean(profile.articleSelfBlock),
      avatar: String(profile.avatar ?? ''),
      gravatar: String(profile.gravatar ?? ''),
      author: String(profile.author ?? ''),
      author_title: String(profile.author_title ?? ''),
      author_description: String(profile.author_description ?? ''),
      location: String(profile.location ?? '')
    };
  }

  async saveThemeProfile(values: { enabled: boolean; articleSelfBlock: boolean; avatar: string; gravatar: string; author: string; author_title: string; author_description: string; location: string }) {
    const themes = await this.themes();
    const relative = `themes/${themes.current}/_config.yml`;
    const config = await this.readYaml(relative);
    const current = (config.value as Record<string, unknown>).profile;
    const profile = { ...(current && typeof current === 'object' ? current as Record<string, unknown> : {}), ...values };
    await this.saveYaml(relative, YAML.stringify({ ...(config.value as Record<string, unknown>), profile }));
    await this.appendLog('theme.profile.save', 'succeeded', { theme: themes.current });
    return this.themeProfile();
  }

  async walk(directory: string): Promise<string[]> {
    if (!await exists(directory)) return [];
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return this.walk(full);
      return entry.isFile() && /\.md$/i.test(entry.name) ? [full] : [];
    }));
    return nested.flat();
  }

  private async parseDocument(kind: ContentKind, fullPath: string): Promise<ContentDocument> {
    const raw = await fs.readFile(fullPath, 'utf8');
    let parsed: ReturnType<typeof matter>;
    try { parsed = matter(raw, frontMatterOptions); } catch { throw new AppError('INVALID_FRONT_MATTER', `Cannot parse Front Matter in ${path.basename(fullPath)}.`, false, 'Fix the YAML Front Matter and try again.'); }
    const stat = await fs.stat(fullPath);
    const relative = path.relative(this.root, fullPath).replace(/\\/g, '/');
    return { id: digest(relative), kind, path: relative, title: String(parsed.data.title ?? path.basename(fullPath, '.md')), data: parsed.data as Record<string, unknown>, body: parsed.content, mtimeMs: stat.mtimeMs, hash: digest(raw), createdAt: typeof parsed.data.date === 'string' ? parsed.data.date : undefined, updatedAt: typeof parsed.data.updated === 'string' ? parsed.data.updated : undefined };
  }

  async listContent(kind: ContentKind) {
    const base = path.join(this.root, CONTENT_DIRS[kind]);
    const files = await this.walk(base);
    const filtered = kind === 'page' ? files.filter(file => !file.includes(`${path.sep}_posts${path.sep}`) && !file.includes(`${path.sep}_drafts${path.sep}`)) : files;
    const documents = await Promise.all(filtered.map(file => this.parseDocument(kind, file)));
    return documents.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  async getContent(kind: ContentKind, relativePath: string) {
    const full = await this.resolve(relativePath);
    this.assertContentPath(kind, full);
    return this.parseDocument(kind, full);
  }

  private filename(value: string) {
    const clean = value.trim().replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
    if (!clean) throw new AppError('INVALID_FILENAME', 'A filename is required and cannot include reserved characters.');
    return clean.endsWith('.md') ? clean : `${clean}.md`;
  }

  async createContent(kind: ContentKind, input: { title: string; filename?: string; data?: Record<string, unknown>; body?: string }) {
    const file = this.filename(input.filename || input.title);
    const base = path.join(this.root, CONTENT_DIRS[kind]);
    const target = path.join(base, file);
    if (await exists(target)) throw new AppError('ALREADY_EXISTS', 'Content with the same filename already exists.');
    const data = { title: input.title, ...(kind !== 'page' ? { date: hexoDate() } : {}), ...(input.data ?? {}) };
    await this.writeAtomic(target, matter.stringify(input.body ?? '', data, frontMatterOptions));
    await this.appendLog('content.create', 'succeeded', { kind, path: path.relative(this.root, target) });
    return this.parseDocument(kind, target);
  }

  private async pruneSnapshots(filename: string, keep = 10) {
    const directory = path.join(this.metaRoot, 'snapshots');
    const suffix = `-${filename}`;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const obsolete = entries
      .filter(entry => entry.isFile() && entry.name.endsWith(suffix))
      .map(entry => entry.name)
      // Snapshot names start with a millisecond timestamp, so descending name
      // order is also newest-first and works consistently on every platform.
      .sort((left, right) => right.localeCompare(left))
      .slice(keep);
    await Promise.all(obsolete.map(name => fs.rm(path.join(directory, name), { force: true })));
  }

  async saveContent(kind: ContentKind, relativePath: string, input: { data: Record<string, unknown>; body: string; hash?: string }) {
    const full = await this.resolve(relativePath);
    this.assertContentPath(kind, full);
    const current = await fs.readFile(full, 'utf8');
    if (input.hash && input.hash !== digest(current)) throw new AppError('EXTERNAL_MODIFICATION', 'The file changed outside the admin, so saving was cancelled.', false, 'Reload the content and merge your changes.');
    const snapshot = path.join(this.metaRoot, 'snapshots', `${Date.now()}-${path.basename(full)}`);
    await fs.writeFile(snapshot, current, 'utf8');
    await this.pruneSnapshots(path.basename(full));
    await this.writeAtomic(full, matter.stringify(input.body, input.data, frontMatterOptions));
    await this.appendLog('content.save', 'succeeded', { kind, path: relativePath, snapshot: path.relative(this.root, snapshot) });
    return this.parseDocument(kind, full);
  }

  async moveToRecycle(kind: ContentKind, relativePath: string, includeAssets: boolean) {
    const full = await this.resolve(relativePath);
    this.assertContentPath(kind, full);
    const ticket = `${Date.now()}-${randomUUID()}`;
    const destination = path.join(this.metaRoot, 'recycle-bin', ticket);
    await ensureDirectory(destination);
    const items: string[] = [];
    const move = async (source: string) => { if (await exists(source)) { const target = path.join(destination, path.basename(source)); await fs.rename(source, target); items.push(path.basename(source)); } };
    await move(full);
    if (includeAssets && kind === 'post') await move(path.join(path.dirname(full), path.basename(full, '.md')));
    await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ ticket, kind, originalPath: relativePath, deletedAt: new Date().toISOString(), items }, null, 2), 'utf8');
    await this.appendLog('content.recycle', 'succeeded', { kind, path: relativePath, ticket });
    return { ticket, items };
  }

  async restoreRecycle(ticket: string) {
    const recycle = path.join(this.metaRoot, 'recycle-bin', ticket);
    const manifest = JSON.parse(await fs.readFile(path.join(recycle, 'manifest.json'), 'utf8')) as { originalPath: string; items: string[] };
    const original = await this.resolve(manifest.originalPath);
    if (await exists(original)) throw new AppError('RESTORE_CONFLICT', 'The original path already contains a file, so it cannot be restored automatically.');
    await ensureDirectory(path.dirname(original));
    const main = path.join(recycle, path.basename(original));
    await fs.rename(main, original);
    await this.appendLog('content.restore', 'succeeded', { ticket, path: manifest.originalPath });
    return manifest;
  }

  async deleteRecycle(ticket: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(ticket)) throw new AppError('INVALID_RECYCLE_TICKET', 'The recycle-bin record is invalid.');
    const recycle = path.join(this.metaRoot, 'recycle-bin', ticket);
    if (!await exists(recycle)) throw new AppError('RECYCLE_NOT_FOUND', 'The recycle-bin record no longer exists.');
    await fs.rm(recycle, { recursive: true, force: true });
    await this.appendLog('content.recycle.delete', 'succeeded', { ticket });
  }

  async clearRecycle() {
    const base = path.join(this.metaRoot, 'recycle-bin');
    const entries = await fs.readdir(base, { withFileTypes: true });
    const tickets = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    await Promise.all(tickets.map(ticket => fs.rm(path.join(base, ticket), { recursive: true, force: true })));
    await this.appendLog('content.recycle.clear', 'succeeded', { count: tickets.length });
    return { deleted: tickets.length };
  }

  async transitionContent(from: Extract<ContentKind, 'post' | 'draft'>, to: Extract<ContentKind, 'post' | 'draft'>, relativePath: string) {
    if (from === to) throw new AppError('INVALID_CONTENT_TRANSITION', 'The source and destination content types are the same.');
    const full = await this.resolve(relativePath);
    this.assertContentPath(from, full);
    const fromBase = path.resolve(this.root, CONTENT_DIRS[from]);
    const relative = path.relative(fromBase, full);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new AppError('CONTENT_KIND_MISMATCH', 'The file does not belong to this content type.');
    const destination = path.join(this.root, CONTENT_DIRS[to], relative);
    const sourceAssets = path.join(path.dirname(full), path.basename(full, '.md'));
    const destinationAssets = path.join(path.dirname(destination), path.basename(destination, '.md'));
    if (await exists(destination) || await exists(destinationAssets)) throw new AppError('CONTENT_EXISTS', 'A post or its asset directory already exists at the destination.');
    await ensureDirectory(path.dirname(destination));
    await fs.rename(full, destination);
    if (await exists(sourceAssets)) await fs.rename(sourceAssets, destinationAssets);
    const outputPath = path.relative(this.root, destination).replace(/\\/g, '/');
    await this.appendLog('content.transition', 'succeeded', { from, to, fromPath: relativePath, path: outputPath });
    return this.parseDocument(to, destination);
  }

  async scheduleDraft(relativePath: string, publishAt?: string) {
    const draft = await this.getContent('draft', relativePath);
    const data = { ...draft.data };
    if (publishAt) {
      if (!scheduledDate(publishAt)) throw new AppError('INVALID_SCHEDULE', 'The scheduled publication time is invalid.');
      data.publish_at = publishAt;
      data.published = false;
    } else delete data.publish_at;
    const saved = await this.saveContent('draft', relativePath, { data, body: draft.body, hash: draft.hash });
    await this.appendLog('content.schedule', 'succeeded', { path: relativePath, publishAt: publishAt ?? null });
    return saved;
  }

  async scheduledDrafts() {
    return (await this.listContent('draft')).filter(draft => scheduledDate(draft.data.publish_at)).map(draft => ({ path: draft.path, title: draft.title, publishAt: String(draft.data.publish_at) })).sort((left, right) => left.publishAt.localeCompare(right.publishAt));
  }

  async publishDueDrafts(now = new Date()) {
    const due = (await this.listContent('draft')).filter(draft => { const date = scheduledDate(draft.data.publish_at); return date && date <= now; });
    const published: string[] = []; const failed: Array<{ path: string; message: string }> = [];
    for (const draft of due) try {
      const publishAt = String(draft.data.publish_at);
      const post = await this.transitionContent('draft', 'post', draft.path);
      const data: Record<string, unknown> = { ...post.data, date: publishAt, published: true }; delete data.publish_at;
      await this.saveContent('post', post.path, { data, body: post.body, hash: post.hash });
      published.push(post.path);
      await this.appendLog('content.schedule.publish', 'succeeded', { from: draft.path, path: post.path, publishAt });
    } catch (error) { failed.push({ path: draft.path, message: error instanceof Error ? error.message : String(error) }); }
    return { checkedAt: now.toISOString(), published, failed };
  }

  private seoSummaryText(document: ContentDocument) {
    const paragraphs = document.body.replace(/```[\s\S]*?```/g, ' ').split(/\n\s*\n/).map(part => part.trim()).filter(part => part && !/^#{1,6}\s/.test(part) && !/^[-=]{3,}$/.test(part) && !/^>/.test(part));
    return [document.title, ...paragraphs].map(part => part.replace(/!\[[^\]]*\]\([^)]*\)|`[^`]*`|[*_~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, 160).trim();
  }

  private seoDocument(document: ContentDocument) {
    const issues: Array<{ rule: string; level: 'warning' | 'suggestion'; message: string; suggestion: string; autoFixable?: boolean }> = [];
    const values = (field: string) => Array.isArray(document.data[field]) ? document.data[field] : document.data[field] ? [document.data[field]] : [];
    if (!document.title.trim()) issues.push({ rule: 'title', level: 'warning', message: 'Missing title.', suggestion: 'Add a concise article title.' });
    const description = String(document.data.description ?? document.data.excerpt ?? '').trim();
    if (description.length < 50) issues.push({ rule: 'description', level: 'warning', message: 'Description or excerpt is missing or too short.', suggestion: 'Add a 50–160 character summary.', autoFixable: this.seoSummaryText(document).length >= 50 });
    if (!values('categories').length) issues.push({ rule: 'categories', level: 'suggestion', message: 'No category assigned.', suggestion: 'Assign a relevant category.' });
    if (!values('tags').length) issues.push({ rule: 'tags', level: 'suggestion', message: 'No tags assigned.', suggestion: 'Add one or more precise tags.' });
    if (!String(document.data.cover ?? '').trim()) issues.push({ rule: 'cover', level: 'suggestion', message: 'No cover image set.', suggestion: 'Add a cover image for social sharing.' });
    if (document.body.trim().length < 300) issues.push({ rule: 'length', level: 'suggestion', message: 'Article body is short.', suggestion: 'Add more useful explanatory content.' });
    const headings = [...document.body.matchAll(/^(#{1,6})\s+/gm)].map(match => match[1].length);
    if (headings.some((level, index) => index > 0 && level > headings[index - 1] + 1)) issues.push({ rule: 'headings', level: 'suggestion', message: 'Heading levels skip hierarchy.', suggestion: 'Use headings in order without skipping levels.' });
    if (/!\[\s*\]\([^)]*\)/.test(document.body)) issues.push({ rule: 'image-alt', level: 'warning', message: 'An image has empty alternative text.', suggestion: 'Describe each informative image.', autoFixable: true });
    if (/\]\(\s*\)/.test(document.body)) issues.push({ rule: 'links', level: 'warning', message: 'An empty Markdown link was found.', suggestion: 'Add a valid destination or remove the link.' });
    if (document.kind !== 'page' && !String(document.data.date ?? '').trim()) issues.push({ rule: 'date', level: 'warning', message: 'Publication date is missing.', suggestion: 'Set a publication date.', autoFixable: true });
    return { path: document.path, title: document.title, kind: document.kind, issues };
  }

  async seo(kind?: Extract<ContentKind, 'post' | 'draft'>) {
    const documents = kind ? await this.listContent(kind) : [...await this.listContent('post'), ...await this.listContent('draft')];
    const articles = documents.map(document => this.seoDocument(document));
    const warnings = articles.reduce((total, article) => total + article.issues.filter(issue => issue.level === 'warning').length, 0);
    const suggestions = articles.reduce((total, article) => total + article.issues.filter(issue => issue.level === 'suggestion').length, 0);
    return { warnings, suggestions, articles };
  }

  async seoArticle(kind: Extract<ContentKind, 'post' | 'draft'>, relativePath: string) {
    return this.seoDocument(await this.getContent(kind, relativePath));
  }

  async fixSeoArticle(kind: Extract<ContentKind, 'post' | 'draft'>, relativePath: string, action: 'summary' | 'date' | 'image-alt' | 'all') {
    const document = await this.getContent(kind, relativePath);
    const data = { ...document.data };
    let body = document.body;
    const applied: Array<'summary' | 'date' | 'image-alt'> = [];
    const description = String(data.description ?? data.excerpt ?? '').trim();
    if (action === 'summary' || (action === 'all' && description.length < 50)) {
      // The previous implementation used only the first paragraph, which
      // often produced a too-short excerpt and left the same SEO warning in
      // place. Combine readable prose (including the title) up to 160 chars.
      const text = this.seoSummaryText(document);
      if (!text && action === 'summary') throw new AppError('SEO_FIX_UNAVAILABLE', 'A summary cannot be generated from an empty article.');
      // Pure renders post.excerpt as HTML on index pages. Store one escaped
      // paragraph so an admin-generated summary stays readable there while
      // preserving the article's Markdown source unchanged.
      if (text) {
        const escaped = text.slice(0, 160).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        data.excerpt = `<p>${escaped}</p>`;
        applied.push('summary');
      }
    }
    if (action === 'date' || (action === 'all' && !String(data.date ?? '').trim())) {
      data.date = String(data.date ?? '').trim() || hexoDate();
      applied.push('date');
    }
    if (action === 'image-alt' || action === 'all') {
      let changed = 0;
      body = body.replace(/!\[\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, source: string) => {
        changed += 1;
        const name = path.basename(source.split(/[?#]/, 1)[0]).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        return `![${name || 'image'}](${source})`;
      });
      if (!changed && action === 'image-alt') throw new AppError('SEO_FIX_UNAVAILABLE', 'No image without alternative text was found.');
      if (changed) applied.push('image-alt');
    }
    if (!applied.length) throw new AppError('SEO_FIX_UNAVAILABLE', 'No automatically fixable SEO issues were found.');
    const saved = await this.saveContent(kind, relativePath, { data, body, hash: document.hash });
    await this.appendLog('seo.fix', 'succeeded', { kind, path: relativePath, action, applied });
    return { document: saved, article: this.seoDocument(saved), action, applied };
  }

  async fixAllSeo() {
    const documents = [...await this.listContent('post'), ...await this.listContent('draft')];
    const fixed: Array<{ kind: Extract<ContentKind, 'post' | 'draft'>; path: string; applied: Array<'summary' | 'date' | 'image-alt'> }> = [];
    const failed: Array<{ kind: Extract<ContentKind, 'post' | 'draft'>; path: string; message: string }> = [];
    for (const document of documents) {
      const issues = this.seoDocument(document).issues;
      if (!issues.some(issue => Boolean(issue.autoFixable) && ['description', 'date', 'image-alt'].includes(issue.rule))) continue;
      try {
        const result = await this.fixSeoArticle(document.kind as Extract<ContentKind, 'post' | 'draft'>, document.path, 'all');
        fixed.push({ kind: document.kind as Extract<ContentKind, 'post' | 'draft'>, path: document.path, applied: result.applied });
      } catch (error) {
        failed.push({ kind: document.kind as Extract<ContentKind, 'post' | 'draft'>, path: document.path, message: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    await this.appendLog('seo.fix-all', failed.length ? 'failed' : 'succeeded', { fixed: fixed.length, failed: failed.length });
    return { fixed, failed };
  }

  async copyContent(kind: ContentKind, relativePath: string, input: { title: string; filename?: string }) {
    const source = await this.getContent(kind, relativePath);
    const data: Record<string, unknown> = { ...source.data, title: input.title };
    delete data.date; delete data.updated;
    const copy = await this.createContent(kind, { title: input.title, filename: input.filename, data, body: source.body });
    await this.appendLog('content.copy', 'succeeded', { kind, from: relativePath, path: copy.path });
    return copy;
  }

  async renameContent(kind: ContentKind, relativePath: string, targetRelativePath: string) {
    const source = await this.resolve(relativePath);
    this.assertContentPath(kind, source);
    const normalized = path.normalize(targetRelativePath).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.split('/').includes('..') || path.isAbsolute(normalized)) throw new AppError('INVALID_PATH', 'The new path must remain inside the content directory.');
    const filename = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
    const target = path.resolve(this.root, CONTENT_DIRS[kind], filename);
    this.assertContentPath(kind, target);
    if (await exists(target)) throw new AppError('ALREADY_EXISTS', 'Content already exists at the selected path.');
    const sourceAssets = path.join(path.dirname(source), path.basename(source, '.md'));
    const targetAssets = path.join(path.dirname(target), path.basename(target, '.md'));
    if (await exists(targetAssets)) throw new AppError('ALREADY_EXISTS', 'An asset directory already exists at the selected path.');
    await ensureDirectory(path.dirname(target));
    await fs.rename(source, target);
    if (await exists(sourceAssets)) await fs.rename(sourceAssets, targetAssets);
    const outputPath = path.relative(this.root, target).replace(/\\/g, '/');
    await this.appendLog('content.rename', 'succeeded', { kind, from: relativePath, path: outputPath });
    return this.parseDocument(kind, target);
  }

  async listRecycle() {
    const base = path.join(this.metaRoot, 'recycle-bin');
    const entries = await fs.readdir(base, { withFileTypes: true });
    return Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => JSON.parse(await fs.readFile(path.join(base, entry.name, 'manifest.json'), 'utf8'))));
  }

  async taxonomy() {
    const posts = [...await this.listContent('post'), ...await this.listContent('draft')];
    const aggregate = (field: 'categories' | 'tags') => {
      const counts = new Map<string, number>();
      posts.forEach(post => { const value = post.data[field]; const values = Array.isArray(value) ? value : value ? [value] : []; values.map(String).filter(Boolean).forEach(name => counts.set(name, (counts.get(name) ?? 0) + 1)); });
      return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    };
    return { categories: aggregate('categories'), tags: aggregate('tags') };
  }

  async updateTaxonomy(field: 'categories' | 'tags', action: 'rename' | 'delete', name: string, replacement?: string) {
    const source = name.trim();
    const target = replacement?.trim();
    if (!source) throw new AppError('INVALID_TAXONOMY', 'A category or tag name is required.');
    if (action === 'rename' && (!target || target === source)) throw new AppError('INVALID_TAXONOMY', 'Enter a different replacement name.');
    const documents = [...await this.listContent('post'), ...await this.listContent('draft')];
    let affected = 0;
    for (const document of documents) {
      const current = Array.isArray(document.data[field]) ? document.data[field].map(String) : document.data[field] ? [String(document.data[field])] : [];
      if (!current.includes(source)) continue;
      const next = action === 'rename' ? [...new Set(current.map(value => value === source ? target! : value))] : current.filter(value => value !== source);
      await this.saveContent(document.kind, document.path, { data: { ...document.data, [field]: next }, body: document.body, hash: document.hash });
      affected += 1;
    }
    await this.appendLog('taxonomy.update', 'succeeded', { field, action, name: source, replacement: target, affected });
    return { affected };
  }

  async mediaFor(postPath: string) {
    const full = await this.resolve(postPath);
    this.assertArticlePath(full);
    const assets = path.join(path.dirname(full), path.basename(full, '.md'));
    if (!await exists(assets)) return [];
    const markdown = await fs.readFile(full, 'utf8');
    const entries = await fs.readdir(assets, { withFileTypes: true });
    return Promise.all(entries.filter(entry => entry.isFile()).map(async entry => { const stat = await fs.stat(path.join(assets, entry.name)); return { name: entry.name, size: stat.size, used: markdown.includes(entry.name), path: path.relative(this.root, path.join(assets, entry.name)).replace(/\\/g, '/') }; }));
  }

  async mediaLibrary() {
    const posts = await this.listContent('post');
    const groups = await Promise.all(posts.map(async post => (await this.mediaFor(post.path)).map(asset => ({ ...asset, postPath: post.path, postTitle: post.title }))));
    return groups.flat().sort((left, right) => left.postTitle.localeCompare(right.postTitle) || left.name.localeCompare(right.name));
  }

  async uploadMedia(postPath: string, filename: string, bytes: Buffer) {
    const full = await this.resolve(postPath);
    this.assertArticlePath(full);
    const base = path.join(path.dirname(full), path.basename(full, '.md'));
    await ensureDirectory(base);
    const safeName = path.basename(filename).replace(/[<>:"/\\|?*]/g, '-');
    const target = path.join(base, safeName);
    await fs.writeFile(target, bytes);
    const markdown = `![${path.parse(safeName).name}](${safeName})`;
    await this.appendLog('media.upload', 'succeeded', { postPath, filename: safeName, bytes: bytes.byteLength });
    return { path: path.relative(this.root, target).replace(/\\/g, '/'), markdown };
  }

  async processMedia(postPath: string, filename: string, mode: 'webp' | 'thumbnail', quality = 82) {
    const full = await this.resolve(postPath);
    this.assertArticlePath(full);
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename || !/\.(png|jpe?g|webp)$/i.test(safeName)) throw new AppError('UNSUPPORTED_IMAGE', 'Only PNG, JPEG, and WebP images can be processed.');
    const directory = path.join(path.dirname(full), path.basename(full, '.md'));
    const source = path.join(directory, safeName);
    if (!await exists(source)) throw new AppError('MEDIA_NOT_FOUND', 'The media file no longer exists.');
    const suffix = mode === 'thumbnail' ? '-thumb' : '-optimized';
    const outputName = `${path.parse(safeName).name}${suffix}.webp`;
    const target = path.join(directory, outputName);
    if (await exists(target)) throw new AppError('MEDIA_OUTPUT_EXISTS', `The generated file ${outputName} already exists. Rename or remove it before processing again.`);
    const width = mode === 'thumbnail' ? 480 : 1920;
    await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: Math.min(95, Math.max(40, quality)) }).toFile(target);
    const sourceBytes = (await fs.stat(source)).size;
    const bytes = (await fs.stat(target)).size;
    await this.appendLog('media.process', 'succeeded', { postPath, filename: safeName, outputName, mode, bytes });
    return { name: outputName, path: path.relative(this.root, target).replace(/\\/g, '/'), bytes, sourceBytes, savedBytes: sourceBytes - bytes, savedPercent: sourceBytes ? Math.round((1 - bytes / sourceBytes) * 100) : 0, markdown: `![${path.parse(outputName).name}](${outputName})` };
  }

  async processMediaBatch(items: Array<{ postPath: string; name: string }>, mode: 'webp' | 'thumbnail', quality = 82) {
    const processed: Array<{ postPath: string; name: string; output: string; path: string; bytes: number; sourceBytes: number; savedBytes: number; savedPercent: number; markdown: string }> = [];
    const failed: Array<{ postPath: string; name: string; message: string }> = [];
    for (const item of items.slice(0, 100)) {
      try {
        const result = await this.processMedia(item.postPath, item.name, mode, quality);
        processed.push({ postPath: item.postPath, name: item.name, output: result.name, path: result.path, bytes: result.bytes, sourceBytes: result.sourceBytes, savedBytes: result.savedBytes, savedPercent: result.savedPercent, markdown: result.markdown });
      } catch (error) {
        failed.push({ postPath: item.postPath, name: item.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
    await this.appendLog('media.process.batch', failed.length ? 'failed' : 'succeeded', { mode, processed: processed.length, failed: failed.length });
    return { processed, failed };
  }

  async deleteMedia(postPath: string, filename: string) {
    const full = await this.resolve(postPath);
    this.assertArticlePath(full);
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename) throw new AppError('INVALID_MEDIA_PATH', 'The media filename is invalid.');
    const target = path.join(path.dirname(full), path.basename(full, '.md'), safeName);
    if (!await exists(target)) throw new AppError('MEDIA_NOT_FOUND', 'The media file no longer exists.');
    await fs.rm(target, { force: true });
    await this.appendLog('media.delete', 'succeeded', { postPath, filename: safeName });
  }

  async renameMedia(postPath: string, filename: string, newFilename: string) {
    const full = await this.resolve(postPath);
    this.assertArticlePath(full);
    const oldName = path.basename(filename); const newName = path.basename(newFilename).replace(/[<>:"/\\|?*]/g, '-');
    if (!oldName || oldName !== filename || !newName || newName !== newFilename) throw new AppError('INVALID_MEDIA_PATH', 'The media filename is invalid.');
    const base = path.join(path.dirname(full), path.basename(full, '.md'));
    const source = path.join(base, oldName); const target = path.join(base, newName);
    if (!await exists(source)) throw new AppError('MEDIA_NOT_FOUND', 'The media file no longer exists.');
    if (await exists(target)) throw new AppError('MEDIA_EXISTS', 'A media file with that name already exists.');
    await fs.rename(source, target);
    const markdown = await fs.readFile(full, 'utf8');
    if (markdown.includes(oldName)) await this.writeAtomic(full, markdown.split(oldName).join(newName));
    await this.appendLog('media.rename', 'succeeded', { postPath, filename: oldName, newFilename: newName });
    return { name: newName };
  }

  async readMedia(postPath: string, filename: string) {
    const full = await this.resolve(postPath);
    this.assertArticlePath(full);
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename) throw new AppError('INVALID_MEDIA_PATH', 'The media filename is invalid.');
    const target = path.join(path.dirname(full), path.basename(full, '.md'), safeName);
    if (!await exists(target)) throw new AppError('MEDIA_NOT_FOUND', 'The media file no longer exists.');
    return { name: safeName, bytes: await fs.readFile(target) };
  }

  private async githubSshEnvironment() {
    // Keep Unicode filenames readable and avoid a broken global excludes-file
    // from leaking warnings into the local management UI.  Git's normal SSH
    // known_hosts file can be inaccessible to a locally sandboxed process, so
    // use a project-local trust store instead. accept-new trusts GitHub only on
    // first use and will still reject a changed key afterwards.
    const knownHosts = path.join(this.metaRoot, 'ssh', 'known_hosts').replace(/\\/g, '/');
    await ensureDirectory(path.dirname(knownHosts));
    const remote = await this.command('git', ['config', '--get', 'remote.origin.url']);
    const githubSsh = /^(?:git@|ssh:\/\/git@)(?:github\.com|ssh\.github\.com)[:/]/i.test(remote.stdout.trim());
    const githubTunnel = githubSsh
      ? ' -o HostName=ssh.github.com -p 443 -o HostKeyAlias=github.com'
      : '';
    return {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -o UserKnownHostsFile="${knownHosts}" -o StrictHostKeyChecking=accept-new${githubTunnel}`,
    };
  }

  async git(args: string[]) {
    const environment = await this.githubSshEnvironment();
    return this.command('git', ['-c', 'core.quotepath=false', '-c', 'core.excludesFile=/dev/null', ...args], false, environment);
  }

  async gitOverview() {
    const [status, branch, remotes, upstream, branches, log] = await Promise.all([
      this.git(['status', '--porcelain=v1']), this.git(['branch', '--show-current']), this.git(['remote', 'get-url', 'origin']),
      this.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']), this.git(['branch', '--format=%(refname:short)']),
      this.git(['log', '-8', '--pretty=format:%h%x09%s%x09%ci'])
    ]);
    const changes = status.stdout.split('\n').filter(Boolean);
    const conflictCodes = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
    const conflicts = changes.filter(line => conflictCodes.has(line.slice(0, 2))).map(line => line.slice(3));
    const current = branch.stdout.trim();
    const tracking = upstream.code === 0 ? upstream.stdout.trim() : '';
    let ahead = 0; let behind = 0;
    if (tracking) {
      const divergence = await this.git(['rev-list', '--left-right', '--count', `${tracking}...HEAD`]);
      const [behindValue, aheadValue] = divergence.stdout.trim().split(/\s+/).map(Number);
      behind = Number.isFinite(behindValue) ? behindValue : 0;
      ahead = Number.isFinite(aheadValue) ? aheadValue : 0;
    }
    const remoteRaw = remotes.code === 0 ? remotes.stdout.trim() : '';
    let remote = remoteRaw;
    try { const parsed = new URL(remoteRaw); if (parsed.password) { parsed.password = ''; remote = parsed.toString(); } } catch { /* SSH URLs do not expose a password here. */ }
    return { branch: current, tracking, remote, ahead, behind, branches: branches.stdout.split('\n').filter(Boolean), changes, conflicts, log: log.stdout.split('\n').filter(Boolean).map(line => { const [hash, message, date] = line.split('\t'); return { hash, message, date }; }) };
  }

  async command(command: string, args: string[], detached = false, environment: NodeJS.ProcessEnv = process.env) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(command, args, { cwd: this.root, shell: false, windowsHide: true, detached, env: environment });
      let stdout = ''; let stderr = '';
      child.stdout?.on('data', data => { stdout += data.toString(); });
      child.stderr?.on('data', data => { stderr += data.toString(); });
      child.on('error', error => reject(new AppError('COMMAND_UNAVAILABLE', error.message)));
      child.on('close', code => resolve({ code: code ?? 1, stdout: redact(stdout), stderr: redact(stderr) }));
    });
  }

  private hexoInvocation(args: string[]) {
    if (process.platform === 'win32') {
      return {
        command: process.execPath,
        args: [path.join(this.root, 'node_modules', 'hexo-cli', 'bin', 'hexo'), ...args]
      };
    }
    return { command: path.join(this.root, 'node_modules', '.bin', 'hexo'), args };
  }

  private async runHexo(args: string[]) {
    const invocation = this.hexoInvocation(args);
    // Hexo deploy starts its own Git client in .deploy_git. Give it the same
    // GitHub SSH-over-443 transport used by the management Git page; direct
    // port 22 is blocked on some local networks.
    const environment = args.includes('deploy') ? await this.githubSshEnvironment() : process.env;
    return this.command(invocation.command, invocation.args, false, environment);
  }

  private async portAvailable(port: number) {
    return new Promise<boolean>(resolve => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
  }

  private async runDeployment(task: TaskRecord) {
    for (const step of ['clean', 'generate', 'deploy']) {
      task.stdout += `\n$ hexo ${step}\n`;
      try {
        const result = await this.runHexo([step]);
        task.stdout += result.stdout;
        task.stderr += result.stderr;
        if (result.code !== 0) {
          task.status = 'failed'; task.exitCode = result.code; task.endedAt = new Date().toISOString();
          await this.appendLog('task.deploy', 'failed', { id: task.id, step, exitCode: result.code });
          return;
        }
      } catch (error) {
        task.status = 'failed'; task.stderr += error instanceof Error ? error.message : String(error); task.endedAt = new Date().toISOString();
        await this.appendLog('task.deploy', 'failed', { id: task.id, step });
        return;
      }
    }
    task.status = 'succeeded'; task.exitCode = 0; task.endedAt = new Date().toISOString();
    await this.appendLog('task.deploy', 'succeeded', { id: task.id });
  }

  async runTask(type: TaskRecord['type'], confirmed = false, port = 4000) {
    if (type === 'deploy' && !confirmed) throw new AppError('CONFIRMATION_REQUIRED', 'Deploy pushes the static site and requires explicit confirmation.');
    if (type === 'preview' && this.preview) {
      const existing = this.tasks.get(this.preview.taskId);
      if (existing) return existing;
      throw new AppError('PREVIEW_RUNNING', `Preview is already running on port ${this.preview.port}.`);
    }
    /* Legacy localized messages retained only to avoid invalid source encoding.
    if (type === 'deploy' && !confirmed) throw new AppError('CONFIRMATION_REQUIRED', '部署会推送静态站点，必须明确确认后才能执行。');
    if (type === 'preview' && this.preview) throw new AppError('PREVIEW_RUNNING', `预览服务已在 ${this.preview.port} 端口运行。');
    */
    let selectedPort = port;
    if (type === 'preview') {
      while (selectedPort < port + 20 && !await this.portAvailable(selectedPort)) selectedPort += 1;
      if (selectedPort === port + 20) throw new AppError('PORT_UNAVAILABLE', `Ports ${port}-${port + 19} are already in use.`, false, 'Stop a preview service or choose another port.');
    }
    const id = randomUUID(); const task: TaskRecord = { id, type, status: type === 'preview' ? 'starting' : 'running', startedAt: new Date().toISOString(), stdout: selectedPort === port ? '' : `Port ${port} is in use; preview moved to ${selectedPort}.\n`, stderr: '' };
    this.tasks.set(id, task);
    if (type === 'deploy') { void this.runDeployment(task); return task; }
    const args = type === 'preview' ? ['server', '--ip', '127.0.0.1', '--port', String(selectedPort)] : [type];
    const invocation = this.hexoInvocation(args);
    const child = spawn(invocation.command, invocation.args, { cwd: this.root, shell: false, windowsHide: true });
    const append = (field: 'stdout' | 'stderr', value: Buffer) => {
      // Hexo can emit ANSI colour sequences even when it is not attached to a
      // terminal. Remove them before storing output or checking readiness.
      const output = redact(value.toString()).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
      task[field] += output;
      // Hexo forks the HTTP server after the child process exists. Do not tell
      // the UI that preview is ready until its own startup message is seen.
      if (type === 'preview' && field === 'stdout' && /Hexo is running at\s+http/i.test(output)) task.status = 'running';
    };
    child.stdout?.on('data', data => append('stdout', data)); child.stderr?.on('data', data => append('stderr', data));
    child.on('error', error => { task.status = 'failed'; task.stderr += error.message; task.endedAt = new Date().toISOString(); });
    child.on('close', code => { if (type !== 'preview') { task.status = code === 0 ? 'succeeded' : 'failed'; task.exitCode = code ?? 1; task.endedAt = new Date().toISOString(); this.appendLog(`task.${type}`, task.status === 'succeeded' ? 'succeeded' : 'failed', { id, exitCode: task.exitCode }).catch(() => undefined); } });
    if (type === 'preview') {
      this.preview = { process: child, port: selectedPort, taskId: id };
      child.on('close', code => {
        if (this.preview?.taskId !== id) return;
        // taskkill ends the Windows process tree with a non-zero code. That is
        // an expected result after the user explicitly chose Stop preview.
        const wasStoppedByUser = task.status === 'stopping';
        task.status = wasStoppedByUser || code === null || code === 0 ? 'stopped' : 'failed';
        task.exitCode = code ?? 0;
        task.endedAt = new Date().toISOString();
        if (task.status === 'failed') this.appendLog('task.preview', 'failed', { id, exitCode: task.exitCode }).catch(() => undefined);
        this.preview = undefined;
      });
    }
    return task;
  }

  async stopPreview() {
    // A stop request is intentionally idempotent: a double click or a delayed
    // UI refresh must not surface a spurious backend error to the user.
    if (!this.preview) return { stopped: true, alreadyStopped: true };
    const preview = this.preview;
    const task = this.tasks.get(preview.taskId); if (task) task.status = 'stopping';
    if (process.platform === 'win32' && preview.process.pid) {
      const result = await this.command('taskkill', ['/PID', String(preview.process.pid), '/T', '/F']);
      if (result.code !== 0 && task) task.stderr += result.stderr || result.stdout;
    } else {
      preview.process.kill();
    }
    return { stopped: true, alreadyStopped: false };
  }

  async deploymentCheck() {
    const config = await this.readYaml('_config.yml');
    // listContent parses every document, so this also validates Front Matter
    // before a deployment is allowed to start.
    const [posts, drafts, gitStatus] = await Promise.all([this.listContent('post'), this.listContent('draft'), this.git(['status', '--porcelain=v1'])]);
    const deploy = (config.value as Record<string, unknown>).deploy;
    const deploymentConfigured = Array.isArray(deploy) ? deploy.length > 0 : Boolean(deploy && typeof deploy === 'object' && Object.keys(deploy).length);
    const seo = await this.seo('post');
    return { configurationValid: true, frontMatterValid: true, deploymentConfigured, posts: posts.length, drafts: drafts.length, changedFiles: gitStatus.stdout.split('\n').filter(Boolean).length, seoWarnings: seo.warnings, seoSuggestions: seo.suggestions };
  }

  async status() {
    const [posts, drafts, pages, taxonomy, gitStatus, branch, gitVersion, packageRaw] = await Promise.all([this.listContent('post'), this.listContent('draft'), this.listContent('page'), this.taxonomy(), this.git(['status', '--porcelain=v1']), this.git(['branch', '--show-current']), this.git(['--version']), fs.readFile(path.join(this.root, 'package.json'), 'utf8')]);
    const config = await this.readYaml('_config.yml');
    const packageJson = JSON.parse(packageRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const previewTask = this.preview ? this.tasks.get(this.preview.taskId) : undefined;
    return { root: this.root, theme: config.value.theme ?? '', posts: posts.length, drafts: drafts.length, pages: pages.length, categories: taxonomy.categories.length, tags: taxonomy.tags.length, branch: branch.stdout.trim(), changedFiles: gitStatus.stdout.split('\n').filter(Boolean).length, preview: this.preview && previewTask?.status === 'running' ? { port: this.preview.port, url: `http://127.0.0.1:${this.preview.port}/` } : null, recentPosts: posts.slice(0, 5).map(post => ({ title: post.title, path: post.path, mtimeMs: post.mtimeMs })), recentTasks: [...this.tasks.values()].slice(-6).reverse(), environment: { node: process.version, platform: `${process.platform}/${process.arch}`, git: gitVersion.stdout.trim() || 'unavailable', hexo: packageJson.dependencies?.hexo ?? packageJson.devDependencies?.hexo ?? 'unknown', adminUrl: `http://127.0.0.1:${process.env.HEXO_ADMIN_PORT ?? 4190}` } };
  }
}
