import { SupportService } from '../support.service';

describe('SupportService', () => {
  function setup(result: { data: any; error: any }) {
    const query: any = {
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(result),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(result),
    };
    const supabase: any = { db: { from: jest.fn(() => query) } };
    const notifications: any = { notifyUser: jest.fn().mockResolvedValue({ id: 'notification-1' }) };
    return { service: new SupportService(supabase, notifications), query, supabase, notifications };
  }

  it('creates a support request scoped to the user', async () => {
    const request = {
      id: 'request-1',
      category: 'technical',
      subject: 'Web issue',
      status: 'open',
    };
    const { service, query } = setup({ data: request, error: null });

    await expect(service.createRequest({
      userId: 'user-1',
      category: 'technical',
      subject: ' Web issue ',
      message: ' The page does not load. ',
      appVersion: '1.0.0',
      platform: 'web',
    })).resolves.toEqual(request);

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      subject: 'Web issue',
      message: 'The page does not load.',
      status: 'open',
    }));
  });

  it('lists only requests owned by the user', async () => {
    const rows = [{ id: 'request-1', subject: 'Help' }];
    const { service, query } = setup({ data: rows, error: null });

    await expect(service.listRequests('user-1')).resolves.toEqual({ requests: rows });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.limit).toHaveBeenCalledWith(50);
  });

  it('surfaces storage failures without leaking details', async () => {
    const { service } = setup({ data: null, error: { message: 'database details' } });

    await expect(service.createRequest({
      userId: 'user-1',
      category: 'other',
      subject: 'Need help',
      message: 'Something is not working.',
    })).rejects.toMatchObject({ status: 503 });
  });

  it('lists the admin support queue with filters', async () => {
    const rows = [{ id: 'request-1', subject: 'Help', users: { email: 'user@example.com' } }];
    const { service, query } = setup({ data: rows, error: null });

    const result = await service.listAdminRequests({ status: 'open', category: 'technical', search: 'Help' });
    expect(result.requests[0]).toMatchObject({ id: 'request-1', user_email: 'user@example.com' });
    expect(query.eq).toHaveBeenCalledWith('status', 'open');
    expect(query.eq).toHaveBeenCalledWith('category', 'technical');
    expect(query.ilike).toHaveBeenCalledWith('subject', '%Help%');
  });
});
