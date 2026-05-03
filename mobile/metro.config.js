// Proxies TB inference to Metro's port so phones can use the same host:port as Expo
// (Windows often allows 8081 but blocks 8000).
const { getDefaultConfig } = require("expo/metro-config");
const connect = require("connect");
const http = require("http");

const config = getDefaultConfig(__dirname);

const PROXY_PREFIX = "/_tb_infer";
const INFER_HOST = process.env.TB_INFER_HOST || "127.0.0.1";
const INFER_PORT = Number(process.env.TB_INFER_PORT || "8000", 10);

function tbInferProxy(req, res, next) {
  const url = req.url || "";
  if (!url.startsWith(PROXY_PREFIX)) {
    return next();
  }

  const q = url.indexOf("?");
  const pathPart = (q === -1 ? url : url.slice(0, q)).slice(PROXY_PREFIX.length) || "/";
  const search = q === -1 ? "" : url.slice(q);
  const targetPath = pathPart + search;

  const headers = { ...req.headers };
  delete headers.connection;
  // Keep content-length so FastAPI can parse multipart bodies correctly.
  headers.host = `${INFER_HOST}:${INFER_PORT}`;

  const proxyReq = http.request(
    {
      hostname: INFER_HOST,
      port: INFER_PORT,
      path: targetPath,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          detail: "Metro TB proxy: inference server unreachable",
          target: `${INFER_HOST}:${INFER_PORT}`,
          error: String(err && err.message ? err.message : err),
        })
      );
    }
  });

  req.pipe(proxyReq);
}

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return connect().use(tbInferProxy).use(metroMiddleware);
  },
};

module.exports = config;
