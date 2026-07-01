import { PrivacyService } from '../privacy.service';

describe('PrivacyService', () => {
  function createService(options?: {
    signInError?: any;
    deleteError?: any;
  }) {
    const query: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null }),
    };
    const signInWithPassword = jest.fn().mockResolvedValue({
      data: options?.signInError ? null : { user: { id: 'user-1' } },
      error: options?.signInError ?? null,
    });
    const deleteUser = jest.fn().mockResolvedValue({
      data: options?.deleteError ? null : { user: null },
      error: options?.deleteError ?? null,
    });
    const supabase: any = {
      db: {
        from: jest.fn(() => query),
        auth: { admin: { deleteUser } },
      },
      createAuthClient: jest.fn(() => ({
        auth: { signInWithPassword },
      })),
    };

    return {
      service: new PrivacyService(supabase),
      supabase,
      signInWithPassword,
      deleteUser,
    };
  }

  it('exports user-owned data with metadata', async () => {
    const { service, supabase } = createService();
    const result = await service.exportUserData('user-1', 'user@example.com');

    expect(result).toMatchObject({
      format: 'calorie-ai-personal-data',
      version: 1,
      account: { id: 'user-1', email: 'user@example.com' },
    });
    expect(result.data.profile).toEqual([{ id: 'row-1' }]);
    expect(supabase.db.from).toHaveBeenCalledWith('users');
    expect(supabase.db.from).toHaveBeenCalledWith('food_logs');
  });

  it('requires a valid password before deleting the auth user', async () => {
    const { service, deleteUser } = createService({
      signInError: { message: 'invalid credentials' },
    });

    await expect(
      service.deleteAccount('user-1', 'user@example.com', 'wrong-password'),
    ).rejects.toMatchObject({ status: 401 });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user after password verification', async () => {
    const { service, signInWithPassword, deleteUser } = createService();
    const result = await service.deleteAccount(
      'user-1',
      'user@example.com',
      'correct-password',
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'correct-password',
    });
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(result.ok).toBe(true);
  });
});
