import { GmailEmailProvider } from './gmail-email.provider';

describe('Gmail message loading', () => {
  const credential = { access_token: 'test-token' };
  let fetchMock: jest.SpyInstance;
  const originalPageSize = process.env.EMAIL_PROVIDER_SYNC_MAX_MESSAGES;
  const originalSpam = process.env.EMAIL_PROVIDER_INCLUDE_SPAM;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T10:30:00.500Z'));
    process.env.EMAIL_PROVIDER_SYNC_MAX_MESSAGES = '2';
    delete process.env.EMAIL_PROVIDER_INCLUDE_SPAM;
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalPageSize === undefined) delete process.env.EMAIL_PROVIDER_SYNC_MAX_MESSAGES;
    else process.env.EMAIL_PROVIDER_SYNC_MAX_MESSAGES = originalPageSize;
    if (originalSpam === undefined) delete process.env.EMAIL_PROVIDER_INCLUDE_SPAM;
    else process.env.EMAIL_PROVIDER_INCLUDE_SPAM = originalSpam;
  });
  const response = (data: unknown) => ({ ok: true, json: async () => data } as Response);

  it('fetches every results page, preserves filters, and deduplicates overlapping IDs', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [{ id: '3' }, { id: '2' }], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(response({ messages: [{ id: '2' }, { id: '1' }] }));
    const result = await new GmailEmailProvider().listMessageIds(credential, '2026-09-28T10:30:00Z', { fromEmail: 'test@example.com', subject: 'Test booking' });
    expect(result).toEqual({ ids: ['3', '2', '1'], nextCursor: '2026-09-29T10:30:00.500Z' });
    const urls = fetchMock.mock.calls.map(([url]) => new URL(url));
    expect(urls[0].searchParams.get('q')).toContain('from:"test@example.com" subject:"Test booking"');
    expect(urls[1].searchParams.get('q')).toBe(urls[0].searchParams.get('q'));
    expect(urls[1].searchParams.get('pageToken')).toBe('page-2');
    expect(urls[0].searchParams.get('includeSpamTrash')).toBe('true');
    expect(urls[0].searchParams.get('q')).toContain('-in:trash');
  });

  it('uses exact timestamps rather than timezone-dependent day boundaries', async () => {
    fetchMock.mockResolvedValue(response({}));
    await new GmailEmailProvider().listMessageIds(credential, '2026-09-28T10:30:00Z');
    const q = new URL(fetchMock.mock.calls[0][0]).searchParams.get('q');
    expect(q).toContain(`after:${Date.parse('2026-09-28T10:30:00Z') / 1000 - 1}`);
    expect(q).toContain(`before:${Math.ceil(Date.now() / 1000)}`);
    expect(q).not.toContain('subject:');
    expect(q).not.toContain('from:');
  });

  it('fails the whole listing if a later page fails, so its cursor cannot advance', async () => {
    fetchMock.mockResolvedValueOnce(response({ messages: [{ id: '1' }], nextPageToken: 'next' }))
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await expect(new GmailEmailProvider().listMessageIds(credential)).rejects.toThrow('HTTP 503');
  });

  it('stops repeated pagination tokens instead of looping forever', async () => {
    fetchMock.mockResolvedValue(response({ nextPageToken: 'same' }));
    await expect(new GmailEmailProvider().listMessageIds(credential)).rejects.toThrow('repeated results page');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors inbox-only configuration', async () => {
    process.env.EMAIL_PROVIDER_INCLUDE_SPAM = 'false';
    fetchMock.mockResolvedValue(response({}));
    await new GmailEmailProvider().listMessageIds(credential);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toContain('in:inbox');
    expect(url.searchParams.has('includeSpamTrash')).toBe(false);
  });
});
