const translation = require("../constants/translation");

exports.formatZodError = (issues) => {
  return issues.map((issue) => {
    const key = issue.message;
    const translated = translation[key] || key;
    const path = issue.path[0] || "body";

    return { path, message: translated };
  });
};
