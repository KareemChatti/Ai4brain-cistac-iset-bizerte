import { create } from "zustand";

export type Language = "en" | "fr" | "derja";

const KEYS = {
  userId: "ai4brain.user_id",
  consent: "ai4brain.consent_version",
  language: "ai4brain.language",
} as const;

export const CONSENT_VERSION = "2026-10-v1";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
  }
}

type AppState = {
  userId: string | null;
  sessionId: string;
  consentVersion: string | null;
  language: Language;
  setUserId: (id: string) => void;
  setConsent: (version: string) => void;
  setLanguage: (lang: Language) => void;
  reset: () => void;
};

export const useApp = create<AppState>((set) => ({
  userId: read(KEYS.userId),
  sessionId: crypto.randomUUID(),
  consentVersion: read(KEYS.consent),
  language: (read(KEYS.language) as Language | null) ?? "en",
  setUserId: (id) => {
    write(KEYS.userId, id);
    set({ userId: id });
  },
  setConsent: (version) => {
    write(KEYS.consent, version);
    set({ consentVersion: version });
  },
  setLanguage: (language) => {
    write(KEYS.language, language);
    set({ language });
  },
  reset: () => {
    Object.values(KEYS).forEach((k) => write(k, null));
    set({ userId: null, consentVersion: null, language: "en", sessionId: crypto.randomUUID() });
  },
}));
