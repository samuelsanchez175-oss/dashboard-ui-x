import type { ReactNode } from 'react';

type SectionHeaderProps = {
  children: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
};

export function SectionHeader({ children, trailing, size = 'sm', className }: SectionHeaderProps) {
  if (size === 'sm') {
    return (
      <div
        className={className}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-3)',
            fontFamily: "var(--font-mono, 'DM Mono', monospace)",
          }}
        >
          {children}
        </div>
        {trailing ? <div>{trailing}</div> : null}
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
    >
      <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
        {children}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}
