import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

type Box = { offset: number; size: number; animate: boolean };
type Hover = Box & { visible: boolean };

/**
 * A list whose markers slide instead of jumping. A selection wash moves to the
 * child marked `.active`, behind a row vertically or a segment horizontally
 * (the Inbox categories). A hover wash follows the pointer between enabled
 * buttons and fades out when it leaves. `activeKey` names the current item, so
 * only a change of selection animates; layout shifts such as new counts move
 * the marker instantly.
 */
export function SlidingNav({ activeKey, label, className, axis = "y", children }: {
  activeKey: string | null;
  label: string;
  className?: string;
  axis?: "x" | "y";
  children: ReactNode;
}) {
  const nav = useRef<HTMLElement>(null);
  const lastKey = useRef(activeKey);
  const [box, setBox] = useState<Box | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const measure = (item: HTMLElement) => axis === "x"
    ? { offset: item.offsetLeft, size: item.offsetWidth }
    : { offset: item.offsetTop, size: item.offsetHeight };
  useLayoutEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>(":scope > .active");
    const moved = lastKey.current !== activeKey;
    lastKey.current = activeKey;
    if (!active) {
      setBox(null);
      return;
    }
    const { offset, size } = measure(active);
    setBox((current) =>
      current && current.offset === offset && current.size === size
        ? current
        : { offset, size, animate: moved && current !== null });
  });
  const track = (event: PointerEvent<HTMLElement>) => {
    const item = (event.target as Element).closest("button");
    if (!(item instanceof HTMLButtonElement) || item.parentElement !== nav.current || item.disabled) {
      setHover((current) => current && { ...current, visible: false });
      return;
    }
    const { offset, size } = measure(item);
    // Slide only from a visible position; arriving from outside starts in place.
    setHover((current) => current?.offset === offset && current.size === size && current.visible
      ? current : { offset, size, visible: true, animate: !!current?.visible });
  };
  const place = (marker: Box) => axis === "x"
    ? { width: marker.size, transform: `translateX(${marker.offset}px)` }
    : { height: marker.size, transform: `translateY(${marker.offset}px)` };
  return (
    <nav ref={nav} className={`sliding-nav ${axis === "x" ? "horizontal" : "vertical"}${className ? ` ${className}` : ""}`}
      aria-label={label} onPointerMove={track} onPointerLeave={() => setHover((current) => current && { ...current, visible: false })}>
      {hover && (
        <span
          className={`sliding-hover${hover.animate ? " animate" : ""}${hover.visible ? " visible" : ""}`}
          style={place(hover)}
          aria-hidden="true"
        />
      )}
      {box && (
        <span className={box.animate ? "sliding-wash animate" : "sliding-wash"} style={place(box)} aria-hidden="true" />
      )}
      {children}
    </nav>
  );
}
