import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addOperatorWallet, listOperators } from "@/lib/server/admin";
import { formatAddress, timeAgo } from "@/lib/format";
import type { AdminRole } from "@/lib/types";

export const Route = createFileRoute("/arise/users")({ component: AdminUsers });

function AdminUsers() {
  const q = useQuery({ queryKey: ["operators"], queryFn: () => listOperators(), retry: false });
  const [wallet, setWallet] = useState("");
  const [role, setRole] = useState<AdminRole>("moderator");
  const add = useMutation({
    mutationFn: () => addOperatorWallet({ data: { wallet, role } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Operator added.");
        setWallet("");
        void q.refetch();
      }
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Operators</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Desk access is the protocol wallet plus any address added here. Sign-in is a 12-hour wallet signature — no email seats.
      </p>
      <form
        className="mt-6 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_8rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="op-wallet">Wallet</Label>
          <Input id="op-wallet" className="font-mono" placeholder="0x…" value={wallet} onChange={(e) => setWallet(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="op-role">Role</Label>
          <select
            id="op-role"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
          >
            <option value="super_admin">super admin</option>
            <option value="moderator">moderator</option>
            <option value="analyst">analyst</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="gold" disabled={add.isPending}>
            Add
          </Button>
        </div>
      </form>
      <ul className="mt-6 divide-y divide-border">
        {(q.data ?? []).length === 0 && <li className="py-4 text-sm text-muted-foreground">No operator wallets recorded yet.</li>}
        {(q.data ?? []).map((u) => (
          <li key={u.wallet} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="font-mono text-xs sm:text-sm">{formatAddress(u.wallet)}</span>
            <span className="break-all font-mono text-[11px] text-muted-foreground">{u.wallet}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{u.role.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(u.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
