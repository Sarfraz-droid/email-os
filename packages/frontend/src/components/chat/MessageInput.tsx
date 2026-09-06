import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

export function MessageInput({
  disabled,
  onSend,
  variant = "docked",
  autoFocus,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
  variant?: "docked" | "hero";
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const hero = variant === "hero";

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, hero ? 240 : 208)}px`;
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div className={hero ? "w-full" : "px-4 pb-3"}>
      <div className={`mx-auto w-full ${hero ? "max-w-2xl" : "max-w-xl"}`}>
        <div
          className={`shadow-pop-x flex items-end gap-2 rounded-2xl border border-strong transition-colors focus-within:border-primary/60 ${
            hero ? "bg-card p-1.5 pl-4" : "surface-blur p-1.5 pl-3.5"
          }`}
        >
          <textarea
            ref={ref}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              resize(e.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled ? "Working…" : hero ? "Type a question or a command…" : "Message your inbox"
            }
            rows={1}
            disabled={disabled}
            className={`min-h-8 flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground/70 disabled:opacity-60 ${
              hero ? "max-h-60 py-1.5 text-[0.95rem]" : "max-h-52 py-2 text-sm"
            }`}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className={`mb-px flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 ${
              hero ? "size-9" : "size-8"
            }`}
          >
            <ArrowUp className={hero ? "size-[18px]" : "size-4"} strokeWidth={2.5} />
          </button>
        </div>
        {!hero && (
          <p className="mt-2 px-1 text-center text-[0.68rem] text-muted-foreground/60">
            <kbd className="font-sans">Enter</kbd> to send ·{" "}
            <kbd className="font-sans">Shift</kbd>+<kbd className="font-sans">Enter</kbd> for a
            new line
          </p>
        )}
      </div>
    </div>
  );
}
