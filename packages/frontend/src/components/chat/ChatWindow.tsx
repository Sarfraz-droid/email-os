import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import type { ConversationSummary } from "@email-os/shared";
import { useChatStream } from "@/hooks/useChatStream";
import { deleteConversation, listConversations } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import { Hero } from "./Hero";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { Button } from "@/components/ui/button";

const SIDEBAR_KEY = "gmailos:sidebar-collapsed";

export function ChatWindow() {
  const { gmailConnected, login } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const refreshConversations = useCallback(() => {
    listConversations()
      .then(setConversations)
      .catch(() => {
        /* leave the current list in place */
      });
  }, []);

  const { messages, conversationId, isStreaming, sendMessage, startNew, openConversation } =
    useChatStream({
      onConversationCreated: (summary) => {
        setConversations((prev) => [
          { id: summary.id, title: summary.title, updatedAt: new Date().toISOString() },
          ...prev,
        ]);
      },
    });

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // After a turn finishes, pick up the new title / ordering.
  useEffect(() => {
    if (!isStreaming) refreshConversations();
  }, [isStreaming, refreshConversations]);

  // Mobile drawer: lock scroll + close on Escape while open.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const closeNav = () => setNavOpen(false);

  const handleNewChat = () => {
    startNew();
    closeNav();
  };
  const handleSelect = (c: ConversationSummary) => {
    openConversation(c);
    closeNav();
  };
  const handleDelete = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) startNew();
    await deleteConversation(id);
  };

  const empty = messages.length === 0;

  const status = gmailConnected
    ? { dot: "bg-emerald-400", text: "Gmail connected", tone: "text-muted-foreground" }
    : { dot: "bg-amber-400", text: "Not connected", tone: "text-amber-300/90" };

  return (
    <div className="flex h-svh w-full overflow-hidden">
      {/* Scrim behind the mobile drawer */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeNav}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        mobileOpen={navOpen}
        onClose={closeNav}
        conversations={conversations}
        activeId={conversationId}
        onNewChat={handleNewChat}
        onSelect={handleSelect}
        onDelete={handleDelete}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="surface-blur z-20 flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs ${status.tone}`}>
              <span className={`size-1.5 rounded-full ${status.dot}`} />
              {status.text}
            </span>
            {!gmailConnected && (
              <Button
                size="sm"
                className="h-7 bg-primary px-2.5 text-primary-foreground hover:bg-primary/90"
                onClick={login}
              >
                Connect
              </Button>
            )}
          </div>
        </header>

        {empty ? (
          <Hero disabled={isStreaming} onSend={sendMessage} />
        ) : (
          <>
            <MessageList messages={messages} />
            <div className="shrink-0">
              <MessageInput disabled={isStreaming} onSend={sendMessage} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
