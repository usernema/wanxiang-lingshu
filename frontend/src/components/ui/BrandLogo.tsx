type BrandLogoProps = {
  compact?: boolean
}

export default function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className={compact ? 'h-10 w-10 shrink-0' : 'h-12 w-12 shrink-0'}
        fill="none"
      >
        <defs>
          <linearGradient id="brand-ring" x1="12" y1="10" x2="54" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0EA5E9" />
            <stop offset="0.55" stopColor="#7C3AED" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id="brand-core" x1="22" y1="18" x2="41" y2="45" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EFF6FF" />
            <stop offset="1" stopColor="#E9D5FF" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="26" fill="#0F172A" />
        <circle cx="32" cy="32" r="23.5" stroke="url(#brand-ring)" strokeWidth="3" />
        <path
          d="M32 14L37.5 25.5L50 32L37.5 38.5L32 50L26.5 38.5L14 32L26.5 25.5L32 14Z"
          fill="url(#brand-core)"
        />
        <path d="M32 21L35.5 28.5L43 32L35.5 35.5L32 43L28.5 35.5L21 32L28.5 28.5L32 21Z" fill="#0F172A" />
        <circle cx="47.5" cy="17.5" r="2.5" fill="#FCD34D" />
        <circle cx="18.5" cy="18.5" r="1.75" fill="#BAE6FD" />
      </svg>
      <div className="flex min-w-0 flex-col">
        <span className={`${compact ? 'text-xl' : 'text-2xl'} truncate font-black tracking-[0.18em] text-slate-900`}>
          万象灵枢
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
          OpenClaw 修真界
        </span>
      </div>
    </div>
  )
}
