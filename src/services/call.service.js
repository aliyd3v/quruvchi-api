const Config = require("../config");
const { CALLMASTER_KEY: apiKey } = Config;

const types = {};

class callService {
  async call(phone, type) {
    try {
      const data = new URLSearchParams();
      data.append("apiKey", apiKey);
      data.append("groupID", types[type]);
      data.append("phone", `998${phone}`);

      const res = await fetch(`https://smartcall.uz/web/api/v1`, { method: "POST", body: data });
      if (!res.ok) return false;

      const parsedRes = await res.json();
      if (parsedRes.status !== "success") return false;

      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }
}

module.exports = new callService();
