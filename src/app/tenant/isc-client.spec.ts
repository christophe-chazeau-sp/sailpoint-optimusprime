import {
  accessToken,
  bearerToken,
  directTransport,
  identityQueries,
  listAccounts,
  listTransforms,
  previewOnTenant,
  searchIdentities,
  tokenClaims,
} from './isc-client';

describe('isc client', () => {
  it('strips a Bearer prefix from a pasted token', () => {
    expect(bearerToken('  Bearer abc.def.ghi  ')).toBe('abc.def.ghi');
  });

  it('reads the expiry and issuer of a JWT', () => {
    const payload = btoa(JSON.stringify({ exp: 1_800_000_000, iss: 'https://Acme.api.identitynow.com/' }))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(tokenClaims(`header.${payload}.signature`)).toEqual({
      expiresAt: 1_800_000_000_000,
      issuer: 'https://acme.api.identitynow.com',
    });
    expect(tokenClaims('not-a-jwt')).toBeNull();
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

  it('searches the exact text first and reads attributes as text', async () => {
    const queries: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      queries.push(JSON.parse(String(init?.body)).query.query);
      return jsonResponse([
        { id: 'i1', name: 'jdoe', displayName: 'John Doe', email: 'j@x.com', attributes: { endDate: '20240101', tags: ['a'] } },
      ]);
    }) as typeof fetch;
    const found = await searchIdentities(API, 'token', 'j@x.com', directTransport(), fetchImpl);
    expect(queries).toEqual(['"j@x.com"']);
    expect(found[0].attributes).toEqual({ endDate: '20240101', tags: '["a"]', email: 'j@x.com', displayName: 'John Doe' });
  });

  it('falls back to name and email prefixes when the exact text finds nobody', async () => {
    const queries: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      queries.push(JSON.parse(String(init?.body)).query.query);
      return jsonResponse(queries.length === 1 ? [] : [{ id: 'i1', name: 'jdoe' }]);
    }) as typeof fetch;
    const found = await searchIdentities(API, 'token', 'john d', directTransport(), fetchImpl);
    expect(found.map((item) => item.id)).toEqual(['i1']);
    expect(queries[1]).toBe(identityQueries('john d').partial);
  });

  it('limits prefix words to name and email fields', () => {
    const { exact, partial } = identityQueries('Workday.ext');
    expect(exact).toBe('"Workday.ext"');
    expect(partial).toBe(
      '(name:Workday* OR displayName:Workday* OR firstName:Workday* OR lastName:Workday* OR email:Workday*) AND ' +
        '(name:ext* OR displayName:ext* OR firstName:ext* OR lastName:ext* OR email:ext*)',
    );
    expect(identityQueries('  ')).toEqual({ exact: '*', partial: null });
  });

  it('lists the accounts of one identity', async () => {
    let url = '';
    const fetchImpl = (async (requested: string | URL | Request) => {
      url = String(requested);
      return jsonResponse([{ id: 'a1', sourceName: 'HR', attributes: { department: 'Sales', manager: null } }]);
    }) as typeof fetch;
    const accounts = await listAccounts(API, 'token', 'i1', directTransport(), fetchImpl);
    expect(decodeURIComponent(url)).toContain('filters=identityId eq "i1"');
    expect(accounts).toEqual([{ id: 'a1', sourceName: 'HR', attributes: { department: 'Sales', manager: null } }]);
  });

  it('previews on a temporary copy that is deleted, even when the preview fails', async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const respond = (previewOk: boolean) =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
        if (method === 'POST' && String(url).endsWith('/v3/transforms')) {
          return jsonResponse({ id: 't1' }, 201);
        }
        if (method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        return previewOk
          ? jsonResponse({ previewAttributes: [{ name: 'displayName', value: null, errorMessages: [{ text: 'boom' }] }] })
          : jsonResponse({ messages: [{ text: 'bad identity' }] }, 400);
      }) as typeof fetch;

    const document = { id: 'x', name: 'Mine', type: 'lower', attributes: {} };
    const implicit = { sourceName: 'HR', attributeName: 'department' };
    const preview = await previewOnTenant(API, 'token', 'i1', document, implicit, directTransport(), respond(true));
    expect(preview).toEqual({ value: null, errors: ['boom'] });
    const created = calls[0].body as Record<string, unknown>;
    expect(created['type']).toBe('lower');
    expect(created['id']).toBeUndefined();
    const mapping = (calls[1].body as any).identityAttributeConfig.attributeTransforms[0].transformDefinition;
    expect(mapping).toEqual({
      type: 'reference',
      attributes: { id: created['name'], input: { type: 'accountAttribute', attributes: implicit } },
    });
    expect(calls[2]).toEqual(expect.objectContaining({ method: 'DELETE', url: `${API}/v3/transforms/t1` }));

    calls.length = 0;
    await expect(previewOnTenant(API, 'token', 'i1', document, null, directTransport(), respond(false))).rejects.toThrow(
      'bad identity',
    );
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'DELETE']);
  });
});

const API = 'https://acme.api.identitynow.com';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
