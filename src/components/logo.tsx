import Image from "next/image";

export function Logo() {
  return <span className="brand-lockup"><Image src="/logo.png" alt="Outpost" width={670} height={217} sizes="(max-width: 640px) 172px, 220px" className="brand-logo" /><span className="brand-subtitle">Your outreach workspace</span></span>;
}
