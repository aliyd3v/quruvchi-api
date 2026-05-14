const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { WorkType } = require("@prisma/client");

const dto = z
  .object(
    {
      name: z.string({ message: "object_name_is_required" }).min(1, { message: "object_name_min_length_is_1" }),
      description: z.string({ message: "description_is_required" }).min(1, { message: "description_min_length_is_1" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      workType: z.enum([WorkType.CONSTRUCTION, WorkType.FURNITURE, WorkType.OTHER, WorkType.SEWING, WorkType.SMETA, WorkType.TRADE], { message: "work_type_invalid" }),
      startDate: z.preprocess((v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (typeof v === "string") return new Date(v);
        return v;
      }, z.union([z.date({ invalid_type_error: "start_date_must_be_date" }), z.undefined().refine(() => false, { message: "start_date_required" })])),
      endDate: z.preprocess((v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (typeof v === "string") return new Date(v);
        return v;
      }, z.union([z.date({ invalid_type_error: "end_date_must_be_date" }), z.undefined().refine(() => false, { message: "end_date_required" })])),
      location: z.object(
        {
          lat: z.preprocess(
            (v) => (typeof v === "string" ? Number(v) : v),
            z
              .number({ message: "lat_must_be_number" })
              .refine((v) => !Number.isNaN(v), { message: "lat_must_be_valid_number" })
              .min(-90, { message: "lat_min_value_minus_90" })
              .max(90, { message: "lat_max_value_90" })
          ),
          lon: z.preprocess(
            (v) => (typeof v === "string" ? Number(v) : v),
            z
              .number({ message: "lon_must_be_number" })
              .refine((v) => !Number.isNaN(v), { message: "lon_must_be_valid_number" })
              .min(-180, { message: "lon_min_value_minus_180" })
              .max(180, { message: "lon_max_value_180" })
          ),
        },
        { message: "location_values_must_be_in_object" }
      ),
      assigned: z
        .array(z.number({ required_error: "assigned_user_id_must_be_number", invalid_type_error: "assigned_user_id_must_be_number" }))
        .refine((arr) => arr.every((v) => Number.isInteger(v) && v > 0), { message: "assigned_user_id_must_be_positive_integer" }, { message: "assigned_users_value_must_be_in_array" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.objectUpdateValidationMiddleware = (req, _res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
