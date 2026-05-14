const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const resetPassResendCodeDto = z
  .object(
    {
      code_data: z.string({ message: "code_data_is_required" }).trim().nonempty({ message: "code_data_cannot_be_empty" }).uuid({ message: "code_data_must_be_uuid" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.resetPassResendCodeValidatorMiddleware = (req, _res, next) => {
  const parsed = resetPassResendCodeDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
