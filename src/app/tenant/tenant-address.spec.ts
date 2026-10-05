import { resolveTenant } from './tenant-address';

describe('resolveTenant', () => {
  it('adds the api subdomain to a tenant name or UI address', () => {
    expect(resolveTenant('acme')).toEqual({ apiBase: 'https://acme.api.identitynow.com' });
    expect(resolveTenant('acme.identitynow.com')).toEqual({ apiBase: 'https://acme.api.identitynow.com' });
    expect(resolveTenant('https://acme.identitynow.com/')).toEqual({
      apiBase: 'https://acme.api.identitynow.com',
    });
    expect(resolveTenant('https://acme.identitynow-demo.com/ui')).toEqual({
      apiBase: 'https://acme.api.identitynow-demo.com',
    });
  });

  it('keeps an address that already uses the api subdomain', () => {
    expect(resolveTenant('https://acme.api.identitynow.com/v3')).toEqual({
      apiBase: 'https://acme.api.identitynow.com',
    });
    expect(resolveTenant('acme.api.identitynow-demo.com')).toEqual({
      apiBase: 'https://acme.api.identitynow-demo.com',
    });
  });

  it('rejects an empty or unrelated address', () => {
    expect(resolveTenant('  ')).toEqual({ error: 'Enter a tenant address.' });
    expect(resolveTenant('https://example.com')).toEqual({
      error: 'Use a tenant name or an identitynow.com address.',
    });
  });
});
