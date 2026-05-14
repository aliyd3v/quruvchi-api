const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { TaskPriority, Unit } = require("../../../generated/prisma");

const dto = z
  .object(
    {
      title: z.string({ message: "title_is_required" }).min(1, { message: "title_min_length_is_1" }).optional(),
      description: z.string({ message: "description_is_required" }).min(1, { message: "description_min_length_is_1" }).optional(),
      priority: z.enum([TaskPriority.HIGH, TaskPriority.LOW, TaskPriority.MEDIUM], { message: "priority_in_high_low_medium" }),
      assigned: z
        .any()
        .refine((val) => Array.isArray(val), { message: "assigned_users_value_must_be_in_array" })
        .transform((val) => (Array.isArray(val) ? val : []))
        .superRefine((arr, ctx) => {
          for (const v of arr) {
            if (!Number.isInteger(v)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "assigned_user_id_must_be_integer" });
            } else if (v <= 0) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "assigned_user_id_must_be_positive_integer" });
            }
          }
        }),
      // startDate: z.preprocess(v => typeof v === 'string' ? !Number.isNaN(Date.parse(v)) ? new Date(new Date(v).toISOString().slice(0, -1) + '+05:00') : v : v, z.date({ message: 'start_date_must_be_date' })),
      // endDate: z.preprocess(v => typeof v === 'string' ? !Number.isNaN(Date.parse(v)) ? new Date(new Date(v).toISOString().slice(0, -1) + '+05:00') : v : v, z.date({ message: 'end_date_must_be_date' })),
      startDate: z.preprocess((v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(v) : v) : v), z.date({ message: "start_date_must_be_date" })),
      endDate: z.preprocess((v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(v) : v) : v), z.date({ message: "end_date_must_be_date" })),
      productName: z.string({ message: "product_name_must_be_string" }).nonempty({ message: "product_name_cannot_be_empty" }),
      quantity: z.number({ message: "quantity_must_be_number" }).refine((value) => !Number.isNaN(value) && Number(value) > 0, { message: "invalid_quantity" }),
      unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
      technicalParameters: z.preprocess((v) => (typeof v === "string" ? v.trim() : null), z.union([z.string(), z.null()])),
      pricePerUnit: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.floor(Number(v) * 100)) : null), z.union([z.bigint(), z.null()])),
      organizationId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(v) ? Number(v) : null), z.union([z.number(), z.null()])),
      clientId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(v) ? Number(v) : null), z.union([z.number(), z.null()])),
      deliveryAddress: z.preprocess((v) => (typeof v === "string" ? v.trim() : null), z.union([z.string(), z.null()])),
      contractNumber: z.preprocess((v) => (typeof v === "string" ? v.trim() : null), z.union([z.string(), z.null()])),
      contractDate: z.preprocess((v) => (!Number.isNaN(Date.parse(v)) ? new Date(v) : null), z.union([z.date(), z.null()])),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.subtaskUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
