import type { ReactNode } from "react";

type Props = { children: ReactNode };

export const PhoneFrame = ({ children }: Props) => (
  <div
    className="bg-paper relative overflow-hidden rounded-[44px] ring-1 ring-rule shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] flex flex-col"
    style={{ width: 393, height: 760 }}
  >
    {children}
  </div>
);
