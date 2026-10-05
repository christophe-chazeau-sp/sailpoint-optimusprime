export interface TenantApi {
  /** Origin of the API host, such as `https://acme.api.identitynow.com`. */
  apiBase: string;
}

const KNOWN_DOMAINS = ['identitynow.com', 'identitynow-demo.com', 'identitynow-preprod.com'];

/** Turns a tenant name or URL into the API origin, inserting `.api` when it is missing. */
export function resolveTenant(input: string): TenantApi | { error: string } {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) {
    return { error: 'Enter a tenant address.' };
  }

  let host = raw;
  if (raw.includes('://') || raw.includes('/')) {
    try {
      host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    } catch {
      return { error: 'That tenant address is not a valid URL.' };
    }
  }
  host = host.toLowerCase().replace(/\.$/, '');

  const known = KNOWN_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!known) {
    if (/^[a-z0-9-]+$/.test(host)) {
      return { apiBase: `https://${host}.api.identitynow.com` };
    }
    return { error: 'Use a tenant name or an identitynow.com address.' };
  }

  const tenant = host.slice(0, -(known.length + 1));
  if (!tenant || tenant === 'api') {
    return { error: 'The address is missing the tenant name.' };
  }
  const name = tenant.endsWith('.api') ? tenant.slice(0, -4) : tenant;
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { error: 'Use a tenant name or an identitynow.com address.' };
  }
  return { apiBase: `https://${name}.api.${known}` };
}
