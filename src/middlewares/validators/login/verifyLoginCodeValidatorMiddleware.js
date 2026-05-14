const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const verifyLoginCodeDto = z
  .object(
    {
      temp_token: z.string({ message: "code_data_is_required" }).trim().nonempty({ message: "code_data_cannot_be_empty" }),
      code: z
        .string({ message: "code_is_required" })
        .trim()
        .regex(/^\d{6}$/, { message: "code_must_be_6_digits" })
        .nonempty({ message: "code_cannot_be_empty" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.verifyLoginCodeValidatorMiddleware = (req, _res, next) => {
  const parsed = verifyLoginCodeDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
