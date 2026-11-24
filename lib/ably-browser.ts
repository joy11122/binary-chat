export type AblyClientMessage = { data: unknown; clientId?: string };
export type AblyPresenceMessage = { clientId?: string; action?: string };

export interface AblyChannel {
  subscribe(eventName: string, callback: (message: AblyClientMessage) => void): void;
  presence: {
    subscribe(events: string[], callback: (message: AblyPresenceMessage) => void): void;
    enter(): Promise<void>;
    get(): Promise<AblyPresenceMessage[]>;
  };
}

export interface AblyRealtimeClient {
  connection: {
    on(event: string, callback: () => void): void;
    off(event: string, callback: () => void): void;
  };
  channels: { get(name: string): AblyChannel };
  auth: { authorize(): Promise<unknown> };
  close(): void;
}

declare global {
  interface Window {
    Ably?: {
      Realtime: new (options: { authUrl: string; authMethod: "GET" }) => AblyRealtimeClient;
    };
  }
}

export function loadAblyBrowserSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser runtime required."));
  if (window.Ably) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>("script[data-ably-browser-sdk]");
    const handleLoad = () => window.Ably ? resolve() : reject(new Error("Ably browser SDK did not initialize."));
    const handleError = () => reject(new Error("Could not load the realtime messaging SDK."));

    if (!script) {
      script = document.createElement("script");
      script.src = "https://cdn.ably.com/lib/ably.min-2.js";
      script.async = true;
      script.dataset.ablyBrowserSdk = "true";
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      document.head.appendChild(script);
      return;
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });
}
