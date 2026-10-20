"use client";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Info, type LucideIcon } from "lucide-react";
/** Dimensions and hierarchy mirror mobile/core/{ui,portal_ui}.dart. */
export function PortalIntro({ title, detail, eyebrow, trailing }: {
    title: string;
    detail?: string;
    eyebrow?: string;
    trailing?: ReactNode;
}) {
    return <div className="native-intro"><div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{detail && <p>{detail}</p>}</div>{trailing}</div>;
}
export function PortalTask({ title, detail, icon: Icon, primary = false, onClick, disabled = false }: {
    title: string;
    detail?: string;
    icon: LucideIcon;
    primary?: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return <button className={`native-task${primary ? " featured" : ""}`} onClick={onClick} disabled={disabled}><span className="native-task-top"><span><Icon size={23}/></span><ArrowLeft size={17}/></span><strong>{title}</strong>{detail && <small>{detail}</small>}</button>;
}
export function PortalNote({ children }: {
    children: ReactNode;
}) { return <div className="native-note"><Info size={20}/><span>{children}</span></div>; }
export function Fact({ label, children, strong = false }: {
    label: string;
    children: ReactNode;
    strong?: boolean;
}) { return <div className={`native-fact${strong ? " strong" : ""}`}><span>{label}</span><strong>{children}</strong></div>; }
export function FlowSteps({ labels, current, pills = false }: {
    labels: string[];
    current: number;
    pills?: boolean;
}) { return <ol className={pills ? "native-step-pills" : "native-steps"} aria-label="خطوات العملية">{labels.map((label, i) => <li key={label} aria-current={i === current ? "step" : undefined} className={i < current ? "complete" : ""}><span>{i + 1}</span>{label}</li>)}</ol>; }
export function ScreenBack({ title, onBack, disabled = false }: {
    title: string;
    onBack: () => void;
    disabled?: boolean;
}) { return <div className="native-screen-bar"><button type="button" className="icon-button" aria-label="رجوع" onClick={onBack} disabled={disabled}><ArrowRight size={24}/></button><h1>{title}</h1></div>; }
