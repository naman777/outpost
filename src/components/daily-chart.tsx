"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { day: string; sent: number; opened: number; replied: number; bounced: number };

export function DailyChart({ data }: { data: Row[] }) {
  const rows = data.map((r) => ({ ...r, label: r.day.slice(5) }));
  return (
    <div>
      <div className="h-56 min-w-0 sm:h-64">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={1}>
            <CartesianGrid vertical={false} stroke="rgba(128,128,128,0.2)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b8b94" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis width="auto" allowDecimals={false} tick={{ fontSize: 11, fill: "#8b8b94" }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(128,128,128,0.12)" }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-zinc-200)", background: "var(--color-white)", color: "var(--page-fg)" }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sent" name="Sent" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
            <Bar dataKey="opened" name="Estimated opens" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            <Bar dataKey="replied" name="Replied" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="bounced" name="Bounced" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.length > 0 && (
        <details className="mt-2 border-t border-zinc-200 pt-1">
          <summary className="cursor-pointer py-3 text-sm font-medium text-zinc-700">View daily counts</summary>
          <table aria-label="Daily counts" className="w-full table-fixed text-left text-xs tabular-nums sm:text-sm">
            <thead className="border-b border-zinc-200 text-zinc-600">
              <tr>
                <th scope="col" className="w-[25%] py-2 font-medium">Date</th>
                <th scope="col" className="py-2 text-right font-medium">Sent</th>
                <th scope="col" className="py-2 text-right font-medium">Est. opens</th>
                <th scope="col" className="py-2 text-right font-medium">Replied</th>
                <th scope="col" className="py-2 text-right font-medium">Bounced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.day}>
                  <th scope="row" className="py-2 font-medium"><time dateTime={r.day}>{r.label}</time></th>
                  <td className="py-2 text-right">{r.sent}</td>
                  <td className="py-2 text-right">{r.opened}</td>
                  <td className="py-2 text-right">{r.replied}</td>
                  <td className="py-2 text-right">{r.bounced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
