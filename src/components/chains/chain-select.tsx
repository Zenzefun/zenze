import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ChainMark } from "./chain-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAINS, chainById, type ChainKey } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { publicWalletError, useWallet } from "@/lib/wallet";

const KEYS = Object.keys(CHAINS) as ChainKey[];

export function NetworkSwitcher() {
  const { chainId, connected, switchChain, preferredChain, setPreferredChain } = useWallet();
  const live = chainById(chainId);
  const current = live ?? CHAINS[preferredChain];

  async function pick(key: ChainKey) {
    setPreferredChain(key);
    if (!connected) return;
    try {
      await switchChain(key);
    } catch (err) {
      toast.error(publicWalletError(err));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 text-xs font-medium whitespace-nowrap hover:bg-muted sm:gap-2 sm:px-2.5"
          aria-label="Choose network"
        >
          <ChainMark chain={current.key} className="size-4" />
          <span className="hidden md:inline">{current.compact}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {KEYS.map((key) => {
          const c = CHAINS[key];
          const on = (live?.key ?? preferredChain) === key;
          return (
            <DropdownMenuItem key={key} onSelect={() => void pick(key)}>
              <ChainMark chain={key} className="size-6" />
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              {on && <Check className="size-4 text-moss" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChainSelect({
  value,
  onChange,
  className,
}: {
  value: ChainKey;
  onChange: (key: ChainKey) => void;
  className?: string;
}) {
  const current = CHAINS[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 text-left text-sm hover:bg-muted",
            className,
          )}
          aria-label={current.name}
        >
          <ChainMark chain={value} className="size-7" />
          <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56">
        {KEYS.map((key) => {
          const c = CHAINS[key];
          return (
            <DropdownMenuItem key={key} onSelect={() => onChange(key)}>
              <ChainMark chain={key} className="size-6" />
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              {key === value && <Check className="size-4 text-moss" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
