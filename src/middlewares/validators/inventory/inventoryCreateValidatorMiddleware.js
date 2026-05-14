const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("../../../generated/prisma");
const fileService = require("../../../services/file.service");

const avatarDto = z.array(
  z
    .object(
      {
        fieldname: z.string(),
        originalname: z.string(),
        encoding: z.string(),
        mimetype: z.string(),
        destination: z.string(),
        filename: z.string(),
        path: z.string(),
        size: z.number(),
      },
      { message: "profile_image_cannot_be_empty" },
    )
    .refine((data) => data.mimetype.startsWith("image/"), { message: "file_must_be_image", path: ["file"] }),
);

const dto = z
  .object(
    {
      name: z.string({ message: "inventory_name_is_required" }).trim().min(1, { message: "inventory_name_min_length_is_1" }),
      sku: z.string({ message: "sku_must_be_string" }).trim().optional(),
      unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
      // quantity: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) >= 0 ? Number(v) : 0), z.number()),
      pricePerUnit: z.preprocess(
        (val) => {
          if (val === undefined || val === null) return undefined;
          const str = String(val).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .trim()
          .refine((v) => v !== "", { message: "price_per_unit_cannot_be_empty" })
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_price_per_unit" })
          .transform((v) => BigInt(Math.round(v * 100))),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.inventoryCreateValidatorMiddleware = async (req, _res, next) => {
  if (req.files) {
    const parsed = avatarDto.safeParse(req.files);
    if (parsed.error) {
      if (req.files && Array.isArray(req.files) && req.files.length) await fileService.unlinkFiles(req.files);
      return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
    }
  }
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    if (req.files && Array.isArray(req.files) && req.files.length) await fileService.unlinkFiles(req.files);
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
