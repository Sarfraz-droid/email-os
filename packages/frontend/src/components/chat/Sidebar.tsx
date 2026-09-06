import { PanelLeft, Plus, ShieldCheck, MessageSquareText, Trash2, LogOut } from "lucide-react";
import type { ConversationSummary } from "@email-os/shared";
import { useAuth } from "@/lib/auth";

export function Sidebar({
  collapsed,
  onToggle,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
}: {
  collapsed: boolean;
  onToggle: () => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (c: ConversationSummary) => void;
  onDelete: (id: string) => void;
}) {
  const { user, logout } = useAuth();
  const hasChats = conversations.length > 0;
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <aside
      data-collapsed={collapsed}
      className="group/sb flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[collapsed=true]:w-[56px] data-[collapsed=false]:w-[244px]"
    >
      {/* Brand + collapse */}
      <div
        className={`flex h-[52px] items-center border-b border-border px-3 ${
          collapsed ? "justify-center" : "justify-between gap-2"
        }`}
      >
        {!collapsed && (
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
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <PanelLeft className={`size-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
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
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      {/* Conversation history */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!collapsed && (
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
                  {!collapsed && <span className="truncate">{c.title}</span>}
                </button>
                {!collapsed && (
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
          !collapsed && (
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
            collapsed ? "justify-center" : ""
          }`}
        >
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[0.7rem] font-semibold text-primary"
            aria-hidden
          >
            {initial}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
              {user?.email}
            </span>
          )}
          {!collapsed && (
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
            collapsed ? "justify-center" : ""
          }`}
          title="Your mail stays with Google — only the model call leaves."
        >
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-400/80" />
          {!collapsed && <span>Private by design</span>}
        </div>
      </div>
    </aside>
  );
}
