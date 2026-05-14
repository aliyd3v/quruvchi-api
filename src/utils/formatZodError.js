const translations = require("../constants");

exports.formatZodError = (issues) => {
  return issues.map((issue) => {
    const key = issue.message;
    const translated = translations[key] || key;
    const path = issue.path[0] || "body";

    return { path, message: translated };
  });
};
