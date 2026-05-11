export default function SidebarBrand() {
  return (
    <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
        >
          <span
            className="text-[11px] font-semibold tracking-tight"
            style={{ color: '#fff', fontFamily: "'DM Mono', monospace" }}
          >
            G
          </span>
        </div>
        <span
          className="text-[14px] font-semibold tracking-tight"
          style={{ color: 'var(--text-1)' }}
        >
          Game Studio
        </span>
      </div>
    </div>
  )
}
