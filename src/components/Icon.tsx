import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'grid'
  | 'swap'
  | 'users'
  | 'chart'
  | 'sliders'
  | 'plus'
  | 'arrowUp'
  | 'arrowDown'
  | 'wallet'
  | 'spark'
  | 'check'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'calendar'
  | 'search'
  | 'trash'
  | 'pencil'
  | 'download'
  | 'close';

const ICONS: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2.2" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8.5h13.5L14 5" />
      <path d="M20 15.5H6.5L10 19" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.9 19.6c.6-3.2 3.1-5.1 6.1-5.1s5.5 1.9 6.1 5.1" />
      <path d="M16.2 5.4a3 3 0 0 1 0 5.4" />
      <path d="M18 14.7c1.9.7 3.2 2.3 3.5 4.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V11" />
      <path d="M10 20V4.5" />
      <path d="M16 20v-6" />
      <path d="M2.5 20h19" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h8" />
      <path d="M17 7h3" />
      <circle cx="14.5" cy="7" r="2.3" />
      <path d="M4 17h3.5" />
      <path d="M12.5 17H20" />
      <circle cx="10" cy="17" r="2.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrowUp: <path d="M7 17 17 7M9 7h8v8" />,
  arrowDown: <path d="M17 7 7 17M15 17H7V9" />,
  wallet: (
    <>
      <path d="M3.5 9A2.5 2.5 0 0 1 6 6.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6A2.5 2.5 0 0 1 3.5 17z" />
      <path d="M3.5 9.5h13" />
      <circle cx="16.6" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  spark: <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />,
  check: <path d="m5 12.5 4.4 4.4L19 7" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5h5v2" />
      <path d="m6.5 7 1 13h9l1-13" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4.2L20 8.2a2.9 2.9 0 0 0-4.2-4.2L4 15.8z" />
      <path d="m14.5 5.5 4 4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m7.6 9.9 4.4 4.4 4.4-4.4" />
      <path d="M5 19.5h14" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
