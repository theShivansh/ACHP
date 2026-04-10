'use client';

import { useState, useRef, useEffect, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useKBList, useKBUpload, useKBDelete, useHealth } from '@/lib/api';
import type { KBItem } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function sourceIcon(type: string): string {
  if (type === 'file') return 'description';
  if (type === 'url')  return 'public';
  return 'notes';
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`status-${status}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 4, fontSize: 9,
        fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}
    >
      {status === 'indexing' && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FED639', display: 'inline-block', animation: 'micro-shimmer 1s infinite' }} />
      )}
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk Viewer Panel
// ─────────────────────────────────────────────────────────────────────────────

interface ChunkData { index: number; text: string; char_count: number; }

function ChunkViewer({ kbId, kbName }: { kbId: string; kbName: string }) {
  const [chunks, setChunks]   = useState<ChunkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useState(() => {
    setLoading(true);
    fetch(`${apiBase}/kb/${kbId}/chunks`)
      .then(r => r.json())
      .then(d => { setChunks(d.chunks ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load chunks'); setLoading(false); });
  });

  // Use useEffect correctly
  return <ChunkViewerInner kbId={kbId} kbName={kbName} />;
}

function ChunkViewerInner({ kbId, kbName }: { kbId: string; kbName: string }) {
  const [chunks, setChunks]   = useState<ChunkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const fetched = useRef(false);

  const apiBase = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
    : 'http://localhost:8000';

  // Fetch once on mount
  if (!fetched.current) {
    fetched.current = true;
    fetch(`${apiBase}/kb/${kbId}/chunks`)
      .then(r => r.json())
      .then(d => { setChunks(d.chunks ?? []); setLoading(false); })
      .catch(() => { setError('Could not load chunks'); setLoading(false); });
  }

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 10,
      border: '1px solid rgba(0,240,255,0.15)',
      background: 'rgba(0,240,255,0.03)',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(0,240,255,0.10)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#00F0FF' }}>
          dataset
        </span>
        <span style={{
          fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.10em', color: '#00F0FF',
        }}>
          Ingested Chunks — {kbName}
        </span>
        {!loading && (
          <span style={{
            marginLeft: 'auto', fontSize: 9, padding: '2px 8px', borderRadius: 99,
            background: 'rgba(0,240,255,0.10)', color: '#00F0FF',
            fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
          }}>
            {chunks.length} chunk{chunks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content area */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: '12px' }} className="custom-scrollbar">
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 4px',
            color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>sync</span>
            Loading chunks…
          </div>
        )}
        {error && (
          <div style={{ color: '#ffb4ab', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '8px 4px' }}>
            ⚠ {error}
          </div>
        )}
        {!loading && !error && chunks.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '8px 4px' }}>
            No chunks found.
          </div>
        )}
        {!loading && chunks.map(chunk => (
          <div key={chunk.index} style={{
            marginBottom: 10, borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
            overflow: 'hidden',
          }}>
            {/* Chunk header */}
            <div style={{
              padding: '6px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(0,240,255,0.04)',
            }}>
              <span style={{
                fontSize: 9, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.10em',
                color: '#00F0FF', background: 'rgba(0,240,255,0.12)',
                padding: '2px 7px', borderRadius: 4,
              }}>
                Chunk {chunk.index}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', fontFamily: 'JetBrains Mono, monospace' }}>
                {chunk.char_count.toLocaleString()} chars
              </span>
            </div>
            {/* Chunk text */}
            <pre style={{
              margin: 0, padding: '10px 12px',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              color: 'rgba(255,255,255,0.70)', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', lineHeight: 1.6,
            }}>
              {chunk.text}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual KB Card
// ─────────────────────────────────────────────────────────────────────────────

function KBCard({
  kb,
  isActive,
  onSetActive,
  onDelete,
}: {
  kb: KBItem;
  isActive: boolean;
  onSetActive: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [showChunks, setShowChunks] = useState(false);
  return (
    <div className={`kb-card ${isActive ? 'active-kb' : ''}`} style={{ borderRadius: 12, padding: '18px 20px' }}>
      {/* Active indicator stripe */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #00F0FF, transparent)',
          borderRadius: '12px 12px 0 0',
        }} />
      )}

      <div className="flex items-start gap-4" style={{ position: 'relative' }}>
        {/* Icon */}
        <div
          style={{
            width: 40, height: 40, flexShrink: 0, borderRadius: 8,
            background: isActive ? 'rgba(0,240,255,0.10)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isActive ? 'rgba(0,240,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: isActive ? '#00F0FF' : 'rgba(255,255,255,0.35)' }}
          >
            {sourceIcon(kb.source_type)}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 4, flexWrap: 'wrap' }}>
            <h3
              style={{
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 600,
                color: isActive ? '#dbfcff' : 'rgba(255,255,255,0.80)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
              title={kb.name}
            >
              {kb.name}
            </h3>
            {isActive && (
              <span style={{
                fontSize: 8, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: '#00F0FF', background: 'rgba(0,240,255,0.12)',
                border: '1px solid rgba(0,240,255,0.35)', padding: '2px 6px', borderRadius: 4,
              }}>
                ACTIVE
              </span>
            )}
            <StatusBadge status={kb.status} />
          </div>

          {/* Meta tags */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: 'JetBrains Mono, monospace' }}>
              {kb.chunk_count} chunks
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: 'JetBrains Mono, monospace' }}>
              {formatBytes(kb.size_bytes)}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace' }}>
              {formatDate(kb.created_at)}
            </span>
          </div>

          {/* Tags */}
          {kb.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {kb.tags.map(t => (
                <span key={t} style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(161,0,240,0.10)', color: '#e5b5ff',
                  fontFamily: 'Space Grotesk, sans-serif',
                  border: '1px solid rgba(161,0,240,0.20)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Source + chunk toggle row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{
              fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }} title={kb.source_name}>
              {kb.source_name}
            </p>

            {/* ── View Chunks Toggle Button ── */}
            {kb.status === 'ready' && (
              <button
                onClick={() => setShowChunks(v => !v)}
                title={showChunks ? 'Hide ingested chunks' : 'View ingested chunks'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  border: showChunks
                    ? '1px solid rgba(0,240,255,0.45)'
                    : '1px solid rgba(255,255,255,0.12)',
                  background: showChunks
                    ? 'rgba(0,240,255,0.12)'
                    : 'rgba(255,255,255,0.04)',
                  color: showChunks ? '#00F0FF' : 'rgba(255,255,255,0.40)',
                  transition: 'all 0.18s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  if (!showChunks) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.08)';
                    (e.currentTarget as HTMLElement).style.color = '#00F0FF';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.30)';
                  }
                }}
                onMouseLeave={e => {
                  if (!showChunks) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
                  }
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                  {showChunks ? 'unfold_less' : 'dataset'}
                </span>
                {showChunks ? 'Hide Chunks' : 'View Chunks'}
              </button>
            )}
          </div>

          {/* Chunks expansion panel */}
          {showChunks && (
            <ChunkViewerInner kbId={kb.kb_id} kbName={kb.name} />
          )}
        </div>

        {/* Action buttons column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, alignSelf: 'flex-start' }}>
          {/* Set Active button */}
          {kb.status === 'ready' && (
            <button
              onClick={onSetActive}
              className="btn-tactile"
              style={{
                padding: '7px 14px', borderRadius: 8,
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                border: isActive
                  ? '1px solid rgba(0,240,255,0.50)'
                  : '1px solid rgba(0,240,255,0.20)',
                background: isActive
                  ? 'rgba(0,240,255,0.15)'
                  : 'rgba(0,240,255,0.05)',
                color: isActive ? '#00F0FF' : 'rgba(0,240,255,0.60)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.12)';
                  (e.currentTarget as HTMLElement).style.color = '#00F0FF';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.05)';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(0,240,255,0.60)';
                }
              }}
            >
              {isActive ? (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                  Set Active
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>radio_button_unchecked</span>
                  Set Active
                </span>
              )}
            </button>
          )}

          {/* Delete button */}
          {confirming ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onDelete}
                className="btn-tactile"
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  background: 'rgba(255,100,80,0.15)',
                  border: '1px solid rgba(255,100,80,0.50)',
                  color: '#ff6450',
                }}
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="btn-tactile"
                style={{
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif', fontSize: 10, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.40)',
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="btn-tactile"
              title="Delete this knowledge base"
              style={{
                padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                background: 'rgba(255,100,80,0.06)',
                border: '1px solid rgba(255,100,80,0.20)',
                color: 'rgba(255,100,80,0.60)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,100,80,0.12)';
                (e.currentTarget as HTMLElement).style.color = '#ff6450';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,100,80,0.50)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,100,80,0.06)';
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,100,80,0.60)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,100,80,0.20)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Upload Zone
// ─────────────────────────────────────────────────────────────────────────────

function UploadZone({
  onUploaded,
}: {
  onUploaded: (kbId: string, kbName: string) => void;
}) {
  const [dragOver, setDragOver]     = useState(false);
  const [urlInput, setUrlInput]     = useState('');
  const [textInput, setTextInput]   = useState('');
  const [nameInput, setNameInput]   = useState('');
  const [tagsInput, setTagsInput]   = useState('');
  const [mode, setMode]             = useState<'file' | 'url' | 'text'>('file');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadMsg, setUploadMsg]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: upload } = useKBUpload();

  const doUpload = useCallback(async (payload: {
    file?: File; url?: string; text?: string; name?: string; tags?: string;
  }) => {
    setUploadState('uploading');
    setUploadMsg('');
    try {
      const res = await upload({
        ...payload,
        tags: tagsInput || undefined,
        name: nameInput || payload.name || undefined,
      });
      setUploadState('done');
      setUploadMsg(res.message);
      onUploaded(res.kb_id, res.name);
      // Reset after 2s
      setTimeout(() => {
        setUploadState('idle');
        setUrlInput('');
        setTextInput('');
        setNameInput('');
        setTagsInput('');
      }, 2500);
    } catch (e) {
      setUploadState('error');
      setUploadMsg(e instanceof Error ? e.message : 'Upload failed');
      setTimeout(() => setUploadState('idle'), 4000);
    }
  }, [upload, tagsInput, nameInput, onUploaded]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    doUpload({ file: files[0] });
  }, [doUpload]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
        {(['file', 'url', 'text'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              background: mode === m ? 'rgba(0,240,255,0.12)' : 'transparent',
              color: mode === m ? '#00F0FF' : 'rgba(255,255,255,0.35)',
              transition: 'all 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>
              {m === 'file' ? 'upload_file' : m === 'url' ? 'link' : 'text_fields'}
            </span>
            {m === 'file' ? 'File' : m === 'url' ? 'URL' : 'Text'}
          </button>
        ))}
      </div>

      {/* File mode */}
      {mode === 'file' && (
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
          style={{
            padding: '40px 24px', borderRadius: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
          }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <span className="material-symbols-outlined"
            style={{ fontSize: 40, color: dragOver ? '#00F0FF' : 'rgba(0,240,255,0.35)', transition: 'color 0.2s' }}>
            cloud_upload
          </span>
          <div>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.70)', marginBottom: 4 }}>
              Drag & drop your file here
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'JetBrains Mono, monospace' }}>
              PDF · DOCX · TXT · MD — max 50MB
            </p>
          </div>
          <span
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(0,240,255,0.30)',
              color: '#00F0FF', fontSize: 11, fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 600, background: 'rgba(0,240,255,0.06)',
            }}
          >
            Browse Files
          </span>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" hidden
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)} />
        </div>
      )}

      {/* URL mode */}
      {mode === 'url' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/article or PDF URL…"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
              color: '#e5e2e1', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(0,240,255,0.40)'; }}
            onBlur={e =>  { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; }}
          />
        </div>
      )}

      {/* Text mode */}
      {mode === 'text' && (
        <textarea
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          placeholder="Paste raw text content here (min 10 characters)…"
          rows={5}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 8, resize: 'vertical',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            color: '#e5e2e1', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(0,240,255,0.40)'; }}
          onBlur={e =>  { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; }}
        />
      )}

      {/* Metadata row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          placeholder="KB Name (optional)"
          style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e5e2e1', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(0,240,255,0.30)'; }}
          onBlur={e =>  { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        />
        <input
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          placeholder="Tags (comma-separated)"
          style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e5e2e1', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(0,240,255,0.30)'; }}
          onBlur={e =>  { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        />
      </div>

      {/* Upload button — visible for url/text modes */}
      {mode !== 'file' && (
        <button
          disabled={uploadState === 'uploading'}
          onClick={() => {
            if (mode === 'url' && urlInput.trim()) doUpload({ url: urlInput.trim() });
            if (mode === 'text' && textInput.trim()) doUpload({ text: textInput.trim() });
          }}
          className="btn-tactile"
          style={{
            padding: '12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: uploadState === 'uploading' ? 'rgba(0,240,255,0.05)' : '#00F0FF',
            color: uploadState === 'uploading' ? '#00F0FF' : '#00363a',
            fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: uploadState === 'uploading' ? 'none' : '0 0 20px rgba(0,240,255,0.25)',
          }}
        >
          {uploadState === 'uploading' ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>sync</span>
              Indexing…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
              Add to Knowledge Base
            </>
          )}
        </button>
      )}

      {/* Progress bar */}
      {uploadState === 'uploading' && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
          <div className="kb-progress-bar" style={{ height: '100%', background: 'linear-gradient(90deg, #A100F0, #00F0FF)', borderRadius: 99 }} />
        </div>
      )}

      {/* Status message */}
      {uploadMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: uploadState === 'error' ? 'rgba(255,180,171,0.06)' : 'rgba(0,240,255,0.06)',
          border: `1px solid ${uploadState === 'error' ? 'rgba(255,180,171,0.25)' : 'rgba(0,240,255,0.25)'}`,
          color: uploadState === 'error' ? '#ffb4ab' : '#00F0FF',
          fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>
            {uploadState === 'error' ? 'error' : 'check_circle'}
          </span>
          {uploadMsg}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main KB Manager
// ─────────────────────────────────────────────────────────────────────────────

interface KBManagerProps {
  onEnterAnalyzer: (kbId?: string) => void;
}

export default function KBManager({ onEnterAnalyzer }: KBManagerProps) {
  const { data: kbList, isLoading, error } = useKBList();
  const { data: health } = useHealth();
  const { mutateAsync: deleteKb } = useKBDelete();
  const [activeKbId, setActiveKbId]     = useState<string | null>(null);
  const [noKbToggle, setNoKbToggle]     = useState(false);
  const [justUploaded, setJustUploaded] = useState<string | null>(null);

  const kbs = kbList?.knowledge_bases ?? [];
  const backendOnline = !!health;

  const handleAnalyze = () => {
    if (noKbToggle) {
      onEnterAnalyzer(undefined);
    } else if (activeKbId) {
      onEnterAnalyzer(activeKbId);
    }
  };

  return (
    <div className="phase-enter-left" style={{
      display: 'flex', flexDirection: 'column', gap: 0, height: '100%',
    }}>
      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div style={{
        padding: '36px 40px 24px',
        background: 'linear-gradient(180deg, rgba(0,240,255,0.04) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Backend status chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 99,
            background: backendOnline ? 'rgba(0,240,255,0.08)' : 'rgba(255,180,171,0.08)',
            border: `1px solid ${backendOnline ? 'rgba(0,240,255,0.25)' : 'rgba(255,180,171,0.25)'}`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: backendOnline ? '#00F0FF' : '#ffb4ab',
              boxShadow: backendOnline ? '0 0 8px rgba(0,240,255,0.80)' : 'none',
            }} />
            <span style={{
              fontSize: 9, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              color: backendOnline ? '#00F0FF' : '#ffb4ab',
            }}>
              {backendOnline ? `FastAPI Online · ${health?.pipeline_mode ?? ''}` : 'FastAPI Offline'}
            </span>
          </div>
        </div>

        <h1 style={{
          fontFamily: 'Space Grotesk, sans-serif', fontSize: 32, fontWeight: 700,
          letterSpacing: '-0.02em', color: '#e5e2e1', marginBottom: 8,
        }}>
          Knowledge Base Manager
        </h1>
        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.40)', fontFamily: 'Space Grotesk, sans-serif',
          letterSpacing: '0.01em', maxWidth: 520,
        }}>
          Upload documents, URLs, or raw text to ground the 7-agent pipeline in your knowledge. Set an active KB, then analyze any claim.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 32, padding: '32px 40px 40px' }}
        className="custom-scrollbar">

        {/* ── LEFT: Upload Zone ───────────────────────────────────────── */}
        <div style={{ flex: '0 0 380px' }}>
          <div style={{
            background: 'rgba(14,14,14,0.80)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24,
          }}>
            <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#00F0FF' }}>add_circle</span>
              <h2 style={{
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 600,
                color: 'rgba(255,255,255,0.80)', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                Ingest Knowledge
              </h2>
            </div>
            <UploadZone
              onUploaded={(id, name) => {
                setJustUploaded(id);
                setActiveKbId(id);
                setNoKbToggle(false);
              }}
            />
          </div>

          {/* ── Analyze without KB toggle ─────────────────────────── */}
          <div style={{
            marginTop: 16, padding: '16px 20px', borderRadius: 12,
            background: noKbToggle ? 'rgba(0,240,255,0.05)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${noKbToggle ? 'rgba(0,240,255,0.20)' : 'rgba(255,255,255,0.07)'}`,
            display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
            onClick={() => {
              setNoKbToggle(v => !v);
              if (!noKbToggle) setActiveKbId(null);
            }}
          >
            <div className={`toggle-track ${noKbToggle ? 'on' : ''}`}>
              <div className="toggle-thumb" />
            </div>
            <div>
              <p style={{
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 600,
                color: noKbToggle ? '#00F0FF' : 'rgba(255,255,255,0.60)',
                marginBottom: 2,
              }}>
                Analyze without KB
              </p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', fontFamily: 'JetBrains Mono, monospace' }}>
                Use web retrieval only — no document context
              </p>
            </div>
          </div>

          {/* ── Proceed button ────────────────────────────────────── */}
          <button
            disabled={!activeKbId && !noKbToggle}
            onClick={handleAnalyze}
            className="btn-tactile"
            style={{
              marginTop: 16, width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              cursor: (!activeKbId && !noKbToggle) ? 'not-allowed' : 'pointer',
              background: (!activeKbId && !noKbToggle)
                ? 'rgba(255,255,255,0.05)'
                : 'linear-gradient(135deg, #00F0FF, #A100F0)',
              color: (!activeKbId && !noKbToggle) ? 'rgba(255,255,255,0.20)' : '#fff',
              boxShadow: (!activeKbId && !noKbToggle)
                ? 'none'
                : '0 0 32px rgba(0,240,255,0.25), 0 4px 16px rgba(0,0,0,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.25s ease',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {noKbToggle ? 'search' : 'arrow_forward'}
            </span>
            {noKbToggle ? 'Analyze (Web Only)' : activeKbId ? 'Proceed to Analyzer' : 'Select a KB Above'}
          </button>
        </div>

        {/* ── RIGHT: KB List ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(0,240,255,0.60)' }}>folder_open</span>
              <h2 style={{
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 600,
                color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                Knowledge Bases
              </h2>
              {kbs.length > 0 && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(0,240,255,0.10)', color: '#00F0FF',
                  fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
                }}>
                  {kbs.length}
                </span>
              )}
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2].map(i => (
                <div key={i} className="shimmer-badge" style={{
                  height: 100, borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  animationDelay: `${i * 0.15}s`,
                }} />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '16px', borderRadius: 12,
              background: 'rgba(255,180,171,0.05)', border: '1px solid rgba(255,180,171,0.15)',
              color: '#ffb4ab', fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
              Could not reach FastAPI backend. Is it running on port 8000?
            </div>
          )}

          {/* KB list */}
          {!isLoading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {kbs.length === 0 ? (
                <div style={{
                  padding: '48px 24px', borderRadius: 16, textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(255,255,255,0.10)', display: 'block', marginBottom: 12 }}>
                    folder_open
                  </span>
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.25)', marginBottom: 6 }}>
                    No knowledge bases yet
                  </p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', fontFamily: 'JetBrains Mono, monospace' }}>
                    Upload a file, URL, or paste text to get started
                  </p>
                </div>
              ) : (
                kbs.map(kb => (
                  <div key={kb.kb_id} style={{ position: 'relative' }}>
                    {/* "Just uploaded" glow */}
                    {justUploaded === kb.kb_id && (
                      <div style={{
                        position: 'absolute', inset: -2, borderRadius: 14, pointerEvents: 'none',
                        boxShadow: '0 0 0 2px rgba(0,240,255,0.50), 0 0 32px rgba(0,240,255,0.20)',
                        animation: 'fadeInUp 0.4s ease forwards',
                      }} />
                    )}
                    <KBCard
                      kb={kb}
                      isActive={activeKbId === kb.kb_id}
                      onSetActive={() => {
                        setActiveKbId(prev => prev === kb.kb_id ? null : kb.kb_id);
                        setNoKbToggle(false);
                      }}
                      onDelete={async () => {
                        await deleteKb(kb.kb_id);
                        if (activeKbId === kb.kb_id) setActiveKbId(null);
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
