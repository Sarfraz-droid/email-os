import { useState } from "react";
import { initialOf, senderAccent } from "@/lib/format";

/**
 * Sender identity mark: the company favicon when we can get one, falling back to
 * a colour-keyed initial. Set VITE_FAVICON_BASE to "" to disable the lookup
 * entirely (nothing about the inbox then leaves the machine), or point it at a
 * backend proxy.
 */
const FAVICON_BASE =
  import.meta.env.VITE_FAVICON_BASE ?? "https://www.google.com/s2/favicons?sz=64&domain=";

// Consumer mail hosts: the domain says nothing useful, so skip straight to initials.
const GENERIC = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

function domainOf(from: string): string | null {
  const addr = from.match(/<([^>]+)>/)?.[1] ?? from;
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const host = addr
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/[>\s]+$/, "");
  if (!host.includes(".")) return null;
  // Collapse a sending subdomain (mail.notifications.swiggy.in → swiggy.in).
  const parts = host.split(".");
  const base = parts.length > 2 ? parts.slice(-2).join(".") : host;
  return GENERIC.has(base) ? null : base;
}

export function SenderAvatar({
  from,
  className = "size-4 text-[0.6rem]",
}: {
  from: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const accent = senderAccent(from);
  const domain = FAVICON_BASE ? domainOf(from) : null;
  const showImg = domain && !failed;

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold ${className}`}
      style={{ background: accent.bg, color: accent.fg }}
      aria-hidden
    >
      {!loaded && initialOf(from)}
      {showImg && (
        <img
          src={`${FAVICON_BASE}${encodeURIComponent(domain)}`}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}
