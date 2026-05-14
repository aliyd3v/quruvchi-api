const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const workerCreateToObjectDto = z
  .object(
    {
      object_id: z.number({ message: "object_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "object_id_must_be_positive_integer" }),
      fname: z.string({ message: "fname_is_required" }).min(1, { message: "fname_min_length_is_1" }),
      lname: z.string({ message: "lname_is_required" }).min(1, { message: "lname_min_length_is_1" }),
      phone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      password: z.string({ message: "password_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      password_repeat: z.string({ message: "password_repeat_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      email: z.string({ message: "email_is_required" }).email({ message: "email_format_is_wrong" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => data.password === data.password_repeat, { message: "passwords_must_match", path: ["password_repeat"] });

exports.workerCreateToObjectValidatorMiddleware = (req, _res, next) => {
  const parsed = workerCreateToObjectDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
