const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const loginDto = z
  .object(
    {
      phone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      password: z.string({ message: "password_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.loginValidatorMiddleware = (req, _res, next) => {
  const parsed = loginDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
