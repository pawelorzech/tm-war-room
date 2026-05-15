"use client";

type IconProps = {
  name: string;
  size?: number;
  className?: string;
};

const ALIASES: Record<string, string> = {
  "🏠": "home",
  "⚔️": "sword",
  "🎯": "target",
  "👁️": "eye",
  "🔍": "search",
  "⚖️": "scale",
  "💵": "cash",
  "📊": "chart",
  "🔗": "chain",
  "💰": "cash",
  "🛒": "cart",
  "📉": "stocks",
  "💚": "heart",
  "✈️": "plane",
  "🏢": "building",
  "💼": "briefcase",
  "👥": "users",
  "🟢": "activity",
  "🕴️": "oc",
  "🛡️": "shield",
  "📈": "chart-up",
  "🔔": "bell",
  "⚙️": "settings",
  "💪": "dumbbell",
  "🏆": "trophy",
  "📚": "book",
  "📖": "book-open",
  "🔧": "wrench",
  "❓": "help",
  "📋": "clipboard",
  "📨": "inbox",
  "💬": "chat",
  "💡": "lightbulb",
  "🔀": "shuffle",
  "📌": "pin",
  "☀️": "sun",
  "🌙": "moon",
  "🎲": "dice",
  "📢": "megaphone",
  "👑": "crown",
};

function iconKey(name: string): string {
  return ALIASES[name] || name;
}

export function AppIcon({ name, size = 18, className = "" }: IconProps) {
  const key = iconKey(name);
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `inline-block shrink-0 ${className}`,
    "aria-hidden": true,
  };

  switch (key) {
    case "home":
      return <svg {...common}><path d="M3 10.8 12 3l9 7.8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>;
    case "inbox":
      return <svg {...common}><path d="M4 5h16l-2 14H6L4 5Z" /><path d="M4 5l8 8 8-8" /><path d="M8 15h8" /></svg>;
    case "chat":
      return <svg {...common}><path d="M5 6h14v10H8l-4 4V6Z" /><path d="M8 10h8" /><path d="M8 13h5" /></svg>;
    case "browse":
      return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
    case "star":
      return <svg {...common}><path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8L6.8 19l1-5.8-4.2-4.1 5.8-.8L12 3Z" /></svg>;
    case "pin":
      return <svg {...common}><path d="m15 4 5 5-4 1-3 4v4l-2 2-7-7 2-2h4l4-3 1-4Z" /><path d="m9 15-5 5" /></svg>;
    case "sword":
      return <svg {...common}><path d="M14.5 4.5 20 4l-.5 5.5L8 21l-5-5L14.5 4.5Z" /><path d="m13 7 4 4" /><path d="m5 14 5 5" /></svg>;
    case "target":
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
    case "eye":
      return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "scale":
      return <svg {...common}><path d="M12 3v18" /><path d="M5 6h14" /><path d="m6 6-3 6h6L6 6Z" /><path d="m18 6-3 6h6l-3-6Z" /></svg>;
    case "cash":
      return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9v.01M18 15v.01" /></svg>;
    case "chart":
    case "chart-up":
    case "stocks":
      return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 3 5-7" /></svg>;
    case "chain":
      return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1 1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1-1" /></svg>;
    case "cart":
      return <svg {...common}><path d="M4 5h2l2 10h9l2-7H7" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>;
    case "heart":
      return <svg {...common}><path d="M20.5 8.5c0 5-8.5 10-8.5 10s-8.5-5-8.5-10A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5Z" /></svg>;
    case "plane":
      return <svg {...common}><path d="M22 3 2 11l8 3 3 8 9-19Z" /><path d="m10 14 5-5" /></svg>;
    case "building":
      return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" /></svg>;
    case "briefcase":
      return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2" /><path d="M3 12h18" /></svg>;
    case "users":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /><path d="M22 21v-2a3 3 0 0 0-3-3" /><path d="M2 21v-2a3 3 0 0 1 3-3" /></svg>;
    case "activity":
      return <svg {...common}><path d="M4 12h4l2-6 4 12 2-6h4" /></svg>;
    case "oc":
      return <svg {...common}><path d="M7 21v-4a5 5 0 0 1 10 0v4" /><circle cx="12" cy="7" r="4" /><path d="M9 11h6" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /></svg>;
    case "bell":
      return <svg {...common}><path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
    case "dumbbell":
      return <svg {...common}><path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" /></svg>;
    case "trophy":
      return <svg {...common}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4a4 4 0 0 0 4 4M16 6h4a4 4 0 0 1-4 4" /><path d="M12 13v5M9 21h6" /></svg>;
    case "book":
    case "book-open":
      return <svg {...common}><path d="M4 5a3 3 0 0 1 3-2h13v17H7a3 3 0 0 0-3 2V5Z" /><path d="M4 19a3 3 0 0 1 3-2h13" /></svg>;
    case "wrench":
      return <svg {...common}><path d="M14 6a5 5 0 0 0 6 6L10 22l-6-6L14 6Z" /><path d="m4 16 4 4" /></svg>;
    case "help":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.6-1.5 1.1-1.5 2.5" /><path d="M12 17h.01" /></svg>;
    case "clipboard":
      return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 10h6M9 14h6" /></svg>;
    case "lightbulb":
      return <svg {...common}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.5-1 2H9c0-.5-.2-1.3-1-2Z" /></svg>;
    case "shuffle":
      return <svg {...common}><path d="M16 3h5v5" /><path d="M4 7h3c4 0 5 10 10 10h4" /><path d="M21 16v5h-5" /><path d="M4 17h3c1.6 0 2.8-1 3.8-2.4" /><path d="M14 8.5C15 7.6 16 7 17 7h4" /></svg>;
    case "sun":
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case "moon":
      return <svg {...common}><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z" /></svg>;
    case "megaphone":
      return <svg {...common}><path d="M4 13h3l10 5V6L7 11H4v2Z" /><path d="M7 13v5" /></svg>;
    case "dice":
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 8h.01M12 12h.01M16 16h.01M16 8h.01M8 16h.01" /></svg>;
    case "crown":
      return <svg {...common}><path d="m3 8 5 5 4-8 4 8 5-5-2 11H5L3 8Z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v8M8 12h8" /></svg>;
  }
}
