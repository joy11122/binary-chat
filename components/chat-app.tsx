"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadAblyBrowserSdk, type AblyClientMessage, type AblyPresenceMessage, type AblyRealtimeClient } from "@/lib/ably-browser";
import { Bell, Check, CheckCheck, ChevronDown, CircleHelp, Eye, EyeOff, LockKeyhole, MessageCircle, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, Smile, Sparkles, Wifi, X, LogOut, LoaderCircle, UserRoundPlus } from "lucide-react";
import { textToBinary } from "@/lib/binary";

type ApiMember = { id: string; phone: string; displayName: string; avatarUrl: string };
type ApiMessage = { id: string; text: string; senderId: string; recipientId: string; createdAt: string; deliveredAt?: string | null; readAt?: string | null; clientMessageId: string };
type ChatMessage = { id: string; text: string; time: string; mine: boolean; read?: boolean; delivered?: boolean; createdAt: string; clientMessageId?: string };
type Conversation = { id: string; userId: string; name: string; initials: string; color: string; status: string; preview: string; time: string; unread: number; online: boolean; messages: ChatMessage[] };
type Contact = { id: string; phone: string; displayName: string; avatarUrl: string };

const avatarColors = ["rose", "blue", "purple", "amber"];
const formatTime = (value: string | Date) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const initialsFor = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "BC";

export default function ChatApp({ displayName, userId }: { displayName: string; userId: string }) {
  const router = useRouter();
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const [foundContact, setFoundContact] = useState<Contact | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const realtimeRef = useRef<AblyRealtimeClient | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  const activeChat = chats.find((chat) => chat.id === activeId) ?? null;
  const filteredChats = useMemo(() => chats.filter((chat) => chat.name.toLowerCase().includes(query.toLowerCase()) || chat.preview.toLowerCase().includes(query.toLowerCase())), [chats, query]);

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Could not load conversations.");
    const data = await response.json() as { conversations: Array<{ id: string; members: ApiMember[]; latestMessage: { text: string; senderId: string; createdAt: string } | null; updatedAt: string }> };
    const next: Conversation[] = data.conversations.map((item, index) => {
      const other = item.members.find((member) => member.id !== userId);
      const name = other?.displayName || other?.phone || "Unknown contact";
      return {
        id: item.id, userId: other?.id ?? "", name, initials: initialsFor(name),
        color: avatarColors[index % avatarColors.length], status: "last seen recently",
        preview: item.latestMessage?.text ?? "Start a conversation", time: item.latestMessage ? formatTime(item.latestMessage.createdAt) : "",
        unread: 0, online: false, messages: [],
      };
    });
    setChats((current) => next.map((item) => {
      const previous = current.find((chat) => chat.id === item.id);
      return previous ? { ...item, messages: previous.messages, online: previous.online, unread: previous.unread } : item;
    }));
    setActiveId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? ""));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshConversations();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load conversations.");
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshConversations]);

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

  useEffect(() => {
    let cancelled = false;
    let realtime: AblyRealtimeClient | null = null;
    const subscribed = subscribedRef.current;
    const onConnected = () => setRealtimeStatus("connected");
    const onConnecting = () => setRealtimeStatus("connecting");
    const onDisconnected = () => setRealtimeStatus("offline");

    void loadAblyBrowserSdk().then(() => {
      if (cancelled || !window.Ably) return;
      realtime = new window.Ably.Realtime({ authUrl: "/api/realtime/token", authMethod: "GET" });
      realtimeRef.current = realtime;
      realtime.connection.on("connected", onConnected);
      realtime.connection.on("connecting", onConnecting);
      realtime.connection.on("disconnected", onDisconnected);
      realtime.connection.on("failed", onDisconnected);
    }).catch(() => {
      if (!cancelled) setRealtimeStatus("offline");
    });

    return () => {
      cancelled = true;
      if (realtime) {
        realtime.connection.off("connected", onConnected);
        realtime.connection.off("connecting", onConnecting);
        realtime.connection.off("disconnected", onDisconnected);
        realtime.connection.off("failed", onDisconnected);
        realtime.close();
      }
      realtimeRef.current = null;
      subscribed.clear();
    };
  }, []);

  useEffect(() => {
    const realtime = realtimeRef.current;
    if (!realtime || realtimeStatus === "offline" || realtimeStatus === "connecting") return;
    for (const chat of chats) {
      if (subscribedRef.current.has(chat.id)) continue;
      const channel = realtime.channels.get(`conversation:${chat.id}`);
      subscribedRef.current.add(chat.id);
      const handleMessage = (event: AblyClientMessage) => {
        const payload = event.data as Partial<ApiMessage>;
        if (typeof payload.id !== "string" || typeof payload.text !== "string" || typeof payload.senderId !== "string") return;
        const message: ChatMessage = {
          id: payload.id, text: payload.text, mine: payload.senderId === userId,
          time: payload.createdAt ? formatTime(payload.createdAt) : formatTime(new Date()),
          createdAt: payload.createdAt ?? new Date().toISOString(),
          delivered: Boolean(payload.deliveredAt), read: Boolean(payload.readAt),
          clientMessageId: payload.clientMessageId,
        };
        setChats((current) => current.map((item) => {
          if (item.id !== chat.id) return item;
          const optimisticIndex = message.mine && message.clientMessageId
            ? item.messages.findIndex((existing) => existing.id === message.clientMessageId || existing.clientMessageId === message.clientMessageId)
            : -1;
          const alreadySaved = item.messages.some((existing) => existing.id === message.id);
          const messages = optimisticIndex >= 0
            ? item.messages.map((existing, index) => index === optimisticIndex ? message : existing)
            : alreadySaved ? item.messages : [...item.messages, message];
          return { ...item, preview: message.text, time: message.time, messages, unread: message.mine || activeId === chat.id ? 0 : item.unread + 1 };
        }));
        if (payload.senderId !== userId) {
          void fetch(`/api/conversations/${chat.id}/messages`, { cache: "no-store" }).then((response) => response.json()).then((data: { messages?: ApiMessage[] }) => {
            if (activeId !== chat.id) return;
            const ids = (data.messages ?? []).filter((item) => item.senderId !== userId && !item.readAt).map((item) => item.id);
            if (ids.length) void fetch(`/api/conversations/${chat.id}/messages`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: ids }) });
          }).catch(() => undefined);
        }
      };
      const handleDelivered = (event: Ably.Message) => {
        if ((event.data as { recipientId?: string }).recipientId !== chat.userId) return;
        setChats((current) => current.map((item) => item.id === chat.id ? { ...item, messages: item.messages.map((message) => message.mine ? { ...message, delivered: true } : message) } : item));
      };
      const handleRead = (event: Ably.Message) => {
        const payload = event.data as { messageIds?: string[]; readerId?: string };
        if (payload.readerId !== chat.userId) return;
        const ids = new Set(payload.messageIds ?? []);
        setChats((current) => current.map((item) => item.id === chat.id ? { ...item, messages: item.messages.map((message) => ids.has(message.id) ? { ...message, delivered: true, read: true } : message) } : item));
      };
      const handlePresence = (event: AblyPresenceMessage) => {
        const memberId = event.clientId;
        if (!memberId || memberId === userId) return;
        setOnlineUsers((current) => ({ ...current, [memberId]: event.action !== "leave" && event.action !== "absent" }));
      };
      channel.subscribe("message.created", handleMessage);
      channel.subscribe("message.delivered", handleDelivered);
      channel.subscribe("message.read", handleRead);
      channel.presence.subscribe(["enter", "leave", "update"], handlePresence);
      void channel.presence.enter().catch(() => undefined);
      void channel.presence.get().then((members) => members.forEach((member) => {
        if (member.clientId && member.clientId !== userId) setOnlineUsers((current) => ({ ...current, [member.clientId!]: true }));
      })).catch(() => undefined);
    }
  }, [chats, activeId, realtimeStatus, userId]);

  const activeConversationId = activeChat?.id;

  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setRevealedId(null);
    (async () => {
      try {
        const response = await fetch(`/api/conversations/${activeConversationId}/messages`, { cache: "no-store" });
        const data = await response.json() as { messages?: ApiMessage[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load messages.");
        const messages = (data.messages ?? []).map((item) => ({
          id: item.id, text: item.text, mine: item.senderId === userId, time: formatTime(item.createdAt),
          createdAt: item.createdAt, delivered: Boolean(item.deliveredAt), read: Boolean(item.readAt),
        }));
        if (!cancelled) {
          setChats((current) => current.map((chat) => chat.id === activeConversationId ? { ...chat, messages, preview: messages.at(-1)?.text ?? "Start a conversation" } : chat));
          const unreadIds = (data.messages ?? []).filter((item) => item.senderId !== userId && !item.readAt).map((item) => item.id);
          if (unreadIds.length) {
            await fetch(`/api/conversations/${activeConversationId}/messages`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: unreadIds }) });
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load messages.");
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeConversationId, userId]);

  useEffect(() => {
    setChats((current) => current.map((chat) => {
      const online = Boolean(onlineUsers[chat.userId]);
      return { ...chat, online, status: online ? "online now" : "last seen recently" };
    }));
  }, [onlineUsers]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !activeChat || sending) return;
    setSending(true);
    setError("");
    const clientMessageId = crypto.randomUUID();
    const optimistic: ChatMessage = { id: clientMessageId, clientMessageId, text, time: formatTime(new Date()), createdAt: new Date().toISOString(), mine: true };
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, preview: text, time: optimistic.time, messages: [...chat.messages, optimistic] } : chat));
    setDraft("");
    try {
      const response = await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, clientMessageId }),
      });
      const data = await response.json() as { message?: ApiMessage; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error ?? "Message could not be sent.");
      const saved = data.message;
      setChats((current) => current.map((chat) => chat.id === activeChat.id ? {
        ...chat, messages: chat.messages.map((message) => message.id === clientMessageId ? {
          ...message, id: saved.id, createdAt: saved.createdAt, time: formatTime(saved.createdAt),
        } : message),
      } : chat));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message could not be sent.");
      setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.filter((message) => message.id !== clientMessageId) } : chat));
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  async function findContact(event: React.FormEvent) {
    event.preventDefault();
    setContactLoading(true);
    setContactError("");
    setFoundContact(null);
    try {
      const response = await fetch(`/api/contacts?phone=${encodeURIComponent(contactPhone)}`, { cache: "no-store" });
      const data = await response.json() as { contact?: Contact | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Contact lookup failed.");
      if (!data.contact) throw new Error("No Binary Chat account was found for this number.");
      setFoundContact(data.contact);
    } catch (cause) {
      setContactError(cause instanceof Error ? cause.message : "Contact lookup failed.");
    } finally {
      setContactLoading(false);
    }
  }

  async function startConversation() {
    if (!foundContact) return;
    setContactLoading(true);
    setContactError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: foundContact.id }) });
      const data = await response.json() as { conversation?: { id: string }; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error ?? "Could not start conversation.");
      await realtimeRef.current?.auth.authorize();
      await refreshConversations();
      setActiveId(data.conversation.id);
      setContactOpen(false);
      setContactPhone("");
      setFoundContact(null);
    } catch (cause) {
      setContactError(cause instanceof Error ? cause.message : "Could not start conversation.");
    } finally {
      setContactLoading(false);
    }
  }

  function toggleReveal(id: string) {
    setRevealedId((current) => current === id ? null : id);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><span>01</span></div><div><div className="brand-name">binary<span>.</span></div><div className="brand-caption">PRIVATE BY DESIGN</div></div><button className="icon-button sidebar-more" aria-label="More options"><MoreHorizontal size={19} /></button></div>
        <div className="profile-card"><div className="avatar avatar-self">J<span className="online-dot" /></div><div className="profile-copy"><strong>{displayName}</strong><span>Personal space</span></div><button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
        <div className="section-label"><span>MESSAGES</span><button className="icon-button tiny" onClick={() => { setContactOpen(true); setContactError(""); setFoundContact(null); }} aria-label="New conversation"><Plus size={17} /></button></div>
        <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
        <div className="chat-list">
          {loadingChats && <div className="empty-list"><LoaderCircle size={16} className="spin" /> Loading conversations</div>}
          {!loadingChats && filteredChats.length === 0 && <div className="empty-list">{query ? "No matching conversations" : "No conversations yet. Start one with +."}</div>}
          {filteredChats.map((chat) => <button key={chat.id} className={`chat-row ${activeId === chat.id ? "selected" : ""}`} onClick={() => { setActiveId(chat.id); setRevealedId(null); setChats((current) => current.map((item) => item.id === chat.id ? { ...item, unread: 0 } : item)); }}><div className={`avatar avatar-${chat.color}`}>{chat.initials}{chat.online && <span className="online-dot" />}</div><span className="chat-row-copy"><strong>{chat.name}</strong><span>{chat.preview === "Start a conversation" ? chat.preview : textToBinary(chat.preview).slice(0, 36)}</span></span><span className="chat-row-meta"><time>{chat.time}</time></span></button>)}
        </div>
        <div className="sidebar-bottom"><div className="privacy-note"><div className="privacy-icon"><ShieldCheck size={17} /></div><div><strong>Your space, your rules.</strong><span>Privacy is not an add-on.</span></div></div><button className="settings-link"><Settings2 size={17} /> Settings <ChevronDown size={15} /></button></div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          {activeChat ? <><div className={`avatar avatar-${activeChat.color}`}>{activeChat.initials}{activeChat.online && <span className="online-dot" />}</div><div className="header-person"><strong>{activeChat.name}</strong><span><i className={activeChat.online ? "status-live" : ""} />{activeChat.status}</span></div></> : <div className="header-person"><strong>Welcome to Binary Chat</strong><span>Start a private conversation</span></div>}
          <div className="header-actions"><div className="secure-pill"><LockKeyhole size={12} /> SESSION ACTIVE</div><button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button></div>
        </header>
        <div className="chat-body">
          {activeChat ? <>
            <div className="date-divider"><span />LIVE CONVERSATION<span /></div>
            <div className="encryption-banner"><LockKeyhole size={13} /><span>Messages are displayed in binary on your screen.</span><button aria-label="About binary display"><CircleHelp size={14} /></button></div>
            {loadingMessages && <div className="empty-state"><LoaderCircle size={18} className="spin" /> Loading messages</div>}
            {!loadingMessages && activeChat.messages.length === 0 && <div className="empty-state"><MessageCircle size={22} /><strong>No messages yet</strong><span>Say hello to start this conversation.</span></div>}
            <div className="messages">{activeChat.messages.map((message) => { const isRevealed = revealedId === message.id; return <div key={message.id} className={`message-line ${message.mine ? "mine" : "theirs"}`}><div className={`message-bubble ${message.mine ? "bubble-mine" : "bubble-theirs"}`}><p className={`message-content ${!isRevealed ? "binary-text" : ""}`}>{isRevealed ? message.text : textToBinary(message.text)}</p><div className="message-footer"><span>{message.time}</span>{message.mine && (message.read ? <CheckCheck size={14} className="read-check" /> : message.delivered ? <CheckCheck size={14} /> : <Check size={14} />)}<button className={`reveal-button ${isRevealed ? "revealing" : ""}`} onClick={() => toggleReveal(message.id)} aria-label={isRevealed ? "Hide original message" : "Reveal original message for five seconds"} title={isRevealed ? "Hide message" : "Reveal for 5 seconds"}>{isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}</button>{isRevealed && <span className="reveal-count">{secondsLeft}s</span>}</div></div></div>; })}</div>
          </> : <div className="empty-state empty-welcome"><div className="welcome-orbit"><span>010</span><b>101</b><span>110</span></div><strong>Your conversations start here.</strong><span>Find someone by phone number to send your first message.</span><button className="start-chat-button" onClick={() => setContactOpen(true)}><UserRoundPlus size={15} /> New conversation</button></div>}
        </div>
        {activeChat && <form className="composer" onSubmit={sendMessage}><button type="button" className="icon-button composer-tool" aria-label="Emoji"><Smile size={19} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message..." aria-label="Message text" /><span className="composer-hint">ENTER ↵</span><button type="submit" className="send-button" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}</button></form>}
        {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={13} /></button></div>}
        <div className="chat-footnote"><span><Wifi size={12} /> {realtimeStatus === "connected" ? "REALTIME CONNECTED" : realtimeStatus === "connecting" ? "CONNECTING…" : "RECONNECTING…"}</span><span>UTF-8 BINARY DISPLAY <b>·</b> LIVE CHAT</span></div>
      </section>

      <aside className="details-panel"><div className="details-top"><span>YOUR EXPERIENCE</span><button className="icon-button" aria-label="Close details"><X size={17} /></button></div><div className="hero-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>010</span><b>101</b><span>110</span></div><Sparkles className="orbit-spark" size={17} /></div><div className="details-intro"><span className="eyebrow">A NEW KIND OF QUIET</span><h2>Say it in<br /><em>your</em> language.</h2><p>Your words stay yours. See every message as a stream of bits, and reveal the original only when you choose.</p></div><div className="feature-list"><div className="feature-item"><div className="feature-icon"><Eye size={16} /></div><div><strong>Five-second reveal</strong><span>Tap the eye to read. It hides again automatically.</span></div></div><div className="feature-item"><div className="feature-icon"><ShieldCheck size={16} /></div><div><strong>Privacy-first by design</strong><span>Reveal state stays on this device.</span></div></div><div className="feature-item"><div className="feature-icon"><MessageCircle size={16} /></div><div><strong>Human conversations</strong><span>Familiar chat, a different point of view.</span></div></div></div><div className="coming-soon"><div className="coming-icon"><Bell size={15} /></div><div><strong>More thoughtful features</strong><span>Messages sync across your signed-in devices.</span></div><span className="soon-tag">LIVE</span></div><div className="details-footer"><span>BUILT FOR THE IN-BETWEEN</span><span>v0.1.3</span></div></aside>

      {contactOpen && <div className="contact-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactOpen(false); }}><section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title"><div className="contact-dialog-head"><div><span className="eyebrow">CONNECT WITH SOMEONE</span><h2 id="contact-title">New conversation</h2></div><button className="icon-button" onClick={() => setContactOpen(false)} aria-label="Close dialog"><X size={18} /></button></div><p>Search by their registered phone number, including country code.</p><form onSubmit={findContact} className="contact-form"><label htmlFor="contact-phone">PHONE NUMBER</label><input id="contact-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="+8801XXXXXXXXX" autoComplete="tel" required /><button type="submit" disabled={contactLoading || !contactPhone.trim()}>{contactLoading ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />} Find account</button></form>{contactError && <p className="contact-error" role="alert">{contactError}</p>}{foundContact && <div className="found-contact"><div className="avatar avatar-blue">{initialsFor(foundContact.displayName || foundContact.phone)}</div><div><strong>{foundContact.displayName || foundContact.phone}</strong><span>{foundContact.phone}</span></div><button onClick={startConversation} disabled={contactLoading}>{contactLoading ? "Opening…" : "Message"}</button></div>}</section></div>}
    </main>
  );
}
