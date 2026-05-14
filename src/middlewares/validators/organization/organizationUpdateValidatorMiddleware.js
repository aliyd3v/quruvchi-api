const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const organizationUpdateDto = z
  .object(
    {
      organization_name: z.string({ message: "organization_name_is_required" }).trim().min(1, { message: "organization_name_min_length_is_1" }),
      stir_number: z.string({ message: "stir_number_is_required" }).trim().nonempty({ message: "stir_number_cannot_be_empty" }),
      owner_name: z.string({ message: "owner_name_is_required" }).trim().min(1, { message: "owner_name_min_length_is_1" }),
      owner_phone: z
        .string({ message: "owner_phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "owner_phone_format_is_wrong" })
        .optional(),
      seller_phone: z
        .string({ message: "seller_phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "seller_phone_format_is_wrong" })
        .optional(),
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
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.organizationUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = organizationUpdateDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
