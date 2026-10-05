import { accessToken, bearerToken, directTransport, listTransforms } from './isc-client';

describe('isc client', () => {
  it('strips a Bearer prefix from a pasted token', () => {
    expect(bearerToken('  Bearer abc.def.ghi  ')).toBe('abc.def.ghi');
  });

  it('exchanges a client id and secret, then lists transforms', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).endsWith('/oauth/token')) {
        expect(String(url)).not.toContain('client_secret');
        const body = String(init?.body);
        expect(body).toContain('grant_type=client_credentials');
        expect(body).toContain('client_id=id');
        expect(body).toContain('client_secret=secret');
        return jsonResponse({ access_token: 'token' });
      }
      return jsonResponse([
        { id: 'b', name: 'Beta', type: 'lower' },
        { id: 'a', name: 'Alpha', type: 'concat' },
      ]);
    }) as typeof fetch;

    const token = await accessToken('https://acme.api.identitynow.com', 'id', 'secret', directTransport(), fetchImpl);
    expect(token).toBe('token');
    const listed = await listTransforms('https://acme.api.identitynow.com', token, directTransport(), fetchImpl);
    expect(listed.map((item) => item.name)).toEqual(['Alpha', 'Beta']);
    expect(calls[0]).toBe('https://acme.api.identitynow.com/oauth/token');
    expect(calls[1]).toContain('/v3/transforms?');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
