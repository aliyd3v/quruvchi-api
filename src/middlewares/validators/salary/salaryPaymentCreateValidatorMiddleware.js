const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { PaymentType, PaymentMethod } = require("@prisma/client");

const dto = z
  .object(
    {
      salaryMonthId: z.any().optional(),
      objectId: z
        .number({ message: "invalid_object_id" })
        .refine((value) => !Number.isNaN(value) && value > 0, { message: "invalid_object_id" })
        .optional(),
      ownerId: z.number({ message: "worker_id_must_be_number" }).refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, { message: "invalid_worker_id" }),
      type: z.enum([PaymentType.AVANS, PaymentType.PENALTY, PaymentType.SALARY], { message: "type_in_salary_avans_penalty" }),
      paymentMethod: z.enum([PaymentMethod.BANK_TRANSFER, PaymentMethod.CASH, null], { message: "payment_method_in_bank_transfer_or_cash" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      description: z.string({ message: "description_must_be_string" }).trim().optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.salaryPaymentCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
