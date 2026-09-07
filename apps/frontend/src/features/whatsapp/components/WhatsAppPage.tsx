import { useEffect, useMemo, useState } from 'react';
import { getApiErrorMessage } from '../../../api/client';
import {
  disconnectWhatsApp,
  fetchWhatsAppConnection,
  fetchWhatsAppConversations,
  fetchWhatsAppMessages,
  markWhatsAppConversationRead,
  sendWhatsAppText,
  startWhatsAppConnection,
  stopWhatsAppConnection,
} from '../api/whatsapp.api';
import { useWhatsAppSocket } from '../hooks/useWhatsAppSocket';
import { WhatsAppConnection, WhatsAppConversation, WhatsAppMessage } from '../types';

export function WhatsAppPage({ activePropertyId }: { activePropertyId: string }) {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [search, setSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useWhatsAppSocket(activePropertyId, {
    onConnectionState: (state) => {
      setConnection((current) => current ? { ...current, status: state.status as WhatsAppConnection['status'] } : current);
      if (state.status === 'CONNECTED') void refreshConnection();
    },
    onQr: (payload) => setQrDataUrl(payload.qrDataUrl),
    onMessageNew: (payload) => {
      upsertConversation(payload.conversation);
      if (payload.conversation.id === selectedId) {
        setMessages((items) => [...items.filter((item) => item.id !== payload.message.id), payload.message]);
      }
    },
    onMessageUpdated: (message) => {
      setMessages((items) => items.map((item) => item.id === message.id ? message : item));
    },
    onConversationUpdated: upsertConversation,
  });

  useEffect(() => {
    setConnection(null);
    setQrDataUrl(null);
    setConversations([]);
    setSelectedId(null);
    setMessages([]);
    if (activePropertyId) void bootstrap();
  }, [activePropertyId]);

  useEffect(() => {
    if (connection?.status === 'CONNECTED' && activePropertyId) {
      void loadConversations();
    }
  }, [connection?.status, activePropertyId, search]);

  useEffect(() => {
    if (!activePropertyId || !selectedId) {
      setMessages([]);
      return;
    }
    void fetchWhatsAppMessages(activePropertyId, selectedId)
      .then((page) => setMessages(page.items))
      .then(() => markWhatsAppConversationRead(activePropertyId, selectedId))
      .then((updated) => upsertConversation(updated))
      .catch((err) => setError(getApiErrorMessage(err)));
  }, [activePropertyId, selectedId]);

  async function bootstrap() {
    setError(null);
    try {
      const snapshot = await fetchWhatsAppConnection(activePropertyId);
      setConnection(snapshot);
      if (snapshot.qrDataUrl) setQrDataUrl(snapshot.qrDataUrl);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function refreshConnection() {
    if (!activePropertyId) return;
      const snapshot = await fetchWhatsAppConnection(activePropertyId);
      setConnection(snapshot);
      if (snapshot.status === 'CONNECTED') setQrDataUrl(null);
      else if (snapshot.qrDataUrl) setQrDataUrl(snapshot.qrDataUrl);
  }

  async function loadConversations() {
    try {
      const page = await fetchWhatsAppConversations(activePropertyId, search);
      setConversations(page.items);
      if (!selectedId && page.items[0]) setSelectedId(page.items[0].id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function connect() {
    setLoading(true);
    setError(null);
    setQrDataUrl(null);
    try {
      const snapshot = await startWhatsAppConnection(activePropertyId);
      setConnection(snapshot);
      if (snapshot.qrDataUrl) setQrDataUrl(snapshot.qrDataUrl);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    setError(null);
    try {
      setConnection(await stopWhatsAppConnection(activePropertyId));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect WhatsApp and require a fresh QR scan next time?')) return;
    setLoading(true);
    setError(null);
    try {
      setConnection(await disconnectWhatsApp(activePropertyId));
      setQrDataUrl(null);
      setConversations([]);
      setMessages([]);
      setSelectedId(null);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = composer.trim();
    if (!text || !selectedId) return;
    setComposer('');
    try {
      const message = await sendWhatsAppText(activePropertyId, selectedId, text);
      setMessages((items) => [...items.filter((item) => item.id !== message.id), message]);
      void loadConversations();
    } catch (err) {
      setComposer(text);
      setError(getApiErrorMessage(err));
    }
  }

  function upsertConversation(conversation: WhatsAppConversation) {
    setConversations((items) => {
      const next = [conversation, ...items.filter((item) => item.id !== conversation.id)];
      return next.sort((a, b) => Date.parse(b.lastMessageAt ?? '0') - Date.parse(a.lastMessageAt ?? '0'));
    });
  }

  if (!activePropertyId) {
    return (
      <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8">
        <h2 className="text-lg font-bold text-slate-900">Select a property</h2>
        <p className="mt-2 text-sm text-slate-500">WhatsApp linked-device sessions are isolated per property.</p>
      </section>
    );
  }

  const connected = connection?.status === 'CONNECTED';
  const waitingForQr = connection?.status === 'CONNECTING' || connection?.status === 'QR_REQUIRED';

  return (
    <div className="min-h-[calc(100dvh-7rem)]">
      <section className="fixed bottom-5 right-5 top-[4.25rem] z-20 flex w-[min(430px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-950">WhatsApp</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {connected ? `Connected as ${connection.phoneE164 ?? connection.phoneNumber ?? connection.displayName ?? 'linked device'}` : 'Link a normal WhatsApp account as an additional device.'}
          </p>
        </div>
        <StatusPill status={connection?.status ?? 'NOT_CONNECTED'} />
        {connected && (
          <>
            <button type="button" onClick={stop} disabled={loading} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Stop</button>
            <button type="button" onClick={disconnect} disabled={loading} className="h-8 rounded-md border border-rose-200 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50">Disconnect</button>
          </>
        )}
      </header>

      {error && (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs font-semibold text-rose-700">{error}</div>
      )}

      {!connected ? (
        <ConnectPanel
          loading={loading}
          waitingForQr={waitingForQr}
          qrDataUrl={qrDataUrl}
          status={connection?.status ?? 'NOT_CONNECTED'}
          onConnect={connect}
          onCancel={stop}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1">
          <aside className={`min-h-0 ${selectedId ? 'hidden' : 'flex'} flex-col`}>
            <div className="border-b border-slate-100 p-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-6 text-sm text-slate-400">No WhatsApp conversations received yet.</div>
              ) : conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${selectedId === conversation.id ? 'bg-emerald-50/70' : ''}`}
                >
                  <Avatar name={conversation.displayName ?? conversation.phoneE164 ?? 'WA'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">{conversation.displayName ?? conversation.phoneE164 ?? 'Unknown'}</span>
                      {conversation.unreadCount > 0 && <span className="ml-auto rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{conversation.lastMessagePreview ?? 'No preview'}</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{formatTime(conversation.lastMessageAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className={`${selectedId ? 'flex' : 'hidden'} min-h-0 flex-col`}>
            {selectedConversation ? (
              <>
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button type="button" onClick={() => setSelectedId(null)} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500">‹</button>
                  <Avatar name={selectedConversation.displayName ?? selectedConversation.phoneE164 ?? 'WA'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950">{selectedConversation.displayName ?? selectedConversation.phoneE164 ?? 'Unknown'}</p>
                    <p className="truncate text-xs text-slate-500">{selectedConversation.phoneE164 ?? selectedConversation.remoteJid}</p>
                  </div>
                </div>
                {selectedConversation.reservation && <ReservationContext conversation={selectedConversation} />}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f8faf9] px-4 py-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${message.fromMe ? 'bg-emerald-600 text-white' : 'bg-white text-slate-800'}`}>
                        <p className="whitespace-pre-wrap break-words">{message.body ?? `[${message.type.toLowerCase()}]`}</p>
                        <p className={`mt-1 text-[10px] ${message.fromMe ? 'text-emerald-50/80' : 'text-slate-400'}`}>{formatTime(message.whatsappTimestamp)} · {message.status.toLowerCase()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-100 p-3">
                  <input
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder="Type a message"
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />
                  <button type="submit" className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">Send</button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a conversation</div>
            )}
          </main>
        </div>
      )}
      </section>
    </div>
  );
}

function ConnectPanel({ loading, waitingForQr, qrDataUrl, status, onConnect, onCancel }: {
  loading: boolean;
  waitingForQr: boolean;
  qrDataUrl: string | null;
  status: string;
  onConnect: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">{qrDataUrl ? 'Scan QR code' : 'Connect WhatsApp'}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This links your WhatsApp account as an additional device so staff can view and reply from the HMS.
        </p>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          This is a WhatsApp Web-compatible linked-device connector, not the official WhatsApp Business API.
        </div>
        {qrDataUrl && (
          <div className="mt-5 flex justify-center rounded-lg border border-slate-200 bg-white p-4">
            <img src={qrDataUrl} alt="WhatsApp link QR code" className="h-64 w-64" />
          </div>
        )}
        {waitingForQr && !qrDataUrl && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">Waiting for QR code...</div>
        )}
        <div className="mt-5 text-xs leading-5 text-slate-500">
          Open WhatsApp on your phone, go to Linked devices, choose Link a device, then scan this code.
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onConnect}
            disabled={loading || waitingForQr}
            className="h-10 flex-1 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'LOGGED_OUT' ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
          </button>
          {waitingForQr && (
            <button type="button" onClick={onCancel} className="h-10 rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReservationContext({ conversation }: { conversation: WhatsAppConversation }) {
  const reservation = conversation.reservation;
  if (!reservation) return null;
  return (
    <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-900">
      <span className="font-bold">{reservation.code}</span>
      <span className="mx-2 text-emerald-700">·</span>
      <span>{reservation.room ? `Room ${reservation.room}` : 'Room not assigned'}</span>
      <span className="mx-2 text-emerald-700">·</span>
      <span>{reservation.checkIn ?? '-'} to {reservation.checkOut ?? '-'}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const connected = status === 'CONNECTED';
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-bold ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
      {(name.trim()[0] ?? 'W').toUpperCase()}
    </span>
  );
}

function formatTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
