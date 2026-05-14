const { z, number } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { TaskPriority } = require("@prisma/client");

const dto = z
  .object(
    {
      task_id: z
        .number({ message: "task_id_must_be_number" })
        .refine((value) => !Number.isNaN(value) && value > 0, { message: "task_id_must_be_positive_integer" })
        .optional(),
      title: z.string({ message: "title_is_required" }).min(1, { message: "title_min_length_is_1" }).optional(),
      description: z.string({ message: "description_is_required" }).min(1, { message: "description_min_length_is_1" }).optional(),
      object_id: z
        .number({ message: "object_id_must_be_number" })
        .refine((value) => !Number.isNaN(value) && value > 0, { message: "object_id_must_be_positive_integer" })
        .optional(),
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
      duration_days: z
        .number({ message: "duration_days_must_be_number" })
        .refine((value) => !Number.isNaN(value) && value > 0, { message: "duration_days_must_be_positive_integer" })
        .optional(),
      priority: z.enum([TaskPriority.HIGH, TaskPriority.LOW, TaskPriority.MEDIUM], { message: "priority_in_high_low_medium" }),
      // startDate: z.preprocess(v => typeof v === 'string' ? !Number.isNaN(Date.parse(v)) ? new Date(new Date(v).toISOString().slice(0, -1) + '+05:00') : v : v, z.date({ message: 'start_date_must_be_date' })),
      startDate: z.preprocess((v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(v) : v) : v), z.date({ message: "start_date_must_be_date" })),
      // endDate: z.preprocess(v => typeof v === 'string' ? !Number.isNaN(Date.parse(v)) ? new Date(new Date(v).toISOString().slice(0, -1) + '+05:00') : v : v, z.date({ message: 'end_date_must_be_date' })),
      endDate: z.preprocess((v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(v) : v) : v), z.date({ message: "end_date_must_be_date" })),
      productName: z.any().optional(),
      quantity: z.any().optional(),
      technicalParameters: z.any().optional(),
      unit: z.any().optional(),
      pricePerUnit: z.any().optional(),
      isOfficeTask: z.boolean({ message: "wrong_task_type" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.taskCreateValidatorMiddlewareV2 = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  req.body = parsed.data;
  next();
};
