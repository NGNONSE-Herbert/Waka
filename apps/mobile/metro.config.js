// Metro sert le code de l'app ET relaie /api/* vers l'API locale.
// Le téléphone n'a ainsi besoin que d'un seul port (8081), en USB comme en tunnel,
// et le cookie de session reste sur la même origine.
const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const API_TARGET = new URL(process.env.WAKA_API_URL || 'http://127.0.0.1:4000');
const PREFIX = '/api/';

function proxyToApi(req, res) {
  const upstream = http.request(
    {
      hostname: API_TARGET.hostname,
      port: API_TARGET.port,
      method: req.method,
      path: req.url.slice('/api'.length),
      // L'adresse est écrasée : un client ne peut pas usurper son IP pour contourner les limites OTP.
      headers: { ...req.headers, host: API_TARGET.host, 'x-forwarded-for': req.socket.remoteAddress || 'unknown' },
    },
    (answer) => {
      res.writeHead(answer.statusCode || 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'API_UNAVAILABLE', message: "L'API Waka ne répond pas sur le PC.", requestId: 'metro-proxy' } }));
  });
  req.pipe(upstream);
}

const config = getDefaultConfig(__dirname);
const previous = config.server?.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const next = previous ? previous(middleware, server) : middleware;
    return (req, res, done) => (req.url && req.url.startsWith(PREFIX) ? proxyToApi(req, res) : next(req, res, done));
  },
};

module.exports = config;
