const moment = require("moment-timezone");

function timezoneExtension() {
  return {
    name: "timezone-extension",
    query: {
      async $allOperations({ operation, model, args, query }) {
        const result = await query(args);
        if (!result) return result;
        const convertDates = (obj) => {
          if (Array.isArray(obj)) {
            return obj.map(convertDates);
          } else if (obj instanceof Date) {
            return moment(obj).tz("Asia/Tashkent").toDate();
          } else if (typeof obj === "object" && obj !== null) {
            const newObj = {};
            for (const key in obj) {
              newObj[key] = convertDates(obj[key]);
            }
            return newObj;
          }
          return obj;
        };
        return convertDates(result);
      },
    },
  };
}

function formatDatesInResponse(obj) {
  if (Array.isArray(obj)) {
    return obj.map(formatDatesInResponse);
  }

  if (obj instanceof Date) {
    // ISO format with Tashkent timezone.
    return moment(obj).tz("Asia/Tashkent").format("YYYY-MM-DDTHH:mm:ss.SSSZ");
    // Or simple format.
    // return moment(obj).tz('Asia/Tashkent').format('YYYY-MM-DD HH:mm:ss')
  }

  if (typeof obj === "bigint") {
    if (obj === 0n) return 0;
    return Number(obj) / 100;
    // return (obj / 100n).toString();
  }

  if (typeof obj === "object" && obj !== null) {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = formatDatesInResponse(obj[key]);
    }
    return newObj;
  }

  return obj;
}

function responseFormatter(_req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    if (data && typeof data === "object") {
      data = formatDatesInResponse(data);
    }

    return originalJson(data);
  };

  next();
}

function timezoneMiddleware(prisma) {
  prisma.$use(async (params, next) => {
    const result = await next(params);
    if (!result) return result;
    const convertDates = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(convertDates);
      } else if (obj instanceof Date) {
        return moment(obj).tz("Asia/Tashkent").toDate();
      } else if (typeof obj === "object" && obj !== null) {
        const newObj = {};
        for (const key in obj) {
          newObj[key] = convertDates(obj[key]);
        }
        return newObj;
      }
      return obj;
    };
    return convertDates(result);
  });
}

module.exports = { timezoneMiddleware, timezoneExtension, responseFormatter };
