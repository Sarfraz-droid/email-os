import { Sparkles, Receipt, Paperclip, MailQuestion } from "lucide-react";
import { MessageInput } from "./MessageInput";

const SUGGESTIONS: { icon: typeof Sparkles; label: string; prompt: string }[] = [
  {
    icon: Sparkles,
    label: "Summarize today's unread",
    prompt: "Summarize my unread email from today",
  },
  {
    icon: Paperclip,
    label: "Find a certificate",
    prompt: "Find my Swiggy internship certificate",
  },
  {
    icon: Receipt,
    label: "Last 30 days of UPI",
    prompt: "List my HDFC UPI transactions from the last 30 days",
  },
  {
    icon: MailQuestion,
    label: "Waiting on a reply",
    prompt: "Which emails are still waiting on a reply?",
  },
];

export function Hero({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
      <div className="msg-in flex w-full max-w-2xl flex-col items-center gap-7 text-center">
        <span className="mark mark-live size-11" aria-hidden />

        <h2 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[2.4rem]">
          What&rsquo;s in your inbox?
        </h2>

        <MessageInput disabled={disabled} onSend={onSend} variant="hero" autoFocus />

        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => onSend(prompt)}
              className="group flex items-center gap-1.5 rounded-full border border-strong bg-card/70 px-3 py-1.5 text-[0.8rem] text-muted-foreground shadow-sm-x transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:text-foreground"
            >
              <Icon className="size-3.5 text-muted-foreground/60 transition-colors group-hover:text-primary" />
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/60">
          The answer comes first — the underlying messages stay one tap away.
        </p>
      </div>
    </div>
  );
}
