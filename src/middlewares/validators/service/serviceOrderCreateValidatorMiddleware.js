const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object({
    name: z
      .string({
        required_error: "name is required",
        invalid_type_error: "name must be string",
      })
      .trim()
      .min(2, "name must be longer than 2 letter")
      .max(50, "name must be less than 50 letter"),

    phone: z
      .string({
        required_error: "phone is required",
        invalid_type_error: "invalid phone",
      })
      .trim()
      .transform((value) => value.replace(/\s+/g, ""))
      .refine((value) => /^\+998\d{9}$/.test(value), {
        message: "invalid phone",
      }),

    company: z.string({ message: "company name must be string" }).trim().optional(),

    message: z
      .string({
        required_error: "message is required",
        invalid_type_error: "message must be string",
      })
      .trim()
      .min(10, "message must be longer than 10 letters")
      .max(1000, "message must be less than 1000 letters"),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "body is required" });

exports.serviceOrderCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
