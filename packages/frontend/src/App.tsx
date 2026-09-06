import { useState } from "react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { useAuth } from "@/lib/auth";

function App() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<"chat" | "dashboards">("chat");

  if (loading) {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <span className="mark mark-live size-10 animate-pulse" aria-hidden />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return view === "dashboards" ? (
    <DashboardView onClose={() => setView("chat")} />
  ) : (
    <ChatWindow onOpenDashboards={() => setView("dashboards")} />
  );
}

export default App;
