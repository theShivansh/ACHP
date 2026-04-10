'use client';
import { useEffect, useState } from 'react';

interface Metrics {
  CTS: number;
  PCS: number;
  BIS: number;
  NSS: number;
  EPS: number;
}

interface MetricsRadarProps { metrics: Metrics; }

/** Convert 0-1 fraction and polar coords to SVG x,y */
function polarToXY(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export default function MetricsRadar({ metrics }: MetricsRadarProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Trigger draw animation after mount
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, [metrics]);

  const cx = 50, cy = 50, maxR = 38;
  // 5 axes: BIS top, NSS right, EPS bottom, PCS left-bottom, CTS left-top
  //  angles: BIS=0°, NSS=72°, EPS=144°, PCS=216°, CTS=288°
  const axes = [
    { key: 'BIS', label: 'BIS', angle: 0,   value: metrics.BIS, color: '#00F0FF' },
    { key: 'NSS', label: 'NSS', angle: 72,  value: metrics.NSS, color: '#00F0FF' },
    { key: 'EPS', label: 'EPS', angle: 144, value: metrics.EPS, color: '#e5b5ff' },
    { key: 'PCS', label: 'PCS', angle: 216, value: metrics.PCS, color: 'rgba(255,255,255,0.40)' },
    { key: 'CTS', label: 'CTS', angle: 288, value: metrics.CTS, color: 'rgba(255,255,255,0.40)' },
  ];

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Convert metric values to polygon points
  const points = axes.map(({ angle, value }) => {
    const r = (value ?? 0) * maxR;
    return polarToXY(cx, cy, r, angle);
  });

  // Axis endpoints (100%)
  const axisEndpoints = axes.map(({ angle }) => polarToXY(cx, cy, maxR, angle));

  const polygonPoints = animated
    ? points.map(([x, y]) => `${x},${y}`).join(' ')
    : `${cx},${cy} ${cx},${cy} ${cx},${cy} ${cx},${cy} ${cx},${cy}`;

  // Label positions (slightly outside the ring)
  const labelPositions = axes.map(({ angle, key, value }) => {
    const [lx, ly] = polarToXY(cx, cy, maxR + 10, angle);
    return { key, label: key, value: Math.round((value ?? 0) * 100), x: lx, y: ly };
  });

  return (
    <section
      className="glass-panel"
      style={{ padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h3
          className="font-bold uppercase"
          style={{
            fontSize: 11,
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.60)',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          System Metrics Radar
        </h3>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#00F0FF' }}>radar</span>
      </div>

      {/* SVG Radar */}
      <div className="relative" style={{ aspectRatio: '1', marginBottom: 16 }}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          style={{ transform: 'rotate(0deg)' }}
        >
          {/* Concentric ring guides */}
          {rings.map((pct) => {
            const ringPoints = axes.map(({ angle }) => {
              const [x, y] = polarToXY(cx, cy, maxR * pct, angle);
              return `${x},${y}`;
            }).join(' ');
            return (
              <polygon
                key={pct}
                points={ringPoints}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Axis spokes */}
          {axisEndpoints.map(([x, y], i) => (
            <line
              key={i}
              x1={cx} y1={cy} x2={x} y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
          ))}

          {/* Data polygon */}
          <polygon
            points={polygonPoints}
            fill="rgba(0, 240, 255, 0.10)"
            stroke="#00F0FF"
            strokeWidth="0.5"
            className={animated ? 'animate-radar' : ''}
            style={{
              transition: 'points 1.5s cubic-bezier(0.4,0,0.2,1)',
              filter: 'drop-shadow(0 0 4px rgba(0,240,255,0.4))',
            }}
          />

          {/* Vertex dots */}
          {animated && points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x} cy={y} r={1.5}
              fill="#00F0FF"
            />
          ))}
        </svg>

        {/* Axis labels — positioned around the SVG */}
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
          {labelPositions.map(({ key, label, value, x, y }) => {
            // Convert SVG coords (0-100) to percentage positions
            const leftPct = x;
            const topPct  = y;
            return (
              <div
                key={key}
                className="absolute font-bold"
                style={{
                  left:      `${leftPct}%`,
                  top:       `${topPct}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize:  9,
                  color:     key === 'EPS' ? '#e5b5ff' : key === 'BIS' ? '#00F0FF' : 'rgba(255,255,255,0.50)',
                  fontFamily: 'JetBrains Mono, monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                {label} ({value})
              </div>
            );
          })}
        </div>
      </div>

      {/* Score bars */}
      <div style={{ marginTop: 8 }}>
        {axes.map(({ key, value, color }) => {
          const pctVal = Math.round((value ?? 0) * 100);
          const barColor = key === 'BIS' ? '#A100F0' : '#00F0FF';
          return (
            <div key={key} className="flex items-center gap-3" style={{ marginBottom: 6 }}>
              <span
                className="uppercase font-bold"
                style={{
                  width: 30,
                  fontSize: 9,
                  letterSpacing: '0.05em',
                  color: 'rgba(255,255,255,0.50)',
                  fontFamily: 'Space Grotesk, sans-serif',
                }}
              >
                {key}
              </span>
              <div className="flex-1" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                <div
                  style={{
                    height: '100%',
                    width: animated ? `${pctVal}%` : '0%',
                    background: barColor,
                    transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
              </div>
              <span
                className="font-bold"
                style={{
                  width: 30,
                  textAlign: 'right',
                  fontSize: 9,
                  color: barColor,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {pctVal}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
