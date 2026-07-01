import { NotificationsService } from '../notifications.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function makeDb(tables: Record<string, any[]> = {}) {
  const state = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, [...rows]])) as Record<string, any[]>;
  const matches = (row: any, filters: Array<[string, any]>) => filters.every(([key, value]) => row?.[key] === value);
  const makeChain = (table: string) => {
    const chain: any = { filters: [] as Array<[string, any]>, insertPayload: null as any, updatePayload: null as any };
    const rows = () => (state[table] ?? []).filter((row) => matches(row, chain.filters));
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn((key: string, value: any) => { chain.filters.push([key, value]); return chain; });
    chain.is = jest.fn((key: string, value: any) => { chain.filters.push([key, value]); return chain; });
    chain.order = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn(async (count: number) => ({ data: rows().slice(0, count), error: null }));
    chain.insert = jest.fn((payload: any) => { chain.insertPayload = payload; return chain; });
    chain.update = jest.fn((payload: any) => { chain.updatePayload = payload; return chain; });
    chain.maybeSingle = jest.fn(async () => {
      if (chain.insertPayload) {
        state[table] = state[table] ?? [];
        const row = { id: `${table}-${state[table].length + 1}`, created_at: '2026-06-12T00:00:00.000Z', ...chain.insertPayload };
        state[table].push(row);
        return { data: row, error: null };
      }
      if (chain.updatePayload) {
        const index = (state[table] ?? []).findIndex((row) => matches(row, chain.filters));
        if (index >= 0) {
          state[table][index] = { ...state[table][index], ...chain.updatePayload };
          return { data: state[table][index], error: null };
        }
        return { data: null, error: null };
      }
      return { data: rows()[0] ?? null, error: null };
    });
    chain.then = (resolve: any, reject: any) => {
      if (chain.updatePayload) {
        state[table] = (state[table] ?? []).map((row) => matches(row, chain.filters) ? { ...row, ...chain.updatePayload } : row);
      }
      return Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
    };
    return chain;
  };
  return { state, from: jest.fn().mockImplementation(makeChain) };
}

function makeService(db: any, config: Record<string, string> = {}) {
  return new NotificationsService(
    { db } as unknown as SupabaseService,
    { get: jest.fn((key: string) => config[key]) } as any,
  );
}

describe('NotificationsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists created payment issue notification and skips missing push/email safely', async () => {
    const db = makeDb();
    const service = makeService(db);

    const result = await service.notifyPaymentIssueCreated({
      id: 'case-1',
      user_id: 'user-1',
      provider: 'payos',
      issue_type: 'refund_request',
      status: 'open',
      admin_note: 'do not leak',
    });

    expect(result).toMatchObject({
      type: 'billing.payment_issue.created',
      title: 'Đã ghi nhận yêu cầu hỗ trợ thanh toán',
      body: 'Yêu cầu của bạn đã được ghi nhận. Admin sẽ kiểm tra và phản hồi sớm.',
      metadata: {
        payment_issue_id: 'case-1',
        issue_type: 'refund_request',
        status: 'open',
        provider: 'payos',
      },
    });
    expect(db.state.user_notifications[0].channel_status).toMatchObject({
      in_app: { status: 'delivered' },
      push: { status: 'skipped', reason: 'no_active_push_token' },
      email: { status: 'skipped', reason: 'email_provider_disabled' },
    });
    expect(JSON.stringify(result)).not.toContain('do not leak');
  });

  it('uses safe resolution for resolved and rejected notifications', async () => {
    const db = makeDb();
    const service = makeService(db);

    const resolved = await service.notifyPaymentIssueStatusChanged({
      id: 'case-1',
      user_id: 'user-1',
      provider: 'payos',
      issue_type: 'wrong_plan',
      status: 'resolved',
      resolution: 'Gói của bạn đã được kích hoạt lại.',
      admin_note: 'internal note',
    });
    const rejected = await service.notifyPaymentIssueStatusChanged({
      id: 'case-2',
      user_id: 'user-1',
      provider: 'payos',
      issue_type: 'refund_request',
      status: 'rejected',
      resolution: 'Yêu cầu không đủ điều kiện hoàn tiền.',
      admin_note: 'internal note',
    });

    expect(resolved).toMatchObject({ type: 'billing.payment_issue.resolved', body: 'Gói của bạn đã được kích hoạt lại.' });
    expect(rejected).toMatchObject({ type: 'billing.payment_issue.rejected', body: 'Yêu cầu không đủ điều kiện hoàn tiền.' });
    expect(JSON.stringify([resolved, rejected])).not.toContain('internal note');
  });

  it('external push/email failures do not fail notification persistence', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network failed with secret=hidden'));
    const db = makeDb({
      push_notification_tokens: [{ user_id: 'user-1', token: 'ExponentPushToken[test]', active: true }],
      users: [{ id: 'user-1', email: 'user@example.com' }],
    });
    const service = makeService(db, {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'test_key',
      EMAIL_FROM: 'support@example.com',
    });

    await expect(service.notifyPaymentIssueStatusChanged({
      id: 'case-1',
      user_id: 'user-1',
      provider: 'payos',
      issue_type: 'refund_request',
      status: 'in_review',
    })).resolves.toMatchObject({ type: 'billing.payment_issue.in_review' });

    expect(db.state.user_notifications[0].channel_status).toMatchObject({
      in_app: { status: 'delivered' },
      push: { status: 'failed', reason: 'push_delivery_failed' },
      email: { status: 'failed', reason: 'email_delivery_failed' },
    });
  });

  it('lists and marks only own notifications as read', async () => {
    const db = makeDb({
      user_notifications: [
        { id: 'note-1', user_id: 'user-1', type: 'billing.payment_issue.created', title: 'A', body: 'B', metadata: {}, read_at: null, created_at: '2026-06-12T00:00:00.000Z' },
        { id: 'note-2', user_id: 'user-2', type: 'billing.payment_issue.created', title: 'C', body: 'D', metadata: {}, read_at: null, created_at: '2026-06-12T00:00:00.000Z' },
      ],
    });
    const service = makeService(db);

    const list = await service.listUserNotifications('user-1');
    const own = await service.markUserNotificationRead('user-1', 'note-1');
    const other = await service.markUserNotificationRead('user-1', 'note-2');

    expect(list.notifications).toHaveLength(1);
    expect(list.unread_count).toBe(1);
    expect(own).toMatchObject({ id: 'note-1', read_at: expect.any(String) });
    expect(other).toBeNull();
  });

  it('marks all unread notifications for the current user only', async () => {
    const db = makeDb({
      user_notifications: [
        { id: 'note-1', user_id: 'user-1', read_at: null },
        { id: 'note-2', user_id: 'user-1', read_at: '2026-06-12T00:00:00.000Z' },
        { id: 'note-3', user_id: 'user-2', read_at: null },
      ],
    });
    const service = makeService(db);

    const result = await service.markAllUserNotificationsRead('user-1');

    expect(result).toMatchObject({ ok: true, read_at: expect.any(String) });
    expect(db.state.user_notifications[0].read_at).toEqual(expect.any(String));
    expect(db.state.user_notifications[1].read_at).toBe('2026-06-12T00:00:00.000Z');
    expect(db.state.user_notifications[2].read_at).toBeNull();
  });
});
