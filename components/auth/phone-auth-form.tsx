"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Binary, CheckCircle2, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";

type Step = "phone" | "code";

export default function PhoneAuthForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+880");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Could not send verification code.");
      setStep("code"); setNotice("A verification code has been sent to your phone.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not verify your code.");
      router.replace("/"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
      <section className="auth-card">
        <div className="auth-brand"><div className="auth-brand-mark"><Binary size={22} /></div><span>binary<span>.</span></span></div>
        <div className="auth-art"><div className="auth-ring auth-ring-one" /><div className="auth-ring auth-ring-two" /><div className="auth-art-core"><span>010</span><strong>101</strong><span>110</span></div><div className="auth-art-lock"><LockKeyhole size={17} /></div></div>
        <div className="auth-copy"><span className="auth-eyebrow">YOUR SPACE. YOUR SIGNAL.</span><h1>{step === "phone" ? <>A quieter way<br />to <em>connect.</em></> : <>One last step<br />to <em>connect.</em></>}</h1><p>{step === "phone" ? "Sign in with your phone number. No passwords to remember, just you." : `Enter the 6-digit code we sent to ${phone}.`}</p></div>
        {step === "phone" ? (
          <form className="auth-form" onSubmit={requestCode}>
            <label htmlFor="phone-number">PHONE NUMBER</label>
            <div className="auth-input-wrap"><MessageCircle size={17} /><input id="phone-number" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+880 1XXXXXXXXX" required minLength={6} maxLength={25} /></div>
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "SENDING CODE..." : "Continue"} <ArrowRight size={17} /></button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verifyCode}>
            <label htmlFor="otp-code">6-DIGIT VERIFICATION CODE</label>
            <div className="auth-input-wrap"><ShieldCheck size={17} /><input id="otp-code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required minLength={6} maxLength={6} /></div>
            <button className="auth-submit" type="submit" disabled={busy || code.length !== 6}>{busy ? "VERIFYING..." : "Verify & sign in"} <ArrowRight size={17} /></button>
            <button type="button" className="auth-back" onClick={() => { setStep("phone"); setCode(""); setError(""); setNotice(""); }}><ArrowLeft size={14} /> Change phone number</button>
          </form>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status"><CheckCircle2 size={14} />{notice}</p>}
        <div className="auth-assurance"><LockKeyhole size={13} /><span>Your number is used for sign-in and account security.</span></div>
        <div className="auth-bottom">BINARY CHAT <span>·</span> PRIVATE BY DESIGN</div>
      </section>
    </main>
  );
}
