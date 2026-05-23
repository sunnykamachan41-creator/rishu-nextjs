import { statusConfig, type TicketStatus } from '@/lib/support'

export default function StatusBadge({ status }: { status: TicketStatus | string }) {
  const cfg = statusConfig(status)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}
