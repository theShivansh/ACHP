'use client';

interface TopBarProps {
  isRunning: boolean;
  runId?: string;
  activeTab: 'dashboard' | 'monitor' | 'logs' | 'kb-manager';
  onTabChange: (tab: 'dashboard' | 'monitor' | 'logs') => void;
  hasResult: boolean;
  onExport: () => void;
  onScrollToQuery: () => void;
  onKBManager: () => void;
}

export default function TopBar({
  isRunning,
  runId,
  activeTab,
  onTabChange,
  hasResult,
  onExport,
  onScrollToQuery,
  onKBManager,
}: TopBarProps) {
  const NAV = [
    { id: 'dashboard',  label: 'DASHBOARD'   },
    { id: 'monitor',    label: 'MONITOR'      },
    { id: 'logs',       label: 'LOGS'         },
    { id: 'kb-manager', label: 'KB MANAGER'   },
  ] as const;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center w-full px-6"
      style={{
        height: 64,
        background: 'rgba(10,10,10,0.90)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-8">
        <button
          onClick={() => onTabChange('dashboard')}
          className="btn-tactile"
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: '#00F0FF',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ACHP
        </button>

        <nav className="hidden md:flex gap-1 items-center">
          {NAV.map(({ id, label }) => {
            const isActive = activeTab === id;
            const isKB = id === 'kb-manager';
            return (
              <button
                key={id}
                onClick={() => {
                  if (isKB) {
                    onKBManager();
                  } else {
                    onTabChange(id as 'dashboard' | 'monitor' | 'logs');
                  }
                }}
                className="btn-tactile font-bold uppercase transition-all"
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 12,
                  letterSpacing: '0.05em',
                  color: isActive
                    ? (isKB ? '#e5b5ff' : '#00F0FF')
                    : (isKB ? 'rgba(229,181,255,0.50)' : 'rgba(255,255,255,0.40)'),
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive
                    ? `2px solid ${isKB ? '#e5b5ff' : '#00F0FF'}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  paddingBottom: 6,
                  marginLeft: isKB ? 12 : 0,
                  paddingLeft: isKB ? 12 : 12,
                  borderLeft: isKB ? '1px solid rgba(255,255,255,0.08)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = isKB
                      ? 'rgba(229,181,255,0.90)'
                      : 'rgba(255,255,255,0.80)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = isKB
                      ? 'rgba(229,181,255,0.50)'
                      : 'rgba(255,255,255,0.40)';
                  }
                }}
              >
                {isKB && (
                  <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>folder_open</span>
                )}
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Download Report — only active when we have a result */}
        <button
          onClick={hasResult ? onExport : onScrollToQuery}
          className="btn-tactile flex items-center gap-2 px-4 py-2 transition-all"
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: hasResult ? 'rgba(0,240,255,0.08)' : 'rgba(255,255,255,0.04)',
            border: hasResult ? '1px solid rgba(0,240,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
            color: hasResult ? '#00F0FF' : 'rgba(255,255,255,0.40)',
            cursor: 'pointer',
          }}
          title={hasResult ? 'Download latest analysis report' : 'No report yet — submit a claim first'}
          onMouseEnter={e => {
            if (hasResult) {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.15)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.50)';
            }
          }}
          onMouseLeave={e => {
            if (hasResult) {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.08)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.25)';
            }
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            {hasResult ? 'download' : 'picture_as_pdf'}
          </span>
          {hasResult ? 'DOWNLOAD REPORT' : 'EXPORT'}
        </button>

        {/* Notifications placeholder */}
        <button
          className="btn-tactile relative flex items-center justify-center"
          style={{
            width: 36, height: 36,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.40)',
            cursor: 'pointer',
          }}
          title="Notifications"
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = '#00F0FF';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.25)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>notifications</span>
          {isRunning && (
            <span
              className="absolute top-1 right-1 rounded-full animate-pulse"
              style={{ width: 6, height: 6, background: '#00F0FF', boxShadow: '0 0 4px #00F0FF' }}
            />
          )}
        </button>

        {/* Avatar */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 36, height: 36,
            background: '#201f1f',
            border: '1px solid rgba(0,240,255,0.25)',
            cursor: 'default',
          }}
          title="User account"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(0,240,255,0.60)' }}>
            person
          </span>
        </div>

        {/* Live indicator (running) */}
        {isRunning && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 shimmer-badge relative overflow-hidden"
            style={{ background: '#201f1f', border: '1px solid rgba(59,73,75,0.25)' }}
          >
            <div className="w-2 h-2 rounded-full animate-pulse relative z-10" style={{ background: '#00F0FF', boxShadow: '0 0 4px #00F0FF' }} />
            <span
              className="relative z-10 font-bold uppercase"
              style={{ fontSize: 10, color: '#dbfcff', letterSpacing: '0.12em', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {runId ? `LIVE — ${runId.slice(0, 6).toUpperCase()}` : 'PROCESSING'}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
