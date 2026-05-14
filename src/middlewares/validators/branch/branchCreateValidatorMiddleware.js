const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      name: z.string({ message: "branch_name_must_be_string" }).trim().min(1, { message: "branch_name_cannot_be_empty" }),
      stir: z.string({ message: "stir_must_be_string" }).trim().min(1, { message: "stir_cannot_be_empty" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.branchCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
