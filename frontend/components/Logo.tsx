import type { SVGProps } from "react";

type LogoProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
};

export function Logo({ size = 18, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="0.5" y="0.5" width="23" height="23" rx="5" stroke="hsl(var(--border))" />
      <path
        d="M5 17 L9 9 L13 14 L19 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" />
    </svg>
  );
}
