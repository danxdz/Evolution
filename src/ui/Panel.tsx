import { ReactNode } from "react";

type PanelProps = {
  title: string;
  className?: string;
  children: ReactNode;
};

export function Panel({ title, className = "", children }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">{title}</div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
