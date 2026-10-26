"use client";
export type WhatsappPhase = 'unavailable' | 'ready' | 'waiting' | 'expired' | 'verified' | 'error';
const copy: Record<WhatsappPhase, [string, string]> = {
 unavailable: ['واتساب غير متاح حاليًا', 'تقدر تكمّل التحقق برسالة SMS.'],
 ready: ['أكّد رقمك عن طريق واتساب', 'هنفتح محادثة برسالة جاهزة. ابعتها من نفس الرقم اللي سجّلت بيه، وبعدها ارجع هنا.'],
 waiting: ['مستنيين رسالتك', 'اضغط إرسال داخل واتساب. فتح المحادثة لوحده مش بيأكد الرقم. ارجع هنا بعد الإرسال.'],
 expired: ['انتهت مهلة التحقق', 'اطلب محاولة جديدة وابعت الرسالة الجديدة؛ الرسالة القديمة مش هتشتغل.'],
 verified: ['تم تأكيد رقمك', 'تقدر تكمّل الخطوة التالية.'],
 error: ['تعذر التحقق عبر واتساب', 'راجع اتصالك وحاول تاني، أو اختار رسالة SMS.'],
};

// Presentational only: phase is supplied by the host. Opening WhatsApp never
// produces a proof or invokes registration/password recovery.
export function WhatsappVerification({phase, phone, onOpen, onRetry, onSms, onBack}: {
 phase: WhatsappPhase; phone: string; onOpen?: () => void; onRetry?: () => void;
 onSms?: () => void; onBack?: () => void;
}) {
 return <section className="whatsapp-verification" aria-label="التحقق عبر واتساب" dir="rtl">
  <div className="whatsapp-verification-icon" aria-hidden="true">{phase === 'verified' ? '✓' : '↗'}</div>
  <h3>{copy[phase][0]}</h3><p role={phase === 'error' ? 'alert' : 'status'} aria-live="polite">{copy[phase][1]}</p>
  <p dir="ltr" className="whatsapp-verification-phone">{phone}</p>
  {(phase === 'ready' || phase === 'waiting') && <ol><li>افتح واتساب من الزر.</li><li>ابعت الرسالة الجاهزة من نفس الرقم بدون تعديل.</li><li>ارجع هنا وانتظر تأكيد الاستلام.</li></ol>}
  {(phase === 'ready' || phase === 'waiting') && <button type="button" className="web-auth-submit" disabled={!onOpen} onClick={onOpen}>{phase === 'waiting' ? 'فتح واتساب مرة تانية' : 'فتح واتساب وإرسال الرسالة'}</button>}
  {(phase === 'expired' || phase === 'error') && <button type="button" disabled={!onRetry} onClick={onRetry}>محاولة جديدة</button>}
  {phase !== 'verified' && onSms && <button type="button" onClick={onSms}>التحقق برسالة SMS</button>}
  {onBack && <button type="button" onClick={onBack}>رجوع</button>}
 </section>;
}
