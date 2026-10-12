// SaafGadi mark: a rounded tile with a car and a sparkle (see Planning/preview.png).
// Drawn on a 64×64 grid so the favicon and app icons can share the geometry.

const VARIANTS = {
  /** Purple tile, white car, lime sparkle — the default. */
  purple: { tile: '#8B3FC7', car: '#FFFFFF', spark: '#DDF45B' },
  /** Lime tile, dark car, purple sparkle — for dark backgrounds. */
  lime: { tile: '#DDF45B', car: '#1E1B22', spark: '#8B3FC7' },
} as const;

export type LogoVariant = keyof typeof VARIANTS;

export function LogoMark({
  size = 36,
  variant = 'purple',
  className,
}: {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}) {
  const c = VARIANTS[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="15" fill={c.tile} />
      {/* Sparkle */}
      <path d="M49.5 7.5l1.7 5.1 5.1 1.7-5.1 1.7-1.7 5.1-1.7-5.1-5.1-1.7 5.1-1.7z" fill={c.spark} />
      {/* Car body */}
      <path
        d="M9 41.5v-5.2a3.3 3.3 0 0 1 3.3-3.3h7.4l5.6-8.1a3.4 3.4 0 0 1 2.8-1.5h10.4a3.4 3.4 0 0 1 2.8 1.5L47 33h5a3 3 0 0 1 3 3v5.5a2.5 2.5 0 0 1-2.5 2.5h-41A2.5 2.5 0 0 1 9 41.5z"
        fill={c.car}
      />
      {/* Windows */}
      <path d="M24.9 32.2l4.2-6.1h4.4v6.1z" fill={c.tile} />
      <path d="M36.4 26.1h3.1l4.3 6.1h-7.4z" fill={c.tile} />
      {/* Wheels */}
      {[21, 43].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={44} r={6.4} fill={c.tile} />
          <circle cx={cx} cy={44} r={4.6} fill={c.car} />
          <circle cx={cx} cy={44} r={1.7} fill={c.tile} />
        </g>
      ))}
    </svg>
  );
}

/** "SaafGadi" → ["Saaf", "Gadi"]: the second word takes the accent colour. */
export function splitWordmark(name: string): [string, string] {
  const m = /^([A-Z]?[a-z]+)([A-Z].*)$/.exec(name.trim());
  return m ? [m[1], m[2]] : [name, ''];
}
