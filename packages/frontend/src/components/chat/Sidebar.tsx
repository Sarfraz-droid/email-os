import {
  PanelLeft,
  Plus,
  ShieldCheck,
  MessageSquareText,
  Trash2,
  LogOut,
  X,
} from "lucide-react";
import type { ConversationSummary } from "@email-os/shared";
import { useAuth } from "@/lib/auth";

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onClose,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** Drawer state on screens below `lg`. */
  mobileOpen?: boolean;
  onClose?: () => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (c: ConversationSummary) => void;
  onDelete: (id: string) => void;
}) {
  const { user, logout } = useAuth();
  const hasChats = conversations.length > 0;
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  // The mobile drawer is always full-width; only the desktop rail collapses.
  const rail = collapsed && !mobileOpen;

  return (
    <aside
      data-collapsed={collapsed}
      data-open={mobileOpen}
      className="group/sb z-40 flex flex-col border-r border-border bg-sidebar [padding-left:env(safe-area-inset-left)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[280px] max-lg:transition-transform max-lg:duration-300 max-lg:ease-[cubic-bezier(0.16,1,0.3,1)] max-lg:data-[open=false]:-translate-x-full max-lg:data-[open=true]:translate-x-0 lg:shrink-0 lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.16,1,0.3,1)] data-[collapsed=false]:lg:w-[244px] data-[collapsed=true]:lg:w-[56px]"
    >
      {/* Brand + collapse */}
      <div
        className={`flex h-[52px] items-center border-b border-border px-3 ${
          rail ? "justify-center" : "justify-between gap-2"
        }`}
      >
        {!rail && (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="mark mark-live size-5 shrink-0" aria-hidden />
            <span className="truncate text-[0.9rem] font-semibold tracking-tight">
              Gmail<span className="text-muted-foreground">OS</span>
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground lg:grid"
        >
          <PanelLeft className={`size-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* New chat */}
      <div className="p-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-lg border border-strong bg-card px-2.5 py-2 text-sm font-medium text-foreground shadow-sm-x transition-all hover:border-primary/50 hover:bg-accent active:translate-y-px"
        >
          <Plus className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
          {!rail && <span>New chat</span>}
        </button>
      </div>

      {/* Conversation history */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!rail && (
          <p className="label-eq px-2 pt-2 pb-1 text-muted-foreground/60">History</p>
        )}
        {hasChats ? (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className="group/row relative">
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  title={c.title}
                  className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-7 pl-2 text-left text-[0.8rem] transition-colors hover:bg-card ${
                    c.id === activeId
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      c.id === activeId ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                  />
                  {!rail && <span className="truncate">{c.title}</span>}
                </button>
                {!rail && (
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    onClick={() => onDelete(c.id)}
                    className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !rail && (
            <div className="flex flex-col items-start gap-1.5 px-2 py-3 text-xs text-muted-foreground/60">
              <MessageSquareText className="size-4" />
              <span>Your conversations are saved here.</span>
            </div>
          )
        )}
      </nav>

      {/* Footer: account + privacy */}
      <div className="space-y-1 border-t border-border p-2">
        <div
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
            rail ? "justify-center" : ""
          }`}
        >
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[0.7rem] font-semibold text-primary"
            aria-hidden
          >
            {initial}
          </span>
          {!rail && (
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
              {user?.email}
            </span>
          )}
          {!rail && (
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
              className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-card hover:text-foreground"
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
        <div
          className={`flex items-center gap-2 rounded-md px-2 py-1 text-[0.7rem] text-muted-foreground ${
            rail ? "justify-center" : ""
          }`}
          title="Your mail stays with Google — only the model call leaves."
        >
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-400/80" />
          {!rail && <span>Private by design</span>}
        </div>
      </div>
    </aside>
  );
}
