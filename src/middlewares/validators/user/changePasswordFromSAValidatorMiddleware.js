const { default: z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      userId: z.number({ message: "user_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "user_id_must_be_positive_integer" }),
      new_password: z.string({ message: "new_password_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      new_password_repeat: z.string({ message: "new_password_repeat_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => data.new_password === data.new_password_repeat, { message: "passwords_must_match", path: ["new_password", "new_password_repeat"] });

exports.changePasswordFromSAValidatorMiddleware = (req, res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
