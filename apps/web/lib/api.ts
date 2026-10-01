/**
 * ACHP API client — TanStack Query hooks
 * Calls FastAPI backend at http://localhost:8000 directly.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface KBItem {
  kb_id: string;
  name: string;
  source_type: 'file' | 'url' | 'text';
  source_name: string;
  doc_count: number;
  chunk_count: number;
  size_bytes: number;
  status: 'ready' | 'indexing' | 'error';
  created_at: string;
  tags: string[];
}

export interface KBListResponse {
  total: number;
  knowledge_bases: KBItem[];
}

export interface KBUploadPayload {
  file?: File;
  url?: string;
  text?: string;
  name?: string;
  tags?: string;
}

export interface KBUploadResponse {
  kb_id: string;
  name: string;
  source_type: string;
  chunk_count: number;
  size_bytes: number;
  status: string;
  created_at: string;
  message: string;
}

export interface AnalyzePayload {
  claim: string;
  kb_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchKBList(): Promise<KBListResponse> {
  const r = await fetch(`${API}/kb/list`);
  if (!r.ok) throw new Error(`KB list failed: ${r.status}`);
  return r.json();
}

export async function uploadKB(payload: KBUploadPayload): Promise<KBUploadResponse> {
  const form = new FormData();
  if (payload.file) form.append('file', payload.file);
  if (payload.url) form.append('url', payload.url);
  if (payload.text) form.append('text', payload.text);
  if (payload.name) form.append('name', payload.name);
  if (payload.tags) form.append('tags', payload.tags);

  const r = await fetch(`${API}/kb/upload`, { method: 'POST', body: form });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail ?? `Upload failed: ${r.status}`);
  }
  return r.json();
}

export async function deleteKB(kb_id: string): Promise<{ kb_id: string; deleted: boolean; message: string }> {
  const r = await fetch(`${API}/kb/${kb_id}`, { method: 'DELETE' });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail ?? `Delete failed: ${r.status}`);
  }
  return r.json();
}

export interface KBChunk {
  index: number;
  text: string;
  char_count: number;
}

export interface KBChunksResponse {
  kb_id: string;
  name: string;
  chunk_count: number;
  chunks: KBChunk[];
}

export async function fetchKB(kb_id: string): Promise<KBItem> {
  const r = await fetch(`${API}/kb/${encodeURIComponent(kb_id)}`);
  if (r.status === 404) throw new Error('not_found');
  if (!r.ok) throw new Error(`KB failed: ${r.status}`);
  return r.json();
}

export async function fetchKBChunks(kb_id: string): Promise<KBChunksResponse> {
  const r = await fetch(`${API}/kb/${encodeURIComponent(kb_id)}/chunks`);
  if (r.status === 404) throw new Error('not_found');
  if (!r.ok) throw new Error(`Chunks failed: ${r.status}`);
  return r.json();
}

export async function analyzeWithFastAPI(payload: AnalyzePayload) {
  const r = await fetch(`${API}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail ?? `Analyze failed: ${r.status}`);
  }
  return r.json();
}

export async function fetchHealth() {
  const r = await fetch(`${API}/health`);
  if (!r.ok) throw new Error('Backend offline');
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hooks
// ─────────────────────────────────────────────────────────────────────────────

/** List all knowledge bases */
export function useKBList() {
  return useQuery<KBListResponse>({
    queryKey: ['kb', 'list'],
    queryFn: fetchKBList,
    refetchInterval: 5000,   // poll every 5s to catch newly indexing KBs
    staleTime: 2000,
  });
}

/** One knowledge base; polls while it is still indexing so its status is the server's, not a guess. */
export function useKB(kb_id: string) {
  return useQuery<KBItem>({
    queryKey: ['kb', kb_id],
    queryFn: () => fetchKB(kb_id),
    refetchInterval: (q) => (q.state.data?.status === 'indexing' ? 3000 : false),
    retry: false,
  });
}

/** A knowledge base's stored chunks (read once; they do not change after indexing). */
export function useKBChunks(kb_id: string, enabled: boolean) {
  return useQuery<KBChunksResponse>({
    queryKey: ['kb', kb_id, 'chunks'],
    queryFn: () => fetchKBChunks(kb_id),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Backend health */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
}

/** Upload a new KB */
export function useKBUpload() {
  const qc = useQueryClient();
  return useMutation<KBUploadResponse, Error, KBUploadPayload>({
    mutationFn: uploadKB,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
  });
}

/** Delete a KB by ID */
export function useKBDelete() {
  const qc = useQueryClient();
  return useMutation<{ kb_id: string; deleted: boolean; message: string }, Error, string>({
    mutationFn: deleteKB,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
  });
}

/** Analyze a claim via FastAPI */
export function useAnalyzeMutation() {
  return useMutation({
    mutationFn: analyzeWithFastAPI,
  });
}
