const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { InboxStatus } = require("@prisma/client");

const dto = z
  .object({
    status: z.enum(Object.values(InboxStatus), { message: "invalid_status" }),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "body is required" });

exports.inboxStatusChangeValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
