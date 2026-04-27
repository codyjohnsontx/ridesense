import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Icon } from "./icons";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
type ButtonSize = "sm" | "default" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground border border-primary hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground border border-secondary hover:opacity-90",
  outline: "bg-transparent text-foreground border border-border hover:bg-accent",
  ghost: "bg-transparent text-foreground border border-transparent hover:bg-accent",
  destructive: "bg-destructive text-destructive-foreground border border-destructive",
  link: "bg-transparent text-primary underline-offset-4 hover:underline border-0 p-0 h-auto"
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  default: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-6 text-sm gap-2",
  icon: "h-9 w-9 p-0"
};

export function Button({
  variant = "default",
  size = "default",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...rest}
    />
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[var(--radius)] border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 px-6 pt-[18px]", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("m-0 text-sm font-semibold leading-tight tracking-tight", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("m-0 text-[13px] leading-snug text-muted-foreground", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-3.5 px-6 py-[18px]", className)} {...rest} />;
}

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "bg-transparent text-foreground border border-border",
  success: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.3)]",
  warning: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border border-[hsl(var(--warning)/0.3)]",
  destructive: "bg-destructive text-destructive-foreground"
};

export function Badge({
  variant = "default",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-tight",
        badgeVariants[variant],
        className
      )}
      {...rest}
    />
  );
}

export function Input({
  icon,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className={cn("flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3", className)}>
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <input
        className="w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        {...rest}
      />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground",
        className
      )}
      {...rest}
    />
  );
}

type TabOption = string | { value: string; label: string };

export function Tabs({
  value,
  onChange,
  options,
  className
}: {
  value: string;
  onChange?: (next: string) => void;
  options: TabOption[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex gap-0.5 rounded-md bg-muted p-[3px]", className)}>
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const l = typeof opt === "string" ? opt : opt.label;
        const active = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange?.(v)}
            className={cn(
              "rounded-sm border-0 px-3 py-[5px] text-[13px] font-medium transition-colors cursor-pointer",
              active
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-sm bg-muted", className)} />;
}

export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const pos = value > 0;
  return (
    <Badge variant={pos ? "success" : "destructive"} className="px-1.5 py-px text-[11px]">
      <Icon name={pos ? "trendUp" : "trendDn"} size={11} stroke={2} />
      {pos ? "+" : ""}
      {value}
      {suffix}
    </Badge>
  );
}

export function Alert({
  variant = "default",
  icon,
  title,
  children,
  className
}: {
  variant?: "default" | "success" | "warning" | "destructive";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "border-border bg-card text-foreground",
    success: "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]",
    warning: "border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]",
    destructive: "border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.08)] text-[hsl(var(--destructive))]"
  };
  return (
    <div
      className={cn(
        "grid gap-3 rounded-[var(--radius)] border px-4 py-3.5",
        icon ? "grid-cols-[auto_1fr]" : "grid-cols-1",
        variants[variant],
        className
      )}
    >
      {icon ? <div className="pt-0.5">{icon}</div> : null}
      <div>
        {title ? <div className="mb-1 text-sm font-semibold">{title}</div> : null}
        <div className={cn("text-[13.5px] leading-snug", variant === "default" ? "text-muted-foreground" : "opacity-90")}>
          {children}
        </div>
      </div>
    </div>
  );
}
