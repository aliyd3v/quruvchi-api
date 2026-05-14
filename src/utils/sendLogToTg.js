const Config = require("../config");

const debug = (obj) => {
  if (obj instanceof Error) {
    return `${obj.message}\n${obj.stack}`;
  }
  return JSON.stringify(obj, 0, 4);
};

const escapeForHtml = (text = "") => {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

exports.sendLogToTg = async (log, type = "Unknown", disable_notification = true) => {
  const tgApiUrl = `https://api.telegram.org/bot${Config.DEV_BOT_API}/sendMessage`;
  const chat_id = Config.DEV_CHAT_ID;
  const typeLog = typeof log;
  if (typeof log !== "string") {
    log = `\n${debug(log)}`;
  }
  const header = `RSQ.UZ\n\nTYPE LOG: ${escapeForHtml(type)}\nTYPEOF LOG: ${escapeForHtml(typeLog.toUpperCase())}`;
  const preLog = escapeForHtml(log);
  const text = `${escapeForHtml(header)}\n<pre><code>${preLog}</code></pre>`;
  try {
    const response = await fetch(tgApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode: "HTML",
        disable_notification,
      }),
    });
  } catch (error) {
    console.error("SOMETHING WENT WRONG ON SENT LOG TO TG" + "\n" + error);
  }
};
