'use client';
import { useState, useRef } from 'react';

const DEMO_QUERIES = [
  {
    label: 'Climate Hoax',
    text: 'Climate change is a hoax created by the Chinese government to make U.S. manufacturing non-competitive.',
  },
  {
    label: 'Exercise & CVD',
    text: 'Regular exercise reduces the risk of cardiovascular disease by approximately 30 to 40 percent.',
  },
  {
    label: 'Immigration',
    text: 'Immigrants are destroying our economy and taking all the jobs from hard-working citizens.',
  },
];

const MAX_CHARS = 4000;

interface QueryInputProps {
  onSubmit: (q: string) => void;
  isRunning: boolean;
  initialValue?: string;
  placeholder?: string;
}

export default function QueryInput({ onSubmit, isRunning, initialValue, placeholder }: QueryInputProps) {
  const [value, setValue]         = useState(initialValue ?? '');
  const [fileState, setFileState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle');
  const [fileName, setFileName]   = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !isRunning && value.trim().length >= 5 && value.trim().length <= MAX_CHARS;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    // Don't clear — let parent decide
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit();
  };

  // ── File reading logic ─────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileState('reading');
    setFileName(file.name);

    const reader = new FileReader();

    reader.onload = () => {
      const text = reader.result as string;
      // Clean up extracted text: collapse whitespace, limit to MAX_CHARS
      const cleaned = text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, MAX_CHARS);

      setValue(cleaned);
      setFileState('done');
      textareaRef.current?.focus();
    };

    reader.onerror = () => {
      setFileState('error');
    };

    // PDF extraction: read as text (works for text-based PDFs; for scanned PDFs, would need pdf.js)
    // For .txt and similar — readAsText is perfect
    // For .docx — we extract what we can as raw text (Office XML becomes readable)
    if (file.type === 'application/pdf') {
      // Read PDF as ArrayBuffer and extract text content
      const pdfReader = new FileReader();
      pdfReader.onload = async () => {
        try {
          // Try to dynamically import pdfjs-dist if available, else fallback to raw read
          const arrayBuf = pdfReader.result as ArrayBuffer;
          // Attempt basic text extraction by decoding the binary
          const bytes = new Uint8Array(arrayBuf);
          let rawText = '';
          // Extract readable ASCII strings from PDF binary (basic extraction)
          for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] >= 32 && bytes[i] < 127) {
              rawText += String.fromCharCode(bytes[i]);
            } else if (bytes[i] === 10 || bytes[i] === 13) {
              rawText += '\n';
            }
          }
          // Clean: keep only lines that look like real text (>10 visible chars)
          const lines = rawText
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 10 && /[a-zA-Z]{3,}/.test(l))
            .slice(0, 100);
          const extracted = lines.join('\n').slice(0, MAX_CHARS);
          setValue(extracted || '⚠ Could not extract text from this PDF. Please paste content manually.');
          setFileState('done');
          textareaRef.current?.focus();
        } catch {
          setFileState('error');
        }
      };
      pdfReader.onerror = () => setFileState('error');
      pdfReader.readAsArrayBuffer(file);
    } else {
      // Plain text, .txt, .csv, .md, .doc (partial), etc.
      reader.readAsText(file, 'UTF-8');
    }

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;
  const charPercent = Math.min(100, (charCount / MAX_CHARS) * 100);

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.pdf,.md,.csv,.doc,.docx,.rtf"
        className="hidden"
        onChange={handleFileChange}
        disabled={isRunning}
      />

      {/* File attachment indicator */}
      {(fileState === 'reading' || fileState === 'done' || fileState === 'error') && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: fileState === 'error'
              ? 'rgba(255,180,171,0.05)'
              : fileState === 'reading'
              ? 'rgba(0,240,255,0.04)'
              : 'rgba(0,240,255,0.06)',
            border: `1px solid ${fileState === 'error' ? 'rgba(255,180,171,0.15)' : fileState === 'reading' ? 'rgba(0,240,255,0.15)' : 'rgba(0,240,255,0.20)'}`,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 14, color: fileState === 'error' ? '#ffb4ab' : '#00F0FF' }}
          >
            {fileState === 'reading' ? 'hourglass_top' : fileState === 'error' ? 'error' : 'attach_file'}
          </span>
          <span style={{ fontSize: 10, color: fileState === 'error' ? '#ffb4ab' : '#00F0FF', fontFamily: 'JetBrains Mono, monospace', flex: 1 }}>
            {fileState === 'reading'
              ? `Reading ${fileName}…`
              : fileState === 'error'
              ? `Failed to read ${fileName}`
              : `Loaded: ${fileName}`}
          </span>
          <button
            onClick={() => { setFileState('idle'); setFileName(null); }}
            className="material-symbols-outlined"
            style={{ fontSize: 13, color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            close
          </button>
        </div>
      )}

      {/* Main input card */}
      <div
        className="glass-card"
        style={{ border: `1px solid ${isOverLimit ? 'rgba(255,180,171,0.30)' : 'rgba(255,255,255,0.08)'}`, overflow: 'hidden' }}
      >
        {/* Card header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-full animate-pulse"
              style={{ width: 6, height: 6, background: 'rgba(0,240,255,0.50)', boxShadow: '0 0 6px #00F0FF', display: 'inline-block' }}
            />
            <span
              className="uppercase font-bold"
              style={{ fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.40)', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Claim Input
            </span>
          </div>

          {/* Char count with mini bar */}
          <div className="flex items-center gap-2">
            {charCount > 0 && (
              <div style={{ width: 48, height: 2, background: 'rgba(255,255,255,0.06)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${charPercent}%`,
                    background: isOverLimit ? '#ffb4ab' : charPercent > 80 ? '#FED639' : '#00F0FF',
                    transition: 'width 0.2s, background 0.3s',
                  }}
                />
              </div>
            )}
            <span style={{ fontSize: 9, color: isOverLimit ? '#ffb4ab' : 'rgba(255,255,255,0.15)', fontFamily: 'JetBrains Mono, monospace' }}>
              {charCount > 0 ? `${charCount}/${MAX_CHARS}` : 'Ctrl+Enter'}
            </span>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder={placeholder ?? 'Enter a claim to fact-check, e.g. "Climate change is a hoax created by China..."'}
          className="w-full bg-transparent border-none resize-none"
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            color: '#e5e2e1',
            padding: '16px',
            minHeight: 120,
            outline: 'none',
            letterSpacing: '0.01em',
            lineHeight: 1.6,
            caretColor: '#00F0FF',
          }}
        />

        {/* Action bar */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.20)',
          }}
        >
          {/* Left: attach file */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              className="btn-tactile flex items-center gap-1.5 transition-all"
              style={{
                fontSize: 10,
                color: fileState === 'done' ? '#00F0FF' : 'rgba(255,255,255,0.35)',
                fontFamily: 'Space Grotesk, sans-serif',
                background: fileState === 'done' ? 'rgba(0,240,255,0.06)' : 'rgba(255,255,255,0.02)',
                border: fileState === 'done' ? '1px solid rgba(0,240,255,0.20)' : '1px solid rgba(255,255,255,0.07)',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                padding: '5px 10px',
              }}
              title="Attach a .txt, .pdf, .md, .csv or .doc file — text will be extracted"
              onMouseEnter={e => {
                if (!isRunning && fileState !== 'done') {
                  (e.currentTarget as HTMLElement).style.color = '#00F0FF';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.25)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.04)';
                }
              }}
              onMouseLeave={e => {
                if (!isRunning && fileState !== 'done') {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                }
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                {fileState === 'reading' ? 'hourglass_top' : fileState === 'done' ? 'check_circle' : 'attach_file'}
              </span>
              {fileState === 'reading' ? 'Reading…' : fileState === 'done' ? 'File loaded' : 'Attach'}
            </button>

            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.12)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.05em' }}>
              .txt .pdf .md .doc
            </span>
          </div>

          {/* Right: ANALYZE button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-tactile flex items-center gap-2 font-bold uppercase"
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 12,
              letterSpacing: '0.15em',
              padding: '10px 28px',
              background: canSubmit ? '#00F0FF' : 'rgba(0,240,255,0.10)',
              color: canSubmit ? '#00363a' : 'rgba(0,240,255,0.30)',
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              boxShadow: canSubmit ? '0 0 20px rgba(0,240,255,0.35)' : 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              if (canSubmit) (e.currentTarget as HTMLElement).style.boxShadow = '0 0 32px rgba(0,240,255,0.55)';
            }}
            onMouseLeave={e => {
              if (canSubmit) (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(0,240,255,0.35)';
            }}
          >
            {isRunning ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>hourglass_top</span>
                ANALYZING
              </>
            ) : (
              <>
                ANALYZE
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Demo quick-fills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          style={{
            fontSize: 9,
            color: 'rgba(255,255,255,0.20)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          Try:
        </span>
        {DEMO_QUERIES.map(dq => (
          <button
            key={dq.label}
            onClick={() => {
              setValue(dq.text);
              setFileState('idle');
              setFileName(null);
              textareaRef.current?.focus();
            }}
            disabled={isRunning}
            className="btn-tactile uppercase transition-all"
            style={{
              fontSize: 9,
              letterSpacing: '0.08em',
              fontFamily: 'Space Grotesk, sans-serif',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.35)',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              padding: '5px 10px',
            }}
            onMouseEnter={e => {
              if (!isRunning) {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.30)';
                (e.currentTarget as HTMLElement).style.color = '#00F0FF';
                (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.04)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
            }}
          >
            {dq.label}
          </button>
        ))}
      </div>
    </div>
  );
}
