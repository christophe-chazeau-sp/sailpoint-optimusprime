/** Forwards /isc/* to the tenant named in the X-Isc-Api header. Used by ng serve only. */
module.exports = {
  '/isc': {
    target: 'https://example.api.identitynow.com',
    secure: true,
    changeOrigin: true,
    router(request) {
      const base = request.headers['x-isc-api'];
      if (typeof base === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(base)) {
        return base;
      }
      return 'https://example.api.identitynow.com';
    },
    pathRewrite: { '^/isc': '' },
    onProxyReq(proxyReq) {
      proxyReq.removeHeader('x-isc-api');
    },
  },
};
