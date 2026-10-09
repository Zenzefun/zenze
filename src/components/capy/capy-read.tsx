import type { CapyLine } from "@/lib/capy-read";

export function CapyReadView({ lines, note }: { lines: CapyLine[]; note: string }) {
  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-sm text-muted-foreground">{line.label}</dt>
            <dd className="text-right">
              <div className="text-sm font-medium tabular-nums">{line.value}</div>
              {line.hint ? <div className="text-xs font-normal text-muted-foreground tabular-nums">{line.hint}</div> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm leading-6">{note}</p>
    </div>
  );
}
