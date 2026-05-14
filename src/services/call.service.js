const Config = require("../config");
const { CALLMASTER_KEY: apiKey } = Config;

const types = {
  BUILDER_PROJECTS_HOUSE_REMIND_FACTURE: 521,           // Faktura yopish haqida eslatish
  BUYUK_ASR_BOSHI_REMIND_FACTURE: 522,                  // Faktura yopish haqida eslatish
  DEVELOPMENT_FORWARD_PACE_REMIND_FACTURE: 524,         // Faktura yopish haqida eslatish
  RSQ_REMIND_FACTURE: 520,                              // Faktura yopish haqida eslatish
  SHAXRAMBEK_AKROMBEK_REMIND_FACTURE: 523,              // Faktura yopish haqida eslatish
  WOODEN_MASTER_EXPERT_REMIND_FACTURE: 525,             // Faktura yopish haqida eslatish
  GULOBOD_SITI_REMIND_FACTURE: 2008,                    // Faktura yopish haqida eslatish
  SHOXRUZBEK_MAXSULOTLARI_REMIND_FACTURE: 2009,         // Faktura yopish haqida eslatish
  UNIERSE_PRODUCTION_AND_BUILDER_REMIND_FACTURE: 2010,  // Faktura yopish haqida eslatish
  RSQ_LATE_DEBT_REMIND: 893,                            // Kechikkan qarzdorlarga eslatish
  RSQ_DEBT_REMIND: 917,                                 // Qarzdorga kechikayotganda eslatish
  HAPPY_BIRTHDAY: 2089,                                 // Happy birthday
  // HAPPY_NEW_YEAR: 0,                                 // Happy new year
  HAPPY_NAVRUZ: 2101,                                   // Happy navruz
  HAPPY_MUSTAQILLIK: 2102,                              // Happy mustaqillik
  LATE_TASK_TO_STAFF: 622,                              // Kechikkan topshiriq hodimga
  NEW_TASK: 373,                                        // Yangi topshiriq hodimga
  NEW_INBOX: 2109,                                      // New inbox
};

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
