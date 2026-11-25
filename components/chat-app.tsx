"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadAblyBrowserSdk, type AblyClientMessage, type AblyPresenceMessage, type AblyRealtimeClient } from "@/lib/ably-browser";
import { Bell, Check, CheckCheck, ChevronDown, CircleHelp, Eye, EyeOff, LockKeyhole, MessageCircle, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, Smile, Sparkles, Wifi, X, LogOut, LoaderCircle, UserRoundPlus, Save, Trash2 } from "lucide-react";
import { textToBinary } from "@/lib/binary";
import { enqueueOfflineMessage, listOfflineMessages, removeOfflineMessage, type OfflineQueuedMessage } from "@/lib/offline-message-queue";

type ApiMember = { id: string; phone: string; displayName: string; avatarUrl: string };
type ApiMessage = { id: string; text: string; senderId: string; recipientId: string; createdAt: string; deliveredAt?: string | null; readAt?: string | null; clientMessageId: string };
type ChatMessage = { id: string; text: string; time: string; mine: boolean; read?: boolean; delivered?: boolean; createdAt: string; clientMessageId?: string; deliveryStatus?: "queued" | "sending" };
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
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedMessage[]>([]);
  const [offlineQueueLoaded, setOfflineQueueLoaded] = useState(false);
  const [networkRevision, setNetworkRevision] = useState(0);
  const [error, setError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const [foundContact, setFoundContact] = useState<Contact | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [profileName, setProfileName] = useState(displayName);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const realtimeRef = useRef<AblyRealtimeClient | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const activeIdRef = useRef(activeId);
  const sendingQueueRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activeChat = chats.find((chat) => chat.id === activeId) ?? null;
  const filteredChats = useMemo(() => chats.filter((chat) => chat.name.toLowerCase().includes(query.toLowerCase()) || chat.preview.toLowerCase().includes(query.toLowerCase())), [chats, query]);

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Could not load conversations.");
    const data = await response.json() as { conversations: Array<{ id: string; members: ApiMember[]; latestMessage: { text: string; senderId: string; createdAt: string } | null; unreadCount: number; updatedAt: string }> };
    const next: Conversation[] = data.conversations.map((item, index) => {
      const other = item.members.find((member) => member.id !== userId);
      const name = other?.displayName || other?.phone || "Unknown contact";
      return {
        id: item.id, userId: other?.id ?? "", name, initials: initialsFor(name),
        color: avatarColors[index % avatarColors.length], status: "last seen recently",
        preview: item.latestMessage?.text ?? "Start a conversation", time: item.latestMessage ? formatTime(item.latestMessage.createdAt) : "",
        unread: item.unreadCount, online: false, messages: [],
      };
    });
    setChats((current) => next.map((item) => {
      const previous = current.find((chat) => chat.id === item.id);
      return previous ? { ...item, messages: previous.messages, online: previous.online } : item;
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
    if (loadingChats || offlineQueueLoaded) return;
    let cancelled = false;
    void listOfflineMessages(userId).then((items) => {
      if (cancelled) return;
      setOfflineQueue(items);
      setChats((current) => current.map((chat) => {
        const restored = items.filter((item) => item.conversationId === chat.id).map((item) => ({
          id: item.clientMessageId, clientMessageId: item.clientMessageId, text: item.text, mine: true,
          time: formatTime(item.createdAt), createdAt: item.createdAt, deliveryStatus: "queued" as const,
        }));
        const existing = new Set(chat.messages.map((message) => message.clientMessageId ?? message.id));
        const additions = restored.filter((message) => !existing.has(message.clientMessageId));
        return additions.length ? { ...chat, messages: [...chat.messages, ...additions], preview: additions.at(-1)?.text ?? chat.preview } : chat;
      }));
    }).catch(() => {
      if (!cancelled) setError("Offline message storage is unavailable. Please keep your draft until storage is restored.");
    }).finally(() => { if (!cancelled) setOfflineQueueLoaded(true); });
    return () => { cancelled = true; };
  }, [loadingChats, offlineQueueLoaded, userId]);

  useEffect(() => {
    const onOnline = () => setNetworkRevision((value) => value + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  async function transmitQueuedMessage(item: OfflineQueuedMessage) {
    const key = `${item.userId}:${item.conversationId}:${item.clientMessageId}`;
    if (sendingQueueRef.current.has(key)) return;
    sendingQueueRef.current.add(key);
    setChats((current) => current.map((chat) => chat.id === item.conversationId ? {
      ...chat, messages: chat.messages.map((message) => message.clientMessageId === item.clientMessageId || message.id === item.clientMessageId ? { ...message, deliveryStatus: "sending" } : message),
    } : chat));
    try {
      const response = await fetch(`/api/conversations/${item.conversationId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text, clientMessageId: item.clientMessageId }),
      });
      const data = await response.json() as { message?: ApiMessage; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error ?? "Message could not be sent.");
      await removeOfflineMessage(item);
      setOfflineQueue((current) => current.filter((queued) => queued.clientMessageId !== item.clientMessageId || queued.conversationId !== item.conversationId));
      const saved = data.message;
      setChats((current) => current.map((chat) => chat.id === item.conversationId ? {
        ...chat, preview: saved.text, time: formatTime(saved.createdAt),
        messages: chat.messages.map((message) => message.clientMessageId === item.clientMessageId || message.id === item.clientMessageId ? {
          ...message, id: saved.id, createdAt: saved.createdAt, time: formatTime(saved.createdAt), deliveryStatus: undefined,
        } : message),
      } : chat));
    } catch {
      setChats((current) => current.map((chat) => chat.id === item.conversationId ? {
        ...chat, messages: chat.messages.map((message) => message.clientMessageId === item.clientMessageId || message.id === item.clientMessageId ? { ...message, deliveryStatus: "queued" } : message),
      } : chat));
    } finally {
      sendingQueueRef.current.delete(key);
    }
  }

  useEffect(() => {
    if (!offlineQueueLoaded || offlineQueue.length === 0 || !navigator.onLine) return;
    void Promise.all(offlineQueue.map((item) => transmitQueuedMessage(item)));
    const retry = window.setTimeout(() => setNetworkRevision((value) => value + 1), 10_000);
    return () => window.clearTimeout(retry);
  }, [offlineQueue, offlineQueueLoaded, realtimeStatus, networkRevision]);

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
          return { ...item, preview: message.text, time: message.time, messages, unread: message.mine || activeIdRef.current === chat.id ? 0 : item.unread + 1 };
        }));
        if (payload.senderId !== userId) {
          void fetch(`/api/conversations/${chat.id}/messages`, { cache: "no-store" }).then((response) => response.json()).then((data: { messages?: ApiMessage[] }) => {
            if (activeIdRef.current !== chat.id) return;
            const ids = (data.messages ?? []).filter((item) => item.senderId !== userId && !item.readAt).map((item) => item.id);
            if (ids.length) void fetch(`/api/conversations/${chat.id}/messages`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: ids }) });
          }).catch(() => undefined);
        }
      };
      const handleDelivered = (event: AblyClientMessage) => {
        if ((event.data as { recipientId?: string }).recipientId !== chat.userId) return;
        setChats((current) => current.map((item) => item.id === chat.id ? { ...item, messages: item.messages.map((message) => message.mine ? { ...message, delivered: true } : message) } : item));
      };
      const handleRead = (event: AblyClientMessage) => {
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
  }, [chats, realtimeStatus, userId]);

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
          setChats((current) => current.map((chat) => {
            if (chat.id !== activeConversationId) return chat;
            const pending = chat.messages.filter((message) => message.deliveryStatus === "queued" || message.deliveryStatus === "sending");
            const ids = new Set(messages.map((message) => message.id));
            return { ...chat, messages: [...messages, ...pending.filter((message) => !ids.has(message.id))], preview: pending.at(-1)?.text ?? messages.at(-1)?.text ?? "Start a conversation" };
          }));
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

  async function openProfileSettings() {
    setProfileOpen(true);
    setProfileError("");
    setProfileSuccess("");
    setDeleteConfirmation("");
    setProfileLoading(true);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await response.json() as { user?: { displayName: string; avatarUrl: string }; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Could not load your profile.");
      setProfileName(data.user.displayName);
      setProfileAvatarUrl(data.user.avatarUrl);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not load your profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE" || deletingAccount) return;
    setDeletingAccount(true);
    setProfileError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete your account.");
      await realtimeRef.current?.close();
      realtimeRef.current = null;
      router.replace("/login?accountDeleted=1");
      router.refresh();
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not delete your account.");
      setDeletingAccount(false);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: profileName, avatarUrl: profileAvatarUrl.trim() || null }),
      });
      const data = await response.json() as { user?: { displayName: string; avatarUrl: string }; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Could not update your profile.");
      setProfileName(data.user.displayName);
      setProfileAvatarUrl(data.user.avatarUrl);
      setProfileSuccess("Your profile has been updated.");
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not update your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

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
    const createdAt = new Date().toISOString();
    const queued: OfflineQueuedMessage = { userId, conversationId: activeChat.id, clientMessageId, text, createdAt };
    try {
      await enqueueOfflineMessage(queued);
    } catch {
      setError("Could not safely save this message for retry. Your draft has been kept.");
      setSending(false);
      return;
    }
    setOfflineQueue((current) => [...current, queued]);
    const optimistic: ChatMessage = { id: clientMessageId, clientMessageId, text, time: formatTime(new Date()), createdAt, mine: true, deliveryStatus: "queued" };
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, preview: text, time: optimistic.time, messages: [...chat.messages, optimistic] } : chat));
    setDraft("");
    try {
      await transmitQueuedMessage(queued);
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
        <div className="profile-card"><div className="avatar avatar-self">J<span className="online-dot" /></div><div className="profile-copy"><strong>{profileName || "Your profile"}</strong><span>Personal space</span></div><button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
        <div className="section-label"><span>MESSAGES</span><button className="icon-button tiny" onClick={() => { setContactOpen(true); setContactError(""); setFoundContact(null); }} aria-label="New conversation"><Plus size={17} /></button></div>
        <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
        <div className="chat-list">
          {loadingChats && <div className="empty-list"><LoaderCircle size={16} className="spin" /> Loading conversations</div>}
          {!loadingChats && filteredChats.length === 0 && <div className="empty-list">{query ? "No matching conversations" : "No conversations yet. Start one with +."}</div>}
          {filteredChats.map((chat) => <button key={chat.id} className={`chat-row ${activeId === chat.id ? "selected" : ""}`} onClick={() => { setActiveId(chat.id); setRevealedId(null); setChats((current) => current.map((item) => item.id === chat.id ? { ...item, unread: 0 } : item)); }}><div className={`avatar avatar-${chat.color}`}>{chat.initials}{chat.online && <span className="online-dot" />}</div><span className="chat-row-copy"><strong>{chat.name}</strong><span>{chat.preview === "Start a conversation" ? chat.preview : textToBinary(chat.preview).slice(0, 36)}</span></span><span className="chat-row-meta"><time>{chat.time}</time></span></button>)}
        </div>
        <div className="sidebar-bottom"><div className="privacy-note"><div className="privacy-icon"><ShieldCheck size={17} /></div><div><strong>Your space, your rules.</strong><span>Privacy is not an add-on.</span></div></div><button className="settings-link" onClick={openProfileSettings}><Settings2 size={17} /> Profile settings <ChevronDown size={15} /></button></div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          {activeChat ? <><div className={`avatar avatar-${activeChat.color}`}>{activeChat.initials}{activeChat.online && <span className="online-dot" />}</div><div className="header-person"><strong>{activeChat.name}</strong><span><i className={activeChat.online ? "status-live" : ""} />{activeChat.status}</span></div></> : <div className="header-person"><strong>Welcome to Binary Chat</strong><span>Start a private conversation</span></div>}
          <div className="header-actions"><button className="icon-button" onClick={openProfileSettings} aria-label="Open profile settings" title="Profile settings"><Settings2 size={17} /></button><div className="secure-pill"><LockKeyhole size={12} /> SESSION ACTIVE</div><button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button></div>
        </header>
        <div className="chat-body">
          {activeChat ? <>
            <div className="date-divider"><span />LIVE CONVERSATION<span /></div>
            <div className="encryption-banner"><LockKeyhole size={13} /><span>Messages are displayed in binary on your screen.</span><button aria-label="About binary display"><CircleHelp size={14} /></button></div>
            {loadingMessages && <div className="empty-state"><LoaderCircle size={18} className="spin" /> Loading messages</div>}
            {!loadingMessages && activeChat.messages.length === 0 && <div className="empty-state"><MessageCircle size={22} /><strong>No messages yet</strong><span>Say hello to start this conversation.</span></div>}
            <div className="messages">{activeChat.messages.map((message) => { const isRevealed = revealedId === message.id; return <div key={message.id} className={`message-line ${message.mine ? "mine" : "theirs"}`}><div className={`message-bubble ${message.mine ? "bubble-mine" : "bubble-theirs"}`}><p className={`message-content ${!isRevealed ? "binary-text" : ""}`}>{isRevealed ? message.text : textToBinary(message.text)}</p><div className="message-footer"><span>{message.time}</span>{message.deliveryStatus && <span role="status">{message.deliveryStatus === "sending" ? "Sending…" : "Queued"}</span>}{message.mine && !message.deliveryStatus && (message.read ? <CheckCheck size={14} className="read-check" /> : message.delivered ? <CheckCheck size={14} /> : <Check size={14} />)}<button className={`reveal-button ${isRevealed ? "revealing" : ""}`} onClick={() => toggleReveal(message.id)} aria-label={isRevealed ? "Hide original message" : "Reveal original message for five seconds"} title={isRevealed ? "Hide message" : "Reveal for 5 seconds"}>{isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}</button>{isRevealed && <span className="reveal-count">{secondsLeft}s</span>}</div></div></div>; })}</div>
          </> : <div className="empty-state empty-welcome"><div className="welcome-orbit"><span>010</span><b>101</b><span>110</span></div><strong>Your conversations start here.</strong><span>Find someone by phone number to send your first message.</span><button className="start-chat-button" onClick={() => setContactOpen(true)}><UserRoundPlus size={15} /> New conversation</button></div>}
        </div>
        {activeChat && <form className="composer" onSubmit={sendMessage}><button type="button" className="icon-button composer-tool" aria-label="Emoji"><Smile size={19} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message..." aria-label="Message text" /><span className="composer-hint">ENTER ↵</span><button type="submit" className="send-button" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}</button></form>}
        {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={13} /></button></div>}
        <div className="chat-footnote"><span><Wifi size={12} /> {realtimeStatus === "connected" ? "REALTIME CONNECTED" : realtimeStatus === "connecting" ? "CONNECTING…" : "RECONNECTING…"}</span><span>UTF-8 BINARY DISPLAY <b>·</b> LIVE CHAT</span></div>
      </section>

      <aside className="details-panel"><div className="details-top"><span>YOUR EXPERIENCE</span><button className="icon-button" aria-label="Close details"><X size={17} /></button></div><div className="hero-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>010</span><b>101</b><span>110</span></div><Sparkles className="orbit-spark" size={17} /></div><div className="details-intro"><span className="eyebrow">A NEW KIND OF QUIET</span><h2>Say it in<br /><em>your</em> language.</h2><p>Your words stay yours. See every message as a stream of bits, and reveal the original only when you choose.</p></div><div className="feature-list"><div className="feature-item"><div className="feature-icon"><Eye size={16} /></div><div><strong>Five-second reveal</strong><span>Tap the eye to read. It hides again automatically.</span></div></div><div className="feature-item"><div className="feature-icon"><ShieldCheck size={16} /></div><div><strong>Privacy-first by design</strong><span>Reveal state stays on this device.</span></div></div><div className="feature-item"><div className="feature-icon"><MessageCircle size={16} /></div><div><strong>Human conversations</strong><span>Familiar chat, a different point of view.</span></div></div></div><div className="coming-soon"><div className="coming-icon"><Bell size={15} /></div><div><strong>More thoughtful features</strong><span>Messages sync across your signed-in devices.</span></div><span className="soon-tag">LIVE</span></div><div className="details-footer"><span>BUILT FOR THE IN-BETWEEN</span><span>v0.1.3</span></div></aside>

      {profileOpen && <div className="contact-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !profileSaving) setProfileOpen(false); }}><section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="contact-dialog-head"><div><span className="eyebrow">YOUR ACCOUNT</span><h2 id="profile-title">Profile settings</h2></div><button className="icon-button" onClick={() => setProfileOpen(false)} disabled={profileSaving || deletingAccount} aria-label="Close profile settings"><X size={18} /></button></div><p>Your name and avatar are visible to people you chat with.</p>{profileLoading && <p className="profile-loading" role="status">Loading your account…</p>}<form onSubmit={saveProfile} className="contact-form"><label htmlFor="profile-name">DISPLAY NAME</label><input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={40} minLength={1} required autoComplete="name" /><label htmlFor="profile-avatar">AVATAR IMAGE URL (HTTPS)</label><input id="profile-avatar" type="url" value={profileAvatarUrl} onChange={(event) => setProfileAvatarUrl(event.target.value)} placeholder="https://example.com/avatar.jpg" autoComplete="url" /><button type="submit" disabled={profileSaving || profileLoading || deletingAccount || !profileName.trim()}>{profileSaving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save profile</button></form>{profileError && <p className="contact-error" role="alert">{profileError}</p>}{profileSuccess && <p className="profile-success" role="status">{profileSuccess}</p>}<div className="profile-account-meta"><span>PHONE NUMBER</span><strong>Account verified by phone</strong><small>Your phone number cannot be changed here.</small></div><div className="danger-zone"><span className="danger-eyebrow">DANGER ZONE</span><strong>Delete your account</strong><p>This permanently deletes your account, profile, conversations and messages in those conversations for everyone. This cannot be undone.</p><label htmlFor="delete-confirmation">TYPE DELETE TO CONFIRM</label><input id="delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={deletingAccount} /><button className="delete-account-button" onClick={deleteAccount} disabled={deleteConfirmation !== "DELETE" || deletingAccount}>{deletingAccount ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />} Permanently delete account</button></div></section></div>}

      {contactOpen && <div className="contact-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactOpen(false); }}><section className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title"><div className="contact-dialog-head"><div><span className="eyebrow">CONNECT WITH SOMEONE</span><h2 id="contact-title">New conversation</h2></div><button className="icon-button" onClick={() => setContactOpen(false)} aria-label="Close dialog"><X size={18} /></button></div><p>Search by their registered phone number, including country code.</p><form onSubmit={findContact} className="contact-form"><label htmlFor="contact-phone">PHONE NUMBER</label><input id="contact-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="+8801XXXXXXXXX" autoComplete="tel" required /><button type="submit" disabled={contactLoading || !contactPhone.trim()}>{contactLoading ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />} Find account</button></form>{contactError && <p className="contact-error" role="alert">{contactError}</p>}{foundContact && <div className="found-contact"><div className="avatar avatar-blue">{initialsFor(foundContact.displayName || foundContact.phone)}</div><div><strong>{foundContact.displayName || foundContact.phone}</strong><span>{foundContact.phone}</span></div><button onClick={startConversation} disabled={contactLoading}>{contactLoading ? "Opening…" : "Message"}</button></div>}</section></div>}
    </main>
  );
}
