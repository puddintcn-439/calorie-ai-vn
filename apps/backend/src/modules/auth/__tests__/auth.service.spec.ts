import { AuthService } from '../auth.service';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

function makeJwt(token = 'signed-jwt'): JwtService {
  return { sign: jest.fn().mockReturnValue(token) } as unknown as JwtService;
}

function makeSupabaseAdmin(
  createUserResult: { data?: unknown; error?: unknown } = {},
  insertResult: { data?: unknown; error?: unknown } = {},
) {
  const db = {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue(insertResult),
    }),
  };
  const authClient = {
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue(createUserResult),
      },
      signInWithPassword: jest.fn(),
    },
  };
  return {
    supabase: { db, createAuthClient: jest.fn().mockReturnValue(authClient) } as unknown as SupabaseService,
    authClient,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// register
// ─────────────────────────────────────────────────────────────────────────────
describe('AuthService.register', () => {
  it('creates user and returns token', async () => {
    const { supabase, authClient } = makeSupabaseAdmin({
      data: { user: { id: 'uid1' } },
      error: null,
    }, { data: null, error: null });

    const jwt = makeJwt('my-token');
    const service = new AuthService(supabase, jwt);

    const result = await service.register({
      email: 'test@example.com',
      password: 'pass1234',
      full_name: 'Test User',
    });

    expect(result.access_token).toBe('my-token');
    expect(result.user_id).toBe('uid1');
    expect(result.email).toBe('test@example.com');
    expect(authClient.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'pass1234',
      email_confirm: true,
    });
  });

  it('throws ConflictException when createUser returns an error', async () => {
    const { supabase } = makeSupabaseAdmin(
      { data: null, error: { message: 'Email already exists' } },
    );

    const service = new AuthService(supabase, makeJwt());
    await expect(service.register({
      email: 'dup@example.com',
      password: 'pass',
      full_name: 'Dup',
    })).rejects.toThrow(ConflictException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// login
// ─────────────────────────────────────────────────────────────────────────────
describe('AuthService.login', () => {
  it('returns token for valid credentials', async () => {
    const db = { from: jest.fn() };
    const authClient = {
      auth: {
        admin: { createUser: jest.fn() },
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: { id: 'uid2', email: 'u@example.com' } },
          error: null,
        }),
      },
    };
    const supabase = {
      db,
      createAuthClient: jest.fn().mockReturnValue(authClient),
    } as unknown as SupabaseService;

    const jwt = makeJwt('login-token');
    const service = new AuthService(supabase, jwt);

    const result = await service.login({ email: 'u@example.com', password: 'secret' });
    expect(result.access_token).toBe('login-token');
    expect(result.user_id).toBe('uid2');
    expect(result.email).toBe('u@example.com');
  });

  it('throws UnauthorizedException for invalid credentials', async () => {
    const authClient = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Invalid credentials' },
        }),
      },
    };
    const supabase = {
      db: {},
      createAuthClient: jest.fn().mockReturnValue(authClient),
    } as unknown as SupabaseService;

    const service = new AuthService(supabase, makeJwt());
    await expect(service.login({ email: 'x@x.com', password: 'wrong' }))
      .rejects.toThrow(UnauthorizedException);
  });
});
