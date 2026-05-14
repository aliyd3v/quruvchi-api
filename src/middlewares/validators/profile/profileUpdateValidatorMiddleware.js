const { default: z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const profileUpdateDto = z
  .object(
    {
      fname: z.string({ message: "fname_is_required" }).min(1, { message: "fname_min_length_is_1" }),
      lname: z.string({ message: "lname_is_required" }).min(1, { message: "lname_min_length_is_1" }),
      email: z.string({ message: "email_is_required" }).email({ message: "email_format_is_wrong" }),
      birthday: z.preprocess((v) => (!isNaN(Date.parse(v)) ? new Date(v) : null), z.union([z.date(), z.null])),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.profileUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = profileUpdateDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
