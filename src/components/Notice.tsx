import { BadgeCheck, CircleAlert, Clock, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NoticeTone = 'caution' | 'stale' | 'danger' | 'info' | 'success';

const TONE: Record<NoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  caution: { box: 'border-caution-line bg-caution-bg text-caution-fg', icon: 'text-caution-icon', Icon: TriangleAlert },
  stale: { box: 'border-stale-line bg-stale-bg text-stale-fg', icon: 'text-stale-fg', Icon: Clock },
  danger: { box: 'border-danger-line bg-danger-bg text-danger-fg', icon: 'text-danger-fg', Icon: CircleAlert },
  info: { box: 'border-info-line bg-info-bg text-info-fg', icon: 'text-info-fg', Icon: Info },
  success: { box: 'border-instock-line bg-instock-bg text-instock-fg', icon: 'text-instock-fg', Icon: BadgeCheck },
};

/**
 * Inline callout for things the user must notice before acting.
 * Use `urgent` (role="alert") only for problems found at render time that change the decision.
 */
export function Notice({
  tone,
  title,
  children,
  action,
  urgent = false,
  className,
}: {
  tone: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  urgent?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div role={urgent ? 'alert' : undefined} className={cn('flex gap-3 rounded-lg border p-4', t.box, className)}>
      <t.Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', t.icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="text-base leading-snug font-bold">{title}</p>}
        {children && <div className="text-[0.9375rem] leading-relaxed">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
