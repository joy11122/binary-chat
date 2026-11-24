"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, CheckCheck, ChevronDown, CircleHelp, Eye, EyeOff, LockKeyhole, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Send, Settings2, ShieldCheck, Smile, Sparkles, Users, Wifi, X } from "lucide-react";
import { textToBinary } from "@/lib/binary";

type ChatMessage = { id: string; text: string; time: string; mine: boolean; read?: boolean };
type Conversation = { id: string; name: string; initials: string; color: string; status: string; preview: string; time: string; unread: number; online: boolean; messages: ChatMessage[] };

const initialChats: Conversation[] = [
  { id: "maya", name: "Maya Rahman", initials: "MR", color: "rose", status: "online now", preview: "That sounds like a plan ✨", time: "Now", unread: 2, online: true, messages: [
    { id: "m1", text: "Hey! Did you get a chance to see the new concept?", time: "10:42", mine: false },
    { id: "m2", text: "Just looked through it. The direction feels really good.", time: "10:43", mine: true, read: true },
    { id: "m3", text: "I especially love the little details in the interface.", time: "10:43", mine: false },
    { id: "m4", text: "That sounds like a plan ✨", time: "10:44", mine: false },
  ] },
  { id: "arif", name: "Arif Hasan", initials: "AH", color: "blue", status: "last seen 8 min ago", preview: "Send me the files when ready", time: "9:48", unread: 0, online: false, messages: [
    { id: "a1", text: "Send me the files when ready", time: "9:48", mine: false },
  ] },
  { id: "design", name: "Design Circle", initials: "DC", color: "purple", status: "6 members", preview: "Nadia: New explorations are up", time: "Yesterday", unread: 0, online: false, messages: [
    { id: "d1", text: "Nadia: New explorations are up", time: "Yesterday", mine: false },
  ] },
  { id: "sara", name: "Sara Ahmed", initials: "SA", color: "amber", status: "last seen yesterday", preview: "Thank you so much!", time: "Tue", unread: 0, online: false, messages: [
    { id: "s1", text: "Thank you so much!", time: "Tue", mine: false },
  ] },
];

export default function HomePage() {
  const [chats, setChats] = useState(initialChats);
  const [activeId, setActiveId] = useState("maya");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0];
  const filteredChats = useMemo(() => chats.filter((chat) => chat.name.toLowerCase().includes(query.toLowerCase())), [chats, query]);

  useEffect(() => {
    if (!revealedId) return;
    setSecondsLeft(5);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setRevealedId(null);
    }, 200);
    return () => window.clearInterval(interval);
  }, [revealedId]);

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    const message: ChatMessage = { id: `local-${Date.now()}`, text, time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()), mine: true };
    setChats((current) => current.map((chat) => chat.id === activeId ? { ...chat, preview: text, time: "Now", messages: [...chat.messages, message] } : chat));
    setDraft("");
  }

  function toggleReveal(id: string) {
    setRevealedId((current) => current === id ? null : id);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><span>01</span></div><div><div className="brand-name">binary<span>.</span></div><div className="brand-caption">PRIVATE BY DESIGN</div></div><button className="icon-button sidebar-more" aria-label="More options"><MoreHorizontal size={19} /></button></div>
        <div className="profile-card"><div className="avatar avatar-self">J<span className="online-dot" /></div><div className="profile-copy"><strong>Joyanta</strong><span>Personal space</span></div><button className="icon-button" aria-label="Profile settings"><Settings2 size={17} /></button></div>
        <div className="section-label"><span>MESSAGES</span><button className="icon-button tiny" aria-label="New conversation"><Plus size={17} /></button></div>
        <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
        <div className="chat-list">{filteredChats.map((chat) => <button key={chat.id} className={`chat-row ${activeId === chat.id ? "selected" : ""}`} onClick={() => { setActiveId(chat.id); setRevealedId(null); }}><div className={`avatar avatar-${chat.color}`}>{chat.initials}{chat.online && <span className="online-dot" />}</div><span className="chat-row-copy"><strong>{chat.name}</strong><span>{chat.preview}</span></span><span className="chat-row-meta"><time>{chat.time}</time>{chat.unread > 0 && <i>{chat.unread}</i>}</span></button>)}</div>
        <div className="sidebar-bottom"><div className="privacy-note"><div className="privacy-icon"><ShieldCheck size={17} /></div><div><strong>Your space, your rules.</strong><span>Privacy is not an add-on.</span></div></div><button className="settings-link"><Settings2 size={17} /> Settings <ChevronDown size={15} /></button></div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header"><div className={`avatar avatar-${activeChat.color}`}>{activeChat.initials}{activeChat.online && <span className="online-dot" />}</div><div className="header-person"><strong>{activeChat.name}</strong><span><i className={activeChat.online ? "status-live" : ""} />{activeChat.status}</span></div><div className="header-actions"><div className="secure-pill"><LockKeyhole size={12} /> PRIVATE CHAT</div><button className="icon-button" aria-label="Conversation details"><MoreHorizontal size={20} /></button></div></header>
        <div className="chat-body"><div className="date-divider"><span />TODAY<span /></div><div className="encryption-banner"><LockKeyhole size={13} /><span>Messages are displayed in binary on your screen.</span><button aria-label="About binary display"><CircleHelp size={14} /></button></div>
          <div className="messages">{activeChat.messages.map((message) => { const isRevealed = revealedId === message.id; return <div key={message.id} className={`message-line ${message.mine ? "mine" : "theirs"}`}><div className={`message-bubble ${message.mine ? "bubble-mine" : "bubble-theirs"}`}><p className={`message-content ${!isRevealed ? "binary-text" : ""}`}>{isRevealed ? message.text : textToBinary(message.text)}</p><div className="message-footer"><span>{message.time}</span>{message.mine && (message.read ? <CheckCheck size={14} className="read-check" /> : <Check size={14} />)}<button className={`reveal-button ${isRevealed ? "revealing" : ""}`} onClick={() => toggleReveal(message.id)} aria-label={isRevealed ? "Hide original message" : "Reveal original message for five seconds"} title={isRevealed ? "Hide message" : "Reveal for 5 seconds"}>{isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}</button>{isRevealed && <span className="reveal-count">{secondsLeft}s</span>}</div></div></div>; })}</div>
        </div>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><button type="button" className="icon-button composer-tool" aria-label="Emoji"><Smile size={19} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message..." aria-label="Message text" /><span className="composer-hint">ENTER ↵</span><button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button></form>
        <div className="chat-footnote"><span><Wifi size={12} /> CONNECTED</span><span>UTF-8 BINARY DISPLAY <b>·</b> LOCAL PREVIEW</span></div>
      </section>

      <aside className="details-panel"><div className="details-top"><span>YOUR EXPERIENCE</span><button className="icon-button" aria-label="Close details"><X size={17} /></button></div><div className="hero-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>010</span><b>101</b><span>110</span></div><Sparkles className="orbit-spark" size={17} /></div><div className="details-intro"><span className="eyebrow">A NEW KIND OF QUIET</span><h2>Say it in<br /><em>your</em> language.</h2><p>Your words stay yours. See every message as a stream of bits, and reveal the original only when you choose.</p></div><div className="feature-list"><div className="feature-item"><div className="feature-icon"><Eye size={16} /></div><div><strong>Five-second reveal</strong><span>Tap the eye to read. It hides again automatically.</span></div></div><div className="feature-item"><div className="feature-icon"><ShieldCheck size={16} /></div><div><strong>Privacy-first by design</strong><span>Reveal state stays on this device.</span></div></div><div className="feature-item"><div className="feature-icon"><MessageCircle size={16} /></div><div><strong>Human conversations</strong><span>Familiar chat, a different point of view.</span></div></div></div><div className="coming-soon"><div className="coming-icon"><Bell size={15} /></div><div><strong>More thoughtful features</strong><span>Secure messaging foundations are in progress.</span></div><span className="soon-tag">IN PROGRESS</span></div><div className="details-footer"><span>BUILT FOR THE IN-BETWEEN</span><span>v0.1.0</span></div></aside>
    </main>
  );
}
