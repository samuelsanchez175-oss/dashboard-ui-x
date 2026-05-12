import type { ReactNode } from 'react';

type PageShellProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  maxWidth?: '3xl' | '5xl' | '7xl' | 'full';
  children: ReactNode;
};

const maxWidthMap = {
  '3xl': '768px',
  '5xl': '1024px',
  '7xl': '1280px',
  full: '100%',
};

export function PageShell({ title, subtitle, actions, maxWidth = '5xl', children }: PageShellProps) {
  return (
    <div
      style={{
        maxWidth: maxWidthMap[maxWidth],
        margin: '0 auto',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
      }}
    >
      <header
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'var(--text-1)',
              margin: 0,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <div style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: 1.5 }}>{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>{children}</div>
    </div>
  );
}
