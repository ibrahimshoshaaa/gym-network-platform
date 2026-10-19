import type { ReactNode } from "react";
/** Approved GymBank app symbol, shared by startup and workspace navigation. */
export function NetworkMark({size=26}:{size?:number}) {
 return <img src="/brand/gymbank-icon.png" width={size} height={size} alt="" aria-hidden="true" style={{objectFit:"contain",borderRadius:8}}/>;
}
export function NetworkArt(){return <svg className="network-art" viewBox="0 0 320 220" fill="none" aria-hidden="true"><path d="M-30 180 140 10h100L70 180H-30ZM80 240 280 40h100L180 240H80Z" stroke="currentColor" strokeWidth="1"/><g transform="translate(155 115) rotate(-32)"><rect x="-68" y="-9" width="136" height="18" rx="8" fill="currentColor"/><rect x="-65" y="-45" width="26" height="90" rx="9" fill="currentColor"/><rect x="39" y="-45" width="26" height="90" rx="9" fill="currentColor"/><rect x="-82" y="-28" width="17" height="56" rx="6" fill="currentColor"/><rect x="65" y="-28" width="17" height="56" rx="6" fill="currentColor"/></g><circle cx="260" cy="174" r="21" stroke="currentColor" strokeWidth="1"/><path d="M251 174h18m-9-9v18" stroke="currentColor" strokeWidth="2"/></svg>}
export function PlatformHero({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){return <div className="platform-hero"><div className="platform-hero-copy"><span className="hero-kicker"><span/>{eyebrow}</span><h1>{title}</h1><p>{children}</p></div><div className="platform-hero-art"><span className="hero-wordmark" dir="ltr">ONE BALANCE. EVERY GYM.</span><NetworkArt/></div></div>}

