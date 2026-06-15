// Minimal inline icon set (1.6px stroke, 16px grid) — avoids an icon dep.

type P = { size?: number; className?: string };

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const ChevronLeft = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);

export const ChevronRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export const ReportIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M2.5 6.5h11M6 6.5v7" />
  </svg>
);

export const TimelineIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 4.5h7M3 8h9.5M3 11.5h5" />
  </svg>
);

export const HistoryIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 8a5 5 0 1 1 1.7 3.8M3 8H1.6M3 8V6.4" />
    <path d="M8 5.5V8l1.8 1.1" />
  </svg>
);

export const SearchIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3 3" />
  </svg>
);

export const ArrowRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" />
  </svg>
);

export const BoltIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8.5 1.5 3.5 9H7l-.5 5.5L12 6.5H8z" />
  </svg>
);

export const RefreshIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13.4 8a5.4 5.4 0 1 1-1.58-3.82" />
    <path d="M13.6 3.2v3.2h-3.2" />
  </svg>
);
