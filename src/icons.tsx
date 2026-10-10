import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Outline({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return <Outline {...props}><path d="m6 9 6 6 6-6" /></Outline>;
}

export function ArrowRight(props: IconProps) {
  return <Outline {...props}><path d="M4 12h16m-6-6 6 6-6 6" /></Outline>;
}

export function Check(props: IconProps) {
  return <Outline {...props}><path d="m5 12 4 4L19 6" /></Outline>;
}

export function Close(props: IconProps) {
  return <Outline {...props}><path d="m6 6 12 12M6 18 18 6" /></Outline>;
}

export function Cloud(props: IconProps) {
  return <Outline {...props}><path d="M6 19a4 4 0 0 1-1-7.87A7 7 0 0 1 18.8 9 5 5 0 0 1 18 19Z" /></Outline>;
}

export function Eye(props: IconProps) {
  return <Outline {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Outline>;
}

export function EyeOff(props: IconProps) {
  return <Outline {...props}><path d="m3 3 18 18M10.5 5.1Q11.2 5 12 5c6.5 0 10 7 10 7a22 22 0 0 1-3 4M6.5 6.5A22 22 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Outline>;
}

export function Search(props: IconProps) {
  return <Outline {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></Outline>;
}

export function Settings(props: IconProps) {
  return <Outline {...props}><path d="M4 7h3m4 0h9M4 17h9m4 0h3" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></Outline>;
}

export function Mail(props: IconProps) {
  return <Outline {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></Outline>;
}

export function Gmail(props: IconProps) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path fill="#4285f4" d="M2 20h4V9L1 5.5V19a1 1 0 0 0 1 1Z" />
      <path fill="#34a853" d="M18 20h4a1 1 0 0 0 1-1V5.5L18 9Z" />
      <path fill="#fbbc04" d="M18 9v-5l1.8-1.1A2 2 0 0 1 23 4.5v6Z" />
      <path fill="#ea4335" d="M6 9v-5l6 4.5L18 4v5l-6 4.5Z" />
      <path fill="#c5221f" d="M1 4.5v6L6 9V4L4.2 2.9A2 2 0 0 0 1 4.5Z" />
    </svg>
  );
}
