import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import type { ContentDocument, ContentKind, TaskRecord } from './types.js';

const META_DIR = '.hexo-admin';
const CONTENT_DIRS: Record<ContentKind, string> = { post: 'source/_posts', draft: 'source/_drafts', page: 'source' };
const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules', 'public', '.deploy_git', META_DIR, 'admin']);
const SECRET_PATTERN = /(token|secret|password|private[_-]?key|access[_-]?key)\s*[:=]\s*([^\s,]+)/gi;
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
    const root = await fs.realpath(candidate);
    if (!await exists(path.join(root, '_config.yml')) || !await exists(path.join(root, 'package.json'))) throw new AppError('INVALID_PROJECT', 'The selected directory is not a valid Hexo project.', false, 'Select a directory containing _config.yml and package.json.');
    const context = new ProjectContext(root);
    await Promise.all(['recycle-bin', 'backups', 'snapshots', 'logs'].map(name => ensureDirectory(path.join(context.metaRoot, name))));
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

  async saveContent(kind: ContentKind, relativePath: string, input: { data: Record<string, unknown>; body: string; hash?: string }) {
    const full = await this.resolve(relativePath);
    this.assertContentPath(kind, full);
    const current = await fs.readFile(full, 'utf8');
    if (input.hash && input.hash !== digest(current)) throw new AppError('EXTERNAL_MODIFICATION', 'The file changed outside the admin, so saving was cancelled.', false, 'Reload the content and merge your changes.');
    const snapshot = path.join(this.metaRoot, 'snapshots', `${Date.now()}-${path.basename(full)}`);
    await fs.writeFile(snapshot, current, 'utf8');
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

  async mediaFor(postPath: string) {
    const full = await this.resolve(postPath);
    this.assertContentPath('post', full);
    const assets = path.join(path.dirname(full), path.basename(full, '.md'));
    if (!await exists(assets)) return [];
    const entries = await fs.readdir(assets, { withFileTypes: true });
    return Promise.all(entries.filter(entry => entry.isFile()).map(async entry => { const stat = await fs.stat(path.join(assets, entry.name)); return { name: entry.name, size: stat.size, path: path.relative(this.root, path.join(assets, entry.name)).replace(/\\/g, '/') }; }));
  }

  async uploadMedia(postPath: string, filename: string, bytes: Buffer) {
    const full = await this.resolve(postPath);
    this.assertContentPath('post', full);
    const base = path.join(path.dirname(full), path.basename(full, '.md'));
    await ensureDirectory(base);
    const safeName = path.basename(filename).replace(/[<>:"/\\|?*]/g, '-');
    const target = path.join(base, safeName);
    await fs.writeFile(target, bytes);
    const markdown = `![${path.parse(safeName).name}](${safeName})`;
    await this.appendLog('media.upload', 'succeeded', { postPath, filename: safeName, bytes: bytes.byteLength });
    return { path: path.relative(this.root, target).replace(/\\/g, '/'), markdown };
  }

  async git(args: string[]) {
    // Keep Unicode filenames readable and avoid a broken global excludes-file
    // from leaking warnings into the local management UI.
    return this.command('git', ['-c', 'core.quotepath=false', '-c', 'core.excludesFile=/dev/null', ...args]);
  }

  async command(command: string, args: string[], detached = false) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(command, args, { cwd: this.root, shell: false, windowsHide: true, detached });
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

  private runHexo(args: string[]) {
    const invocation = this.hexoInvocation(args);
    return this.command(invocation.command, invocation.args);
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
    if (type === 'preview' && this.preview) throw new AppError('PREVIEW_RUNNING', `Preview is already running on port ${this.preview.port}.`);
    /* Legacy localized messages retained only to avoid invalid source encoding.
    if (type === 'deploy' && !confirmed) throw new AppError('CONFIRMATION_REQUIRED', '部署会推送静态站点，必须明确确认后才能执行。');
    if (type === 'preview' && this.preview) throw new AppError('PREVIEW_RUNNING', `预览服务已在 ${this.preview.port} 端口运行。');
    */
    let selectedPort = port;
    if (type === 'preview') {
      while (selectedPort < port + 20 && !await this.portAvailable(selectedPort)) selectedPort += 1;
      if (selectedPort === port + 20) throw new AppError('PORT_UNAVAILABLE', `Ports ${port}-${port + 19} are already in use.`, false, 'Stop a preview service or choose another port.');
    }
    const id = randomUUID(); const task: TaskRecord = { id, type, status: 'running', startedAt: new Date().toISOString(), stdout: selectedPort === port ? '' : `Port ${port} is in use; preview moved to ${selectedPort}.\n`, stderr: '' };
    this.tasks.set(id, task);
    if (type === 'deploy') { void this.runDeployment(task); return task; }
    const args = type === 'preview' ? ['server', '--ip', '127.0.0.1', '--port', String(selectedPort)] : [type];
    const invocation = this.hexoInvocation(args);
    const child = spawn(invocation.command, invocation.args, { cwd: this.root, shell: false, windowsHide: true });
    const append = (field: 'stdout' | 'stderr', value: Buffer) => { task[field] += redact(value.toString()); };
    child.stdout?.on('data', data => append('stdout', data)); child.stderr?.on('data', data => append('stderr', data));
    child.on('error', error => { task.status = 'failed'; task.stderr += error.message; task.endedAt = new Date().toISOString(); });
    child.on('close', code => { if (type !== 'preview') { task.status = code === 0 ? 'succeeded' : 'failed'; task.exitCode = code ?? 1; task.endedAt = new Date().toISOString(); this.appendLog(`task.${type}`, task.status === 'succeeded' ? 'succeeded' : 'failed', { id, exitCode: task.exitCode }).catch(() => undefined); } });
    if (type === 'preview') {
      this.preview = { process: child, port: selectedPort, taskId: id };
      child.on('close', code => {
        if (this.preview?.taskId !== id) return;
        task.status = code === null || code === 0 ? 'stopped' : 'failed';
        task.exitCode = code ?? 0;
        task.endedAt = new Date().toISOString();
        if (task.status === 'failed') this.appendLog('task.preview', 'failed', { id, exitCode: task.exitCode }).catch(() => undefined);
        this.preview = undefined;
      });
    }
    return task;
  }

  stopPreview() {
    if (!this.preview) throw new AppError('PREVIEW_NOT_RUNNING', 'No preview service is currently managed by the admin.');
    const task = this.tasks.get(this.preview.taskId); if (task) task.status = 'stopping';
    this.preview.process.kill();
    return { stopped: true };
  }

  async status() {
    const [posts, drafts, pages, taxonomy, gitStatus, branch] = await Promise.all([this.listContent('post'), this.listContent('draft'), this.listContent('page'), this.taxonomy(), this.git(['status', '--porcelain=v1']), this.git(['branch', '--show-current'])]);
    const config = await this.readYaml('_config.yml');
    return { root: this.root, theme: config.value.theme ?? '', posts: posts.length, drafts: drafts.length, pages: pages.length, categories: taxonomy.categories.length, tags: taxonomy.tags.length, branch: branch.stdout.trim(), changedFiles: gitStatus.stdout.split('\n').filter(Boolean).length, preview: this.preview ? { port: this.preview.port, url: `http://127.0.0.1:${this.preview.port}/` } : null, recentTasks: [...this.tasks.values()].slice(-6).reverse() };
  }
}
