const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const blockUserDto = z
  .object({ period: z.enum(["1d", "7d", "1m"], { message: "period_in_1d_7d_1m" }) }, { message: "body_is_required" })
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.blockUserValidatorMiddleware = (req, _res, next) => {
  const parsed = blockUserDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
