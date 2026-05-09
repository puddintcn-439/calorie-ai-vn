import { SupabaseService } from '../supabase.service';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: jest.fn() }),
}));

function makeConfig(url = 'https://test.supabase.co', key = 'service-key') {
  return {
    getOrThrow: jest.fn().mockImplementation((k: string) => {
      if (k === 'SUPABASE_URL') return url;
      if (k === 'SUPABASE_SERVICE_KEY') return key;
      throw new Error(`Unknown config key: ${k}`);
    }),
  } as unknown as ConfigService;
}

describe('SupabaseService', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockClear();
  });

  it('initializes the client on onModuleInit', () => {
    const service = new SupabaseService(makeConfig());
    service.onModuleInit();
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'service-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });

  it('exposes db getter after init', () => {
    const mockClient = { from: jest.fn() };
    (createClient as jest.Mock).mockReturnValueOnce(mockClient);
    const service = new SupabaseService(makeConfig());
    service.onModuleInit();
    expect(service.db).toBe(mockClient);
  });

  it('createAuthClient returns a new client', () => {
    const service = new SupabaseService(makeConfig());
    service.onModuleInit();
    (createClient as jest.Mock).mockReturnValueOnce({ from: jest.fn(), auth: {} });
    const authClient = service.createAuthClient();
    expect(authClient).toBeDefined();
    expect(createClient).toHaveBeenCalled();
  });

  it('throws when SUPABASE_URL is missing', () => {
    const config = {
      getOrThrow: jest.fn().mockImplementation(() => {
        throw new Error('SUPABASE_URL is not defined');
      }),
    } as unknown as ConfigService;
    const service = new SupabaseService(config);
    expect(() => service.onModuleInit()).toThrow('SUPABASE_URL is not defined');
  });
});
