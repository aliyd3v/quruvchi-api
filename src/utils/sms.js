const Config = require("../config");
const { sendLogToTg } = require("./sendLogToTg");

const SMS = {
  send: async (phone, text) => {
    try {
      // Get token for sent SMS from eskiz.uz.
      const eskizRes = await fetch("https://notify.eskiz.uz/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: Config.ESKIZ_LOGIN, password: Config.ESKIZ_PASSWORD }),
      });
      if (!eskizRes.ok) {
        const tmp = await eskizRes.text();
        console.log(tmp);
        console.log("SMS NOT SENT TO " + phone);
        return;
      }
      const {
        data: { token: eskizToken },
      } = await eskizRes.json();

      // Sent SMS.
      const sent = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${eskizToken}`,
        },
        body: JSON.stringify({
          mobile_phone: phone,
          message: text,
          from: Config.ESKIZ_FROM,
        }),
      });
      if (!sent.ok) {
        const tmp = await sent.text();
        console.log(phone + "\n" + tmp);
        await sendLogToTg(`SMS not sent to ${phone}. Error: ${tmp}`, "SMS_ERROR_LOG", false);
      }
    } catch (error) {
      console.log(error);
    }
  },
};

module.exports = SMS;
