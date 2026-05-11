import { AuthResponse, AuthUser } from './types';

const sessionUpdatedEventName = 'hms:session-updated';

export const accessTokenStorageKey = 'hms_access_token';
export const refreshTokenStorageKey = 'hms_refresh_token';
export const userStorageKey = 'hms_user';
export const activePageStorageKey = 'hms_active_page';

type SessionUpdateDetail = {
  user: AuthUser | null;
};

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function emitSessionUpdated(user: AuthUser | null) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<SessionUpdateDetail>(sessionUpdatedEventName, {
      detail: { user },
    }),
  );
}

export function getStoredAccessToken() {
  return getStorage()?.getItem(accessTokenStorageKey) ?? null;
}

export function getStoredRefreshToken() {
  return getStorage()?.getItem(refreshTokenStorageKey) ?? null;
}

export function getStoredActivePage() {
  return getStorage()?.getItem(activePageStorageKey) ?? null;
}

export function setStoredActivePage(page: string) {
  getStorage()?.setItem(activePageStorageKey, page);
}

export function getStoredAuthUser() {
  const rawUser = getStorage()?.getItem(userStorageKey);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    clearStoredSession({ emit: false });
    return null;
  }
}

export function storeAuthSession(auth: AuthResponse) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(accessTokenStorageKey, auth.access_token);
  storage.setItem(refreshTokenStorageKey, auth.refresh_token);
  storage.setItem(userStorageKey, JSON.stringify(auth.user));
  emitSessionUpdated(auth.user);
}

export function clearStoredSession(options?: { emit?: boolean; preserveActivePage?: boolean }) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(accessTokenStorageKey);
  storage.removeItem(refreshTokenStorageKey);
  storage.removeItem(userStorageKey);

  if (!options?.preserveActivePage) {
    storage.removeItem(activePageStorageKey);
  }

  if (options?.emit !== false) {
    emitSessionUpdated(null);
  }
}

export function subscribeToSessionUpdates(listener: (user: AuthUser | null) => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleSessionUpdate = (event: Event) => {
    const detail = (event as CustomEvent<SessionUpdateDetail>).detail;
    listener(detail?.user ?? getStoredAuthUser());
  };

  window.addEventListener(sessionUpdatedEventName, handleSessionUpdate as EventListener);

  return () => {
    window.removeEventListener(sessionUpdatedEventName, handleSessionUpdate as EventListener);
  };
}
