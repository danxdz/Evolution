import { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "default" | "rare";
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return <span className={`badge ${tone === "rare" ? "badge-rare" : ""}`}>{children}</span>;
}
