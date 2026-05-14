const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { SalaryMonthType } = require("../../../generated/prisma");

const dto = z
  .object(
    {
      ownerId: z.number({ message: "worker_id_must_be_number" }).refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, { message: "invalid_worker_id" }),
      startDate: z.preprocess((val) => {
        if (val === undefined || val === null || val === "") return undefined;
        if (typeof val === "string") return new Date(val);
        return val;
      }, z.union([z.date({ invalid_type_error: "start_date_must_be_date" }), z.undefined().refine(() => false, { message: "start_date_required" })])),
      baseSalary: z
        .number({ message: "base_salary_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "base_salary_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      quantityMonth: z.any().optional(),
      duties: z.string({ message: "duties_must_be_string" }).trim().nonempty({ message: "duties_cannot_be_empty" }),
      objectId: z
        .number({ message: "object_id_must_be_number" })
        .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, { message: "invalid_object_id" })
        .optional(),
      type: z.enum([SalaryMonthType.DAILY, SalaryMonthType.MONTHLY, SalaryMonthType.COMMISSION], { message: "salary_month_type_in_daily_monthly_volume" }),
      negotiation: z.string({ message: "negotiation_must_be_string" }).trim().nonempty({ message: "negotiation_cannot_be_empty" }).optional(),
      isExistObject: z.boolean({ message: "is_exist_object_must_be_boolean" }),
      nameObject: z.any().optional(),
      budgetObject: z.any().optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.salaryMonthCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
