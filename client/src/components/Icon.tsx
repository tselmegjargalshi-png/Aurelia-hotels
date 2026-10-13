/** Minimal line-icon set (1.5px strokes) — decorative unless given a label. */
const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.35-4.35',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0m1-9.5a3 3 0 1 0 0-6m2 15.5a5 5 0 0 0-3-4.6',
  heart: 'M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z',
  star: 'm12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  'chevron-left': 'm15 5-7 7 7 7',
  'chevron-right': 'm9 5 7 7-7 7',
  'chevron-down': 'm5 9 7 7 7-7',
  check: 'm5 12 5 5 9-10',
  pin: 'M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  bed: 'M3 18V7m0 7h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
  ruler: 'M4 15 15 4l5 5L9 20zM8 11l2 2m1-5 2 2m1-5 2 2',
  coffee: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3m3-3v3m3-3v3',
  shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z',
  filter: 'M4 6h16M7 12h10m-7 6h4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4l3 2',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v5m0-8.5v.01',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  spa: 'M12 20c-4 0-8-3-8-8 4 0 8 3 8 8zm0 0c4 0 8-3 8-8-4 0-8 3-8 8zm0 0V9m0 0c-1.5-1.5-2-3.5-1-6 2.5 1 3 4 1 6z',
  dish: 'M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5',
  pool: 'M3 18c2 0 2-1.5 4.5-1.5S9.5 18 12 18s2-1.5 4.5-1.5S19 18 21 18M8 15V5a2 2 0 0 1 4 0m-4 4h6m0 6V5a2 2 0 0 1 4 0',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h11',
  grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  mail: 'M4 6h16v12H4zm0 0 8 7 8-7',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
};

export function Icon({ name, size = 18, label, className, filled }: { name: keyof typeof PATHS | string; size?: number; label?: string; className?: string; filled?: boolean }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" className={['icon', className].filter(Boolean).join(' ')}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
