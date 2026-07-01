import { SupportService } from '../support.service';

describe('SupportService', () => {
  function setup(result: { data: any; error: any }) {
    const query: any = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue(result),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(result),
    };
    const supabase: any = { db: { from: jest.fn(() => query) } };
    return { service: new SupportService(supabase), query, supabase };
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
});
