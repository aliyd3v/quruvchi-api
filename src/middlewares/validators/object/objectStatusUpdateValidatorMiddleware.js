const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { ObjectStatus } = require("../../../generated/prisma");

const objectStatusChangeCreateDto = z
  .object({ status: z.enum([ObjectStatus.ACTIVE, ObjectStatus.COMPLETED, ObjectStatus.PAUSED], { message: "object_status_in_active_complated_paused" }) }, { message: "body_is_required" })
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.objectStatusUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = objectStatusChangeCreateDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
