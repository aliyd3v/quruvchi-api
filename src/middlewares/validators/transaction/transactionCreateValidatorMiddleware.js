const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("../../../generated/prisma");
const fileService = require("../../../services/file.service");

const attachmentCreateFilesDto = z
  .array(
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
  )
  .refine(
    (data) => {
      return data.length > 0;
    },
    { message: "files_cannot_be_empty", path: ["files"] },
  );

const dto = z
  .object(
    {
      object_id: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      amount: z.preprocess(
        (v) => {
          if (v === undefined || v === null) return undefined;
          const str = String(v).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .refine((v) => v !== "", { message: "amount_cannot_be_empty" })
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_amount" })
          .transform((v) => BigInt(Math.round(v * 100))),
      ),
      date: z.preprocess(
        (v) => (!Number.isNaN(Date.parse(v)) ? new Date(v) : !v ? undefined : v),
        z.union([z.date({ invalid_type_error: "date_must_be_date" }), z.undefined().refine(() => false, { message: "date_required" })]),
      ),
      purpose: z.string({ message: "purpose_must_be_string" }).nonempty({ message: "purpose_cannot_be_empty" }),
      notes: z.string({ message: "notes_must_be_string" }).optional(),
      organization_id: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      organization_balance: z.preprocess((v) => v === "true", z.boolean()),
      branchId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      executedById: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      items: z.preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") return undefined;
          if (typeof v === "string") {
            try {
              return JSON.parse(v);
            } catch (e) {
              return v;
            }
          }
          return v;
        },
        z
          .array(
            z
              .object({
                inventoryId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
                // name: z.string({ message: "product_name_must_be_string" }).nonempty({ message: "product_name_cannot_be_empty" }),
                name: z.string({ message: "product_name_must_be_string" }).optional(),
                quantity: z.preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number({ message: "quantity_must_be_number" }).positive({ message: "invalid_quantity" })),
                // parameter: z.string({ message: "parameter_must_be_string" }).nonempty({ message: "parameter_cannot_be_empty" }),
                parameter: z.string({ message: "parameter_must_be_string" }).optional(),
                pricePerUnit: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.round(Number(v) * 100)) : v), z.bigint({ message: "invalid_price_per_unit" })),
                unit: z.enum(Object.values(Unit), { message: "invalid_unit" }).optional(),
              })
              .refine((d) => d.inventoryId || (d.name && d.parameter && d.unit), { message: "invalid_txn_item" }),
          )
          .optional(),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

exports.transactionCreateValidatorMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files) {
    if (!Array.isArray(req.files)) return next(new AppError(400, "validation_error", formatZodError([{ path: ["files"], message: "files_cannot_be_empty" }])));
    parsedFiles = attachmentCreateFilesDto.safeParse(req.files);
    if (parsedFiles.error) {
      if (req.files && Array.isArray(req.files) && req.files.length) await fileService.unlinkFiles(req.files);
      return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
    }
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    if (req.files && Array.isArray(req.files) && req.files.length) await fileService.unlinkFiles(req.files);
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  if (parsedFiles) req.files = parsedFiles.data;
  next();
};
