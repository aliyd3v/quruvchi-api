const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Role } = require("../../../generated/prisma");
const Permissions = require("../../../constants/PermissionEnum");

const userUpdateDto = z
  .object(
    {
      fname: z.string({ message: "fname_is_required" }).min(1, { message: "fname_min_length_is_1" }),
      lname: z.string({ message: "lname_is_required" }).min(1, { message: "lname_min_length_is_1" }),
      phone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      email: z.string({ message: "email_is_required" }).trim().email({ message: "email_format_is_wrong" }),
      role: z.enum([Role.ACCOUNTANT, Role.ADMIN, Role.WORKER], { message: "role_in_accountant_admin_worker" }),
      permissions: z
        .array(z.nativeEnum(Permissions))
        .default([])
        .catch([])
        .transform((arr) => arr.filter((i) => Object.values(Permissions).includes(i))),
      birthday: z.preprocess((v) => (!isNaN(Date.parse(v)) ? new Date(v) : null), z.union([z.date(), z.null()])),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.userUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = userUpdateDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
