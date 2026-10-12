import { Parser } from "htmlparser2";

export const MAIL_HTML_LIMIT = 256_000;
export const MAIL_NODE_LIMIT = 4_000;
export const MAIL_DEPTH_LIMIT = 40;

// Keep decoded source bytes intact inside the limit; larger mail uses its text body.
export function boundedMailHtml(value: string | false | undefined): string | null {
  return typeof value === "string" && value.length <= MAIL_HTML_LIMIT && value.trim() ? value : null;
}

export type MailContentNode = string | {
  tag: string;
  attributes: Record<string, string>;
  children: MailContentNode[];
};

const allowedTags = new Set(("div span p br hr h1 h2 h3 h4 h5 h6 strong b em i u s del " +
  "blockquote pre code ul ol li table thead tbody tfoot tr td th caption colgroup col a img font").split(" "));
const droppedTags = new Set(("head script style title iframe frame frameset object embed svg math " +
  "form input button select option textarea template noscript audio video source link meta base").split(" "));
const allowedAttributes = new Set(("style href src alt width height align valign bgcolor color size " +
  "colspan rowspan cellpadding cellspacing border start").split(" "));

// Unknown wrappers keep their text. Active content and its children are discarded.
export function parseMailContent(html: string): MailContentNode[] | null {
  if (boundedMailHtml(html) === null) return null;
  const roots: MailContentNode[] = [];
  const stack: { children: MailContentNode[]; dropped: boolean }[] = [];
  let count = 0, exceeded = false;
  const budget = () => {
    if (++count <= MAIL_NODE_LIMIT && stack.length < MAIL_DEPTH_LIMIT) return true;
    exceeded = true;
    parser.pause();
    return false;
  };
  const parser = new Parser({
    onopentag(tag, attributes) {
      if (!budget()) return;
      const parent = stack.at(-1);
      const children: MailContentNode[] = [];
      const dropped = !!parent?.dropped || droppedTags.has(tag);
      if (!dropped) (parent?.children ?? roots).push({
        tag: allowedTags.has(tag) ? tag : "span",
        attributes: Object.fromEntries(Object.entries(attributes).filter(([key]) => allowedAttributes.has(key))),
        children,
      });
      stack.push({ children, dropped });
    },
    onclosetag() { stack.pop(); },
    ontext(text) {
      if (!budget() || stack.at(-1)?.dropped) return;
      const children = stack.at(-1)?.children ?? roots;
      const last = children.at(-1);
      if (typeof last === "string") children[children.length - 1] = last + text;
      else children.push(text);
    },
  }, { decodeEntities: true });
  parser.end(html);
  return exceeded ? null : roots;
}

// CSS values use a small grammar so escapes, functions that fetch, and custom properties never pass.
export function mailStyle(value: string): Record<string, string | number> {
  const style: Record<string, string | number> = {};
  for (const declaration of value.slice(0, 8_000).split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const input = declaration.slice(colon + 1).trim().toLowerCase();
    let output: string | number | null = null;
    if (["color", "background-color", "border-color"].includes(name)) output = color(input);
    if (name === "background") output = color(input);
    if (name === "font-size") output = length(input, 72);
    if (name === "font-weight" && /^(normal|bold|[1-9]00)$/.test(input)) output = input;
    if (name === "font-style" && /^(normal|italic|oblique)$/.test(input)) output = input;
    if (name === "text-align" && /^(left|center|right|justify)$/.test(input)) output = input;
    if (name === "vertical-align" && /^(top|middle|bottom|baseline)$/.test(input)) output = input;
    if (name === "text-decoration" && /^(none|underline|line-through)$/.test(input)) output = input;
    if (name === "white-space" && /^(normal|pre-wrap|pre-line)$/.test(input)) output = input;
    if (name === "border-collapse" && /^(collapse|separate)$/.test(input)) output = input;
    if (name === "line-height") {
      if (/^\d+(?:\.\d+)?$/.test(input) && Number(input) >= 1 && Number(input) <= 3) output = input;
      else output = length(input, 96);
    }
    if (/^(width|max-width|height|max-height)$/.test(name)) output = length(input, 1200, name.includes("width"));
    if (/^(margin|padding)(-(top|right|bottom|left))?$/.test(name)) {
      const parts = input.split(/\s+/).map((part) => length(part, 48));
      if (parts.length <= 4 && parts.every((part) => part !== null)) output = parts.join(" ");
    }
    if (name === "border" || /^border-(top|right|bottom|left)$/.test(name)) {
      const match = /^(\d+(?:\.\d+)?px) (solid|dashed|dotted) (.+)$/.exec(input);
      if (match && length(match[1], 4) && color(match[3])) output = input;
    }
    if (output !== null) {
      const property = (name === "background" ? "background-color" : name)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      style[property] = output;
    }
  }
  return style;
}

function color(value: string): string | null {
  return value.length <= 80 && /^(#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]{1,20}|(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\))$/.test(value) ? value : null;
}
function length(value: string, maximum: number, percent = false): string | null {
  if (value === "0") return "0";
  const match = /^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (match[2] === "%") return percent && amount <= 100 ? value : null;
  const pixels = amount * (match[2] === "pt" ? 4 / 3 : ["em", "rem"].includes(match[2]) ? 16 : 1);
  return pixels <= maximum ? `${pixels}px` : null;
}

export function mailLink(value: string): string | null {
  if (value.length > 2048 || !/^https?:\/\//i.test(value) || /[\\\s\u0000-\u001f\u007f]|%(?![\da-f]{2})/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Check both literal and decoded URL text; malformed UTF-8 must not conceal %40.
export function privateMailLink(value: string, redactText: (text: string) => string): boolean {
  for (let pass = 0; pass < 5; pass++) {
    if (redactText(value) !== value || redactText(value.replace(/\+/g, " ")) !== value.replace(/\+/g, " ")) return true;
    let decoded: string;
    try { decoded = decodeURIComponent(value); }
    catch { decoded = value.replace(/%([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))); }
    if (decoded === value) return false;
    value = decoded;
  }
  // Deeply encoded destinations cannot be proven free of hidden text.
  return true;
}
