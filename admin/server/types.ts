export type ContentKind = 'post' | 'draft' | 'page';

export interface ContentDocument {
  id: string;
  kind: ContentKind;
  path: string;
  title: string;
  data: Record<string, unknown>;
  body: string;
  mtimeMs: number;
  hash: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskRecord {
  id: string;
  type: 'clean' | 'generate' | 'deploy' | 'preview';
  status: 'running' | 'stopping' | 'succeeded' | 'failed' | 'stopped';
  startedAt: string;
  endedAt?: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
}

export interface AppErrorShape {
  code: string;
  message: string;
  changed: boolean;
  recovery?: string;
}
