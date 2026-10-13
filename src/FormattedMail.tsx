import { Fragment, createElement, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { imageSource } from "../shared/types";
import { mailLink, mailStyle, parseMailContent, privateMailLink, type MailContentNode } from "../shared/mail-content";

type Props = {
  html: string | null | undefined;
  showImages: boolean;
  renderText: (text: string) => ReactNode;
  redactText: (text: string) => string;
  privacy: boolean;
  fallbackText?: string;
  fallback?: ReactNode;
};

// Parent owns opening-specific consent and text redaction. Hooks: formatted-mail,
// formatted-mail-fallback, formatted-mail-image, formatted-mail-image-status.
export function FormattedMail({ html, showImages, renderText, redactText, privacy, fallbackText = "", fallback }: Props) {
  const nodes = useMemo(() => typeof html === "string" ? parseMailContent(html) : null, [html]);
  const render = (node: MailContentNode, key: number): ReactNode => {
    if (typeof node === "string") return <Fragment key={key}>{renderText(node)}</Fragment>;
    const { tag, attributes: a, children } = node;
    const style: CSSProperties = {};
    // Legacy email presentation attributes pass through the same CSS validators.
    Object.assign(style, mailStyle([
      a.bgcolor && `background-color:${a.bgcolor}`, a.color && `color:${a.color}`,
      a.align && `text-align:${a.align}`, a.valign && `vertical-align:${a.valign}`,
      a.width && `width:${/^\d+$/.test(a.width) ? a.width + "px" : a.width}`,
      a.height && `height:${/^\d+$/.test(a.height) ? a.height + "px" : a.height}`,
    ].filter(Boolean).join(";")));
    if (tag === "font" && /^[1-7]$/.test(a.size || "")) style.fontSize = [10, 13, 16, 18, 24, 32, 48][Number(a.size) - 1];
    Object.assign(style, mailStyle(a.style || ""));
    delete style.color;
    style.backgroundColor = "transparent";
    if (style.borderColor) style.borderColor = "var(--line)";
    for (const property of ["border", "borderTop", "borderRight", "borderBottom", "borderLeft"] as const) {
      if (style[property]) style[property] = String(style[property]).replace(/^(\d+(?:\.\d+)?px (?:solid|dashed|dotted) ).+$/, "$1var(--line)");
    }
    if (tag === "img") {
      if (!showImages) return <span key={key} className="formatted-mail-image-status">
        Image blocked. Use Show images to load it.
      </span>;
      const src = imageSource(a.src || "");
      if (privacy && (privateMailLink(a.src || "", redactText) || (src && privateMailLink(src, redactText))))
        return <span key={key} className="formatted-mail-image-status">Image unavailable while personal information is hidden.</span>;
      return src ? <FormattedImage key={`${key}:${src}`} src={src} alt={redactText((a.alt || "").slice(0, 500))} style={style} /> :
        <span key={key} className="formatted-mail-image-status">Unsupported image.</span>;
    }
    const props: Record<string, unknown> = { key, style };
    let element = tag === "font" ? "span" : tag;
    if (tag === "a") {
      const href = mailLink(a.href || "");
      if (href && (!privacy || (!privateMailLink(a.href, redactText) && !privateMailLink(href, redactText)))) {
        style.color = "var(--link)";
        style.textDecoration = "underline";
        Object.assign(props, { href, target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer" });
      }
      else element = "span";
    }
    if (tag === "td" || tag === "th") {
      for (const [attribute, property] of [["colspan", "colSpan"], ["rowspan", "rowSpan"]]) {
        if (/^\d{1,2}$/.test(a[attribute] || "") && Number(a[attribute]) >= 1 && Number(a[attribute]) <= 20)
          props[property] = Number(a[attribute]);
      }
    }
    if (tag === "table") {
      for (const [attribute, property] of [["cellpadding", "cellPadding"], ["cellspacing", "cellSpacing"], ["border", "border"]]) {
        if (/^\d{1,2}$/.test(a[attribute] || "") && Number(a[attribute]) <= (attribute === "border" ? 4 : 24))
          props[property] = Number(a[attribute]);
      }
    }
    if (tag === "ol" && /^-?\d{1,4}$/.test(a.start || "")) props.start = Number(a.start);
    if (["br", "hr", "col"].includes(tag)) return createElement(element, props);
    return createElement(element, props, renderChildren(children));
  };
  const renderChildren = (children: MailContentNode[]): ReactNode => {
    if (privacy) {
      const text = contentText(children);
      // A hidden token split by sender tags must still reach the parent's redactor whole.
      if (redactText(text) !== redactedParts(children, redactText)) return <>
        {renderText(text)}
        {imageNodes(children).map(render)}
      </>;
    }
    return children.map(render);
  };
  const formatted = !!nodes && !!(contentText(nodes).trim() || hasImage(nodes));
  return <div className={formatted ? "formatted-mail" : "formatted-mail formatted-mail-fallback"}
    style={{ maxWidth: "100%", minWidth: 0, overflow: "auto", overflowWrap: "anywhere", contain: "layout paint", isolation: "isolate", whiteSpace: formatted ? "normal" : "pre-wrap" }}>
    {formatted ? renderChildren(nodes) : fallback ?? renderText(fallbackText)}
  </div>;
}

function FormattedImage({ src, alt, style }: { src: string; alt: string; style: CSSProperties }) {
  const [status, setStatus] = useState("loading");
  return <span className="formatted-mail-image">
    {status !== "error" && <img src={src} alt={alt} referrerPolicy="no-referrer" decoding="async" loading="lazy"
      style={{ ...style, maxWidth: "100%", height: "auto" }}
      onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} />}
    {status !== "loaded" && <span className="formatted-mail-image-status" role="status">
      {status === "error" ? "Image could not be loaded." : "Loading image…"}
    </span>}
  </span>;
}

const blockTags = new Set("div p br hr h1 h2 h3 h4 h5 h6 blockquote pre ul ol li table tr td th caption".split(" "));
function contentText(nodes: MailContentNode[]): string {
  return nodes.map((node) => typeof node === "string" ? node :
    contentText(node.children) + (blockTags.has(node.tag) ? "\n" : "")).join("");
}
function redactedParts(nodes: MailContentNode[], redactText: (text: string) => string): string {
  return nodes.map((node) => typeof node === "string" ? redactText(node) :
    redactText(contentText(node.children)) + (blockTags.has(node.tag) ? "\n" : "")).join("");
}

function hasImage(nodes: MailContentNode[]): boolean {
  return nodes.some((node) => typeof node !== "string" && ((node.tag === "img" && !!imageSource(node.attributes.src || "")) || hasImage(node.children)));
}

function imageNodes(nodes: MailContentNode[]): MailContentNode[] {
  return nodes.flatMap((node) => typeof node === "string" ? [] :
    node.tag === "img" ? [node] : imageNodes(node.children));
}
