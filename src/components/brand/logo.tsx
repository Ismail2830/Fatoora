import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Khalas-style mark: a dark rounded square with a purple gradient dot. */
export function Logo({
  size = "md",
  href = "/",
  className,
}: {
  size?: "sm" | "md" | "lg";
  href?: string | null;
  className?: string;
}) {
  const box = { sm: "size-8", md: "size-[34px]", lg: "size-10" }[size];
  const dot = { sm: "size-3", md: "size-3.5", lg: "size-4" }[size];
  const text = { sm: "text-xl", md: "text-[27px]", lg: "text-3xl" }[size];

  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-[9px] bg-night flex-none",
          box,
        )}
      >
        <span
          className={cn("rounded-full", dot)}
          style={{ background: "linear-gradient(135deg,#c9bafb,#8b6ff0)" }}
        />
      </span>
      <span className={cn("display tracking-wide", text)}>Fatora</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex">
      {content}
    </Link>
  );
}
