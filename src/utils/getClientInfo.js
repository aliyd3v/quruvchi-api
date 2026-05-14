const UAParser = require("ua-parser-js");
const { isIP } = require("net");
const PRIVATE_IP_REGEX = /^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|fc00:|fe80:|::1)/;

function pickClientIp(xffHeader, remoteAddr) {
  if (!xffHeader && !remoteAddr) return null;

  if (xffHeader) {
    const parts = xffHeader.split(",").map((p) => p.trim());
    for (const p of parts) {
      if (!p) continue;
      const ip = p.split(":")[0];
      if (!PRIVATE_IP_REGEX.test(ip) && isIP(ip)) return ip;
    }
    const first = parts[0].split(":")[0];
    if (isIP(first)) return first;
  }

  if (remoteAddr) {
    const ip = remoteAddr.split(":").pop();
    return ip;
  }

  return null;
}

const getClientInfo = (req) => {
  const { protocol, hostname, method, path, originalUrl, query, params, body, file } = req;

  const xff = req.headers["x-forwarded-for"] || "";
  const ip = pickClientIp(xff, req.connection?.remoteAddress || req.ip);

  const userAgent = req.headers["user-agent"] || "";
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    ip,
    xForwardedFor: xff || null,
    userAgent,
    device: result.device?.model || result.device?.type || "unknown",
    os: result.os?.name ? `${result.os.name} ${result.os.version || ""}`.trim() : "unknown",
    browser: result.browser?.name ? `${result.browser.name} ${result.browser.version || ""}`.trim() : "unknown",
    protocol,
    hostname,
    fullDomain: `${req.protocol}://${req.get("host")}`,
    method,
    path,
    originalUrl,
    query,
    params,
    body,
    file,
  };
};

module.exports = { getClientInfo };
