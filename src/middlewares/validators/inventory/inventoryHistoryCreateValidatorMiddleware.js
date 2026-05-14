const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { InventoryHistoryType } = require("../../../generated/prisma");
const fileService = require("../../../services/file.service");

const filesDto = z.array(
  z.object(
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
  ),
);

const dto = z
  .object(
    {
      branchId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      type: z.enum(Object.values(InventoryHistoryType), { message: "invalid_type" }),
      organizationId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      objectId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      executedById: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      pricePerUnit: z.preprocess((v) => (!Number.isNaN(v) && Number(v) > 0 ? BigInt(Math.floor(Number(v) * 100)) : null), z.bigint({ message: "invalid_price_per_unit" })),
      description: z.string({ message: "description_must_be_string" }).trim().optional(),
      quantity: z.preprocess(
        (v) => {
          if (v === undefined || v === null) return undefined;
          const str = String(v).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .trim()
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, { message: "quantity_must_be_positive_number" })
          .transform((v) => Number(v)),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.inventoryHistoryCreateValidatorMiddleware = async (req, _res, next) => {
  if (req.files) {
    const parsed = filesDto.safeParse(req.files);
    if (parsed.error) {
      if (req.files && Array.isArray(req.files) && req.files.length) {
        await fileService.unlinkFiles(req.files);
      }
      return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
    }
  }
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    if (req.files && Array.isArray(req.files) && req.files.length) {
      await fileService.unlinkFiles(req.files);
    }
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
