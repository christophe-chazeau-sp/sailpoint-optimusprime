/** Forwards /isc/* to the tenant named in the X-Isc-Api header. Used by ng serve only. */
const FALLBACK = 'https://example.api.identitynow.com';

function tenantOf(request) {
  const base = request.headers['x-isc-api'];
  return typeof base === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(base) ? base : FALLBACK;
}

module.exports = {
  '/isc': {
    target: FALLBACK,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/isc': '' },
    // Vite's proxy has no `router` option, so the target is chosen per request here.
    configure(proxy) {
      const web = proxy.web.bind(proxy);
      // The proxy reads its last argument as the options, so no undefined callback is passed.
      proxy.web = (request, response, options, ...callback) =>
        web(request, response, { ...options, target: tenantOf(request) }, ...callback);
      proxy.on('proxyReq', (proxyRequest) => {
        proxyRequest.removeHeader('x-isc-api');
        proxyRequest.removeHeader('origin');
        proxyRequest.removeHeader('referer');
      });
    },
  },
};
