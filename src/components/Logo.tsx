interface LogoProps {
  size?: number;
  /** brand: forest shell, lime seam. light: cream shell for dark panels. */
  tone?: 'brand' | 'light';
  withWordmark?: boolean;
  className?: string;
}

/**
 * Walnut mark: a two-lobed shell with a lime seam and a leaf. Drawn on a 64-unit grid
 * so the same shape stays readable from a 16px favicon up to the auth screen.
 */
export function Logo({ size = 28, tone = 'brand', withWordmark = false, className }: LogoProps) {
  // Light tone mirrors the app icon exactly: lime shell, forest seam, mint leaf.
  const shell = tone === 'light' ? '#c9f25e' : '#0e3b2a';
  const seam = tone === 'light' ? '#0e3b2a' : '#c9f25e';
  const leaf = tone === 'light' ? '#dff3e4' : '#147a4f';

  return (
    <span className={`logo logo-${tone}${className ? ` ${className}` : ''}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M32 5.8C43.5 5.8 56.6 15.4 56.6 30.2C56.6 45.2 45.6 58.2 32 58.2C18.4 58.2 7.4 45.2 7.4 30.2C7.4 15.4 20.5 5.8 32 5.8Z"
          fill={shell}
        />
        <path
          d="M32 9.4C28.2 17.4 35.8 23.4 32 31.8C28.2 40.2 35.8 46.2 32 55"
          stroke={seam}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M34.6 10.4C37.2 4.6 44 1.8 49.6 2.8C49.1 8.6 42.8 12.8 36.6 12.1C35.8 11.7 35.1 11.1 34.6 10.4Z"
          fill={leaf}
        />
      </svg>
      {withWordmark && <span className="logo-word">Walnut</span>}
    </span>
  );
}
