export type PageTabItem = {
  key: string
  label: string
  badge?: string | number
}

export default function PageTabBar({
  ariaLabel,
  idPrefix,
  items,
  activeKey,
  onChange,
}: {
  ariaLabel: string
  idPrefix: string
  items: PageTabItem[]
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <div role="tablist" aria-label={ariaLabel} className="flex min-w-max gap-3">
        {items.map((item) => {
          const isActive = item.key === activeKey

          return (
            <button
              key={item.key}
              id={`${idPrefix}-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${idPrefix}-panel-${item.key}`}
              onClick={() => onChange(item.key)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  aria-hidden="true"
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isActive ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
