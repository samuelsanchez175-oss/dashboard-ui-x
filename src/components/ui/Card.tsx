import { type ReactNode, type HTMLAttributes, forwardRef } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'md' | 'lg' | 'xl';
  interactive?: boolean;
  children?: ReactNode;
};

const padMap = { none: '0', sm: '12px', md: '20px', lg: '24px' };
const radiusMap = { md: '8px', lg: '12px', xl: '16px' };

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', radius = 'lg', interactive = false, className, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-interactive={interactive ? 'true' : undefined}
      className={className}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        borderRadius: radiusMap[radius],
        padding: padMap[padding],
        transition: interactive ? 'background 120ms ease, border-color 120ms ease' : undefined,
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardTitle({ children, className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.25, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardSubtitle({ children, className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: 1.5, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
