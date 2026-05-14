const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const lotCreateDto = z
  .object(
    {
      lotId: z
        .string({ message: "lot_id_must_be_string" })
        .trim()
        .regex(/^\d{14}$/, { message: "lot_id_must_be_14_digits" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.searchValidatorMiddleware = (req, _res, next) => {
  const parsed = lotCreateDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
