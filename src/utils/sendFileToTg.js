const Config = require("../config");
const fs = require("fs");
const FormData = require("form-data");

const chatId = Config.DB_BACKUP_CHAT_ID;

const axios = require("axios");

exports.sendFileToTg = async (filePath) => {
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", fs.createReadStream(filePath));

  const response = await axios.post(`https://api.telegram.org/bot${Config.DEV_BOT_API}/sendDocument`, formData, {
    headers: formData.getHeaders(),
  });

  return response.data;
};
