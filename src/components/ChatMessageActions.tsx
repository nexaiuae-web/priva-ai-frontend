import { useCallback, useState } from "react";
import { Check, Copy, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

interface ChatMessageActionsProps {
  text: string;
  /** Dropdown alignment relative to trigger */
  menuAlign?: "start" | "end";
  className?: string;
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed);
      return true;
    }
  } catch {
    /* fallback below */
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = trimmed;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, trimmed.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function ChatMessageActions({
  text,
  menuAlign = "end",
  className,
}: ChatMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const canCopy = text.trim().length > 0;

  const handleCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message actions"
          className={cn(
            "inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-transparent text-[#A3B8B0] transition-colors",
            "hover:border-[#00E699]/25 hover:bg-[#041C15]/80 hover:text-[#00E699]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E699]/40",
            "data-[state=open]:border-[#00E699]/30 data-[state=open]:bg-[#041C15]/90 data-[state=open]:text-[#00E699]",
            !canCopy && "pointer-events-none opacity-40",
            className,
          )}
          disabled={!canCopy}
        >
          {copied ? (
            <Check size={18} strokeWidth={2} className="text-[#00E699]" />
          ) : (
            <MoreHorizontal size={18} strokeWidth={2} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={menuAlign}
        sideOffset={8}
        collisionPadding={12}
        className="z-[200] min-w-[9.5rem] overflow-hidden rounded-xl border border-[#00E699]/25 bg-[#041C15] p-1 text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
      >
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleCopy();
          }}
          disabled={!canCopy}
          className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white focus:bg-[#054232] focus:text-white data-[highlighted]:bg-[#054232]"
        >
          {copied ? (
            <Check size={16} className="shrink-0 text-[#00E699]" />
          ) : (
            <Copy size={16} className="shrink-0 text-[#00E699]/90" />
          )}
          <span className="font-medium">{copied ? "Copied!" : "Copy"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
