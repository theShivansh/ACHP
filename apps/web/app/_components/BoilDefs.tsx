// 05 §3.2: four static turbulence filters. The `.boil` classes in globals.css step
// through them with `steps(1)`; nothing here animates on its own.
export function BoilDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      {[11, 23, 37, 51].map((seed, i) => (
        <filter id={`boil-${i}`} key={seed} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.4} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ))}
    </svg>
  );
}
