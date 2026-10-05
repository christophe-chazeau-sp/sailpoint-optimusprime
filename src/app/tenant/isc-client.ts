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
    headers: (apiBase) => (local ? { 'X-Isc-Api': apiBase } : {}),
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

async function explain(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) {
    return 'The tenant rejected these credentials.';
  }
  if (response.status === 403) {
    return 'These credentials are not allowed to list transforms.';
  }
  try {
    const body = (await response.json()) as { error_description?: unknown; message?: unknown; detail?: unknown };
    const detail = [body.error_description, body.message, body.detail].find((item) => typeof item === 'string');
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
