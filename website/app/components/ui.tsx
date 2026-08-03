"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import Link from "next/link";

type BtnVariant = "primary" | "secondary" | "ghost" | "dark";
type BtnSize = "sm" | "md" | "lg";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed";

const btnVariants: Record<BtnVariant, string> = {
  primary:
    "bg-turquoise text-white hover:bg-turquoise-light shadow-sm hover:shadow-md",
  secondary:
    "bg-white text-midnight border border-gray-200 hover:border-turquoise hover:text-turquoise",
  ghost:
    "bg-transparent text-midnight hover:bg-gray-100",
  dark:
    "bg-midnight text-white hover:bg-midnight-dark",
};

const btnSizes: Record<BtnSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Btn({
  variant = "primary",
  size = "md",
  fullWidth,
  href,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  fullWidth?: boolean;
  href?: string;
}) {
  const cls = [
    btnBase,
    btnVariants[variant],
    btnSizes[size],
    fullWidth ? "w-full" : "",
    className,
  ].join(" ");
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children as any}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label?: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="block text-xs text-red-600 mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-gray-400 mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-midnight placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-turquoise/40 focus:border-turquoise transition";

export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
) {
  const { className = "", invalid, ...rest } = props;
  return (
    <input
      className={[inputBase, invalid ? "border-red-400 focus:ring-red-200 focus:border-red-500" : "", className].join(" ")}
      {...rest}
    />
  );
}

export function Textarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className = "", ...rest } = props;
  return <textarea className={[inputBase, "min-h-[100px] rounded-xl", className].join(" ")} {...rest} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={["bg-white rounded-2xl border border-gray-100 shadow-sm p-6", className].join(" ")}>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
      {message}
    </div>
  );
}
