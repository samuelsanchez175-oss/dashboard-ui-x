import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

const sizeMap = { sm: 16, md: 20, lg: 24 } as const;
export type IconSize = keyof typeof sizeMap;

type IconProps = {
  icon: LucideIcon;
  size?: IconSize;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
};

export function Icon({
  icon: Cmp,
  size = 'sm',
  strokeWidth = 2,
  className,
  style,
  ...a11y
}: IconProps) {
  const px = sizeMap[size];
  const label = a11y['aria-label'];
  return (
    <Cmp
      width={px}
      height={px}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-hidden={!label}
      {...a11y}
    />
  );
}
