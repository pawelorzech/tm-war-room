// Shared CSS for the Shadow-DOM card overlays — armoury, OC, stocks, travel,
// loot, profile-intel. Each overlay appends its own specifics to this base.
// Centralised here so the duplicated block isn't paid 6× in the minified
// bundle — pulls ~1 KiB of headroom back under the 150 KiB budget.
//
// The `accent` parameter is the left-rail accent + title/link colour. Each
// overlay picks its own hex (gold, blue, green, etc).

export function cardBase(accent: string): string {
  return `
:host{all:initial;display:block;width:100%}
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.card{background:linear-gradient(135deg,#161b22 0%,#1c2128 100%);border:1px solid #30363d;border-left:3px solid ${accent};border-radius:8px;padding:12px;margin:8px 0;color:#c9d1d9;font-size:12px;line-height:1.45;width:100%;display:block}
.head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.title{font-weight:700;color:${accent};font-size:13px}
.link{color:#6e7681;font-size:11px;text-decoration:none;white-space:nowrap}
.link:hover{color:${accent};text-decoration:underline}
.footer{color:#6e7681;font-size:10px;margin-top:8px;padding-top:6px;border-top:1px solid #21262d}
.empty{color:#6e7681;font-size:11px;margin-top:4px}
.err{background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.3);color:#c9d1d9;padding:8px;border-radius:6px;font-size:11px;margin-top:6px}
`;
}
