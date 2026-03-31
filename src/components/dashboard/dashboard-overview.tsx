import { useComputerOsBreakdown } from "@/hooks/use-ad-reports";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const chartTooltipStyle: React.CSSProperties = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-foreground)",
};

const chartTooltipItemStyle: React.CSSProperties = {
  color: "var(--color-foreground)",
};

const chartTooltipLabelStyle: React.CSSProperties = {
  color: "var(--color-muted-foreground)",
};

const DONUT_COLORS = [
  "var(--color-success)",
  "hsl(218 20% 55%)",
  "var(--color-destructive)",
];

const DONUT_GLOW: Record<string, string> = {
  Enabled: "var(--color-success)",
  Disabled: "hsl(218 20% 55%)",
  Locked: "var(--color-destructive)",
};

const BAR_COLORS = [
  "var(--color-primary)",
  "hsl(215 85% 60%)",
  "hsl(152 60% 45%)",
  "hsl(280 60% 60%)",
  "hsl(340 65% 55%)",
  "hsl(24 85% 55%)",
  "hsl(190 70% 50%)",
  "hsl(45 90% 50%)",
];

export default function DashboardOverview({ stats }: { stats: any }) {
  const { data: osBreakdown } = useComputerOsBreakdown();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      <UserStatusChart stats={stats} />
      <OsBreakdownChart data={osBreakdown} />
    </div>
  );
}

function UserStatusChart({ stats }: { stats: any }) {
  const total = stats?.total_users ?? 0;
  const data = [
    { name: "Enabled", value: (stats?.enabled_users ?? 0) - (stats?.locked_users ?? 0) },
    { name: "Disabled", value: stats?.disabled_users ?? 0 },
    { name: "Locked", value: stats?.locked_users ?? 0 },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden min-h-[280px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-4">
        User Status
      </p>
      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 items-center">
        <div className="dashboard-donut-chart relative mx-auto h-[220px] w-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer={false}>
              <defs>
                {data.map((d) => (
                  <filter key={d.name} id={`glow-${d.name}`}>
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor={DONUT_GLOW[d.name]} floodOpacity="0.35" />
                    <feComposite in2="blur" operator="in" />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                ))}
              </defs>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                activeShape={{ stroke: "none", strokeWidth: 0 }}
                cornerRadius={5}
                rootTabIndex={-1}
              >
                {data.map((d, i) => (
                  <Cell
                    key={d.name}
                    fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                    filter={`url(#glow-${d.name})`}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={chartTooltipStyle}
                itemStyle={chartTooltipItemStyle}
                labelStyle={chartTooltipLabelStyle}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[28px] font-bold font-mono leading-none">{total.toLocaleString()}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">total</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 justify-center">
          {data.map((d, i) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <div key={d.name} className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-[4px] shrink-0"
                  style={{
                    background: DONUT_COLORS[i % DONUT_COLORS.length],
                    boxShadow: `0 0 6px ${DONUT_GLOW[d.name]}40`,
                  }}
                />
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium text-foreground">{d.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {d.value.toLocaleString()} ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OsBreakdownChart({ data }: { data: any[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-center text-muted-foreground text-sm min-h-[180px]">
        No OS data available
      </div>
    );
  }

  const chartData = data.slice(0, 8).map((d: any, i: number) => ({
    os: shortenOs(d.os || d.Os || "Unknown"),
    count: d.Count ?? d.count ?? 0,
    fill: BAR_COLORS[i % BAR_COLORS.length],
  }));

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-4">
        Operating Systems
      </p>
      <div className="flex flex-col gap-2.5">
        {chartData.map((d) => {
          const pct = Math.max((d.count / maxCount) * 100, 2);
          return (
            <div key={d.os} className="flex items-center gap-3 group">
              <span className="text-[11px] text-muted-foreground w-[110px] truncate shrink-0 text-right font-mono">
                {d.os}
              </span>
              <div className="flex-1 h-5 rounded-md bg-secondary/60 overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-500 ease-out relative"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${d.fill}, color-mix(in srgb, ${d.fill} 70%, white))`,
                    boxShadow: `0 0 8px ${d.fill}30`,
                  }}
                />
              </div>
              <span className="text-[11px] font-semibold font-mono w-8 text-right tabular-nums">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortenOs(os: string): string {
  return os
    .replace("Microsoft Windows ", "Win ")
    .replace("Windows Server ", "WinSrv ")
    .replace(" Standard", "")
    .replace(" Datacenter", " DC")
    .replace(" Enterprise", " Ent")
    .replace(" Professional", " Pro");
}
