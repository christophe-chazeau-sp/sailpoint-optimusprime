export interface IscTransport {
  url(apiBase: string, path: string): string;
  headers(apiBase: string): Record<string, string>;
}

export interface ListedTransform {
  id: string;
  name: string;
  type: string;
  document: unknown;
}

/** Direct calls. The dev server replaces this with a proxy so the browser is not blocked. */
export function browserTransport(): IscTransport {
  const host = typeof location === 'undefined' ? '' : location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  return {
    url: (apiBase, path) => (local ? `/isc${path}` : `${apiBase}${path}`),
    headers(apiBase) {
      const headers: Record<string, string> = {};
      if (local) {
        headers['X-Isc-Api'] = apiBase;
      }
      return headers;
    },
  };
}

export function directTransport(): IscTransport {
  return {
    url: (apiBase, path) => `${apiBase}${path}`,
    headers: () => ({}),
  };
}

export async function accessToken(
  apiBase: string,
  clientId: string,
  clientSecret: string,
  transport: IscTransport,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  let response: Response;
  try {
    response = await fetchImpl(transport.url(apiBase, '/oauth/token'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...transport.headers(apiBase),
      },
      body,
    });
  } catch {
    throw new Error(reachError());
  }
  if (!response.ok) {
    throw new Error(await explain(response, 'The tenant rejected these credentials.'));
  }
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('The tenant did not return an access token.');
  }
  return payload.access_token;
}

export async function listTransforms(
  apiBase: string,
  token: string,
  transport: IscTransport,
  fetchImpl: typeof fetch = fetch,
): Promise<ListedTransform[]> {
  const pageSize = 250;
  const documents: unknown[] = [];
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const path = `/v3/transforms?limit=${pageSize}&offset=${offset}&sorters=name`;
    let response: Response;
    try {
      response = await fetchImpl(transport.url(apiBase, path), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...transport.headers(apiBase),
        },
      });
    } catch {
      throw new Error(reachError());
    }
    if (!response.ok) {
      throw new Error(await explain(response, 'The tenant refused to list transforms.'));
    }
    const batch = (await response.json()) as unknown;
    if (!Array.isArray(batch)) {
      throw new Error('The tenant did not return a transform list.');
    }
    documents.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }
  return documents
    .map(summarize)
    .filter((item): item is ListedTransform => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface IdentitySummary {
  id: string;
  name: string;
  displayName: string;
  email: string;
  /** Identity attribute values, keyed by attribute name. */
  attributes: Record<string, string | null>;
}

export interface IdentityAccount {
  id: string;
  sourceName: string;
  /** Account attribute values, keyed by attribute name. */
  attributes: Record<string, string | null>;
}

/** The source attribute a transform is mapped to, which ISC passes as the implicit input. */
export interface ImplicitSource {
  sourceName: string;
  attributeName: string;
}

export interface TenantPreview {
  value: string | null;
  errors: string[];
}

/** Identity attribute the temporary mapping is previewed on; every tenant defines it. */
export const PREVIEW_ATTRIBUTE = 'displayName';

export async function searchIdentities(
  apiBase: string,
  token: string,
  text: string,
  transport: IscTransport,
  fetchImpl: typeof fetch = fetch,
): Promise<IdentitySummary[]> {
  const { exact, partial } = identityQueries(text);
  let batch = await searchOnce(fetchImpl, transport, apiBase, token, exact);
  if (!batch.length && partial) {
    batch = await searchOnce(fetchImpl, transport, apiBase, token, partial);
  }
  return batch.flatMap((item) => {
    if (!isRecord(item) || typeof item['id'] !== 'string') {
      return [];
    }
    const attributes = textValues(item['attributes']);
    for (const key of ['email', 'displayName'] as const) {
      if (attributes[key] === undefined && typeof item[key] === 'string') {
        attributes[key] = item[key];
      }
    }
    return [
      {
        id: item['id'],
        name: typeof item['name'] === 'string' ? item['name'] : item['id'],
        displayName: typeof item['displayName'] === 'string' ? item['displayName'] : '',
        email: typeof item['email'] === 'string' ? item['email'] : '',
        attributes,
      },
    ];
  });
}

const NAME_FIELDS = ['name', 'displayName', 'firstName', 'lastName', 'email'];

/**
 * The search index splits values such as emails into words, so a wildcard on the whole text never
 * matches. `exact` is the text as a phrase; `partial`, tried only when it finds nothing, needs every
 * word as a prefix of a name or email field, since across all fields common words like an email
 * domain match almost everyone.
 */
export function identityQueries(text: string): { exact: string; partial: string | null } {
  const trimmed = text.trim();
  const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) {
    return { exact: '*', partial: null };
  }
  const prefix = (word: string) => `(${NAME_FIELDS.map((field) => `${field}:${word}*`).join(' OR ')})`;
  return {
    exact: `"${trimmed.replace(/["\\]/g, ' ')}"`,
    partial: words.map(prefix).join(' AND '),
  };
}

async function searchOnce(
  fetchImpl: typeof fetch,
  transport: IscTransport,
  apiBase: string,
  token: string,
  query: string,
): Promise<unknown[]> {
  const response = await send(fetchImpl, transport, apiBase, '/v3/search?limit=25', token, {
    method: 'POST',
    body: JSON.stringify({ indices: ['identities'], query: { query } }),
  });
  if (!response.ok) {
    throw new Error(await explain(response, 'The tenant refused to search identities.', 'search identities'));
  }
  const batch = (await response.json()) as unknown;
  return Array.isArray(batch) ? batch : [];
}

export async function listAccounts(
  apiBase: string,
  token: string,
  identityId: string,
  transport: IscTransport,
  fetchImpl: typeof fetch = fetch,
): Promise<IdentityAccount[]> {
  const filter = encodeURIComponent(`identityId eq "${identityId}"`);
  const response = await send(fetchImpl, transport, apiBase, `/v3/accounts?limit=250&filters=${filter}`, token);
  if (!response.ok) {
    throw new Error(await explain(response, 'The tenant refused to list accounts.', 'list accounts'));
  }
  const batch = (await response.json()) as unknown;
  return (Array.isArray(batch) ? batch : [])
    .flatMap((item) =>
      isRecord(item) && typeof item['id'] === 'string' && typeof item['sourceName'] === 'string'
        ? [{ id: item['id'], sourceName: item['sourceName'], attributes: textValues(item['attributes']) }]
        : [],
    )
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
}

/**
 * Runs the transform on the tenant for one identity. The preview endpoint only accepts saved
 * transforms, so a temporary copy is created and always deleted afterwards. Nothing else is saved.
 */
export async function previewOnTenant(
  apiBase: string,
  token: string,
  identityId: string,
  document: Record<string, unknown>,
  implicit: ImplicitSource | null,
  transport: IscTransport,
  fetchImpl: typeof fetch = fetch,
): Promise<TenantPreview> {
  const name = `optimusprime-preview-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const created = await send(fetchImpl, transport, apiBase, '/v3/transforms', token, {
    method: 'POST',
    body: JSON.stringify({ name, type: document['type'], attributes: document['attributes'] ?? {} }),
  });
  if (!created.ok) {
    throw new Error(await explain(created, 'The tenant refused to save the temporary transform.', 'create transforms'));
  }
  const { id } = (await created.json()) as { id?: unknown };
  try {
    const reference: Record<string, unknown> = { id: name };
    if (implicit) {
      reference['input'] = { type: 'accountAttribute', attributes: { ...implicit } };
    }
    const response = await send(fetchImpl, transport, apiBase, '/v3/identity-profiles/identity-preview', token, {
      method: 'POST',
      body: JSON.stringify({
        identityId,
        identityAttributeConfig: {
          enabled: true,
          attributeTransforms: [
            { identityAttributeName: PREVIEW_ATTRIBUTE, transformDefinition: { type: 'reference', attributes: reference } },
          ],
        },
      }),
    });
    if (!response.ok) {
      throw new Error(await explain(response, 'The tenant refused the identity preview.', 'preview identities'));
    }
    const body = (await response.json()) as { previewAttributes?: unknown };
    const rows = Array.isArray(body.previewAttributes) ? body.previewAttributes : [];
    const row = rows.find((item) => isRecord(item) && item['name'] === PREVIEW_ATTRIBUTE);
    const messages = isRecord(row) && Array.isArray(row['errorMessages']) ? row['errorMessages'] : [];
    return {
      value: isRecord(row) && row['value'] != null ? String(row['value']) : null,
      errors: messages.flatMap((item) => (isRecord(item) && typeof item['text'] === 'string' ? [item['text']] : [])),
    };
  } finally {
    if (typeof id === 'string') {
      await send(fetchImpl, transport, apiBase, `/v3/transforms/${id}`, token, { method: 'DELETE' }).catch(() => undefined);
    }
  }
}

async function send(
  fetchImpl: typeof fetch,
  transport: IscTransport,
  apiBase: string,
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetchImpl(transport.url(apiBase, path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...transport.headers(apiBase),
      },
    });
  } catch {
    throw new Error(reachError());
  }
}

/** Attribute values as the evaluator sees them: text, or null when absent. */
function textValues(value: unknown): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  if (!isRecord(value)) {
    return values;
  }
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) {
      values[key] = null;
    } else if (typeof item === 'object') {
      values[key] = JSON.stringify(item);
    } else {
      values[key] = String(item);
    }
  }
  return values;
}

export interface TokenClaims {
  /** Expiry, in milliseconds since the epoch. */
  expiresAt: number | null;
  /** API origin of the tenant that issued the token, such as `https://acme.api.identitynow.com`. */
  issuer: string | null;
}

/** Reads the expiry and issuer of a JWT without checking its signature; null when it is not a JWT. */
export function tokenClaims(token: string): TokenClaims | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as unknown;
    if (!isRecord(claims)) {
      return null;
    }
    return {
      expiresAt: typeof claims['exp'] === 'number' ? claims['exp'] * 1000 : null,
      issuer: typeof claims['iss'] === 'string' ? claims['iss'].replace(/\/+$/, '').toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

export function bearerToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '');
}

function summarize(value: unknown): ListedTransform | null {
  if (!isRecord(value) || typeof value['id'] !== 'string') {
    return null;
  }
  const name = typeof value['name'] === 'string' && value['name'] ? value['name'] : value['id'];
  const type = typeof value['type'] === 'string' ? value['type'] : '';
  return { id: value['id'], name, type, document: value };
}

async function explain(response: Response, fallback: string, action = 'list transforms'): Promise<string> {
  if (response.status === 401) {
    return 'The tenant rejected these credentials. A JWT token expires after a few minutes.';
  }
  if (response.status === 403) {
    return `These credentials are not allowed to ${action}.`;
  }
  try {
    const body = (await response.json()) as {
      error_description?: unknown;
      message?: unknown;
      detail?: unknown;
      messages?: unknown;
    };
    const first = Array.isArray(body.messages) && isRecord(body.messages[0]) ? body.messages[0]['text'] : undefined;
    const detail = [body.error_description, body.message, first, body.detail].find((item) => typeof item === 'string');
    if (typeof detail === 'string' && detail) {
      return detail;
    }
  } catch {
    // The body was not JSON.
  }
  return fallback;
}

function reachError(): string {
  return 'The browser could not reach the tenant. Run the app locally if this site is blocked from calling Identity Security Cloud.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
