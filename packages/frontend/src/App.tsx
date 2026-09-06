import { ChatWindow } from "@/components/chat/ChatWindow";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { useAuth } from "@/lib/auth";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <span className="mark mark-live size-10 animate-pulse" aria-hidden />
      </div>
    );
  }

  return user ? <ChatWindow /> : <LoginScreen />;
}

export default App;
