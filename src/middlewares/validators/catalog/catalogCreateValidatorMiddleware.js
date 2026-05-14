const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("../../../generated/prisma");
const fileService = require("../../../services/file.service");

const fileDto = z
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
    { message: "image_cannot_be_empty" },
  )
  .refine((data) => data.mimetype.startsWith("image/"), { message: "file_must_be_image", path: ["file"] });

const filesDto = z
  .array(
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
        { message: "image_cannot_be_empty" },
      )
      .refine((data) => data.mimetype.startsWith("image/"), { message: "files_must_be_image", path: ["files"] }),
    { message: "files_must_be_array" },
  )
  .refine((d) => d.length, { message: "images_cannot_be_empty" });

const dto = z
  .object(
    {
      directionId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.number({ message: "direction_is_required" })),
      titleUz: z.string({ message: "title_uz_must_be_string" }).nonempty({ message: "title_uz_cannot_be_empty" }),
      titleRu: z.string({ message: "title_ru_must_be_string" }).nonempty({ message: "title_ru_cannot_be_empty" }),
      titleEn: z.string({ message: "title_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
      sku: z.preprocess((v) => (typeof v === "string" ? v.trim() : null), z.union([z.string(), z.null()])),
      isVisible: z.preprocess((v) => v === "true", z.boolean()),
      // amount: z.preprocess(
      //   (v) => {
      //     if (v === undefined || v === null) return undefined;
      //     const str = String(v).trim().replace(/\s|,/g, "");
      //     return str;
      //   },
      //   z
      //     .string()
      //     .refine((v) => v !== "", { message: "amount_cannot_be_empty" })
      //     .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_amount" })
      //     .transform((v) => BigInt(Math.round(v * 100))),
      // ),
      price: z.preprocess(
        (v) => {
          const value = !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? BigInt(Math.round(v * 100)) : null;
          if (value !== null && value > 999999999999999999n) return null;
          return value;
        },
        z.union([z.bigint({ message: "price_must_be_number_and_not_so_big" })]),
        // (v) => (!isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? BigInt(Math.round(v * 100)) : null), z.union([z.bigint(), z.null()])
      ),
      parameter: z.string({ message: "parameter_must_be_string" }).trim().nonempty({ message: "parameter_cannot_be_empty" }),
      descUz: z.string({ message: "description_uz_must_be_string" }).nonempty({ message: "description_uz_cannot_be_empty" }),
      descRu: z.string({ message: "description_ru_must_be_string" }).nonempty({ message: "description_ru_cannot_be_empty" }),
      descEn: z.string({ message: "description_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
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
        z.array(
          z.object({
            materialId: z.preprocess((v) => (!isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
            name: z.string({ message: "product_name_must_be_string" }).nonempty({ message: "product_name_cannot_be_empty" }),
            quantity: z.preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number({ message: "quantity_must_be_number" }).positive({ message: "invalid_quantity" })),
            parameter: z.string({ message: "parameter_must_be_string" }).optional(),
            pricePerUnit: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.round(Number(v) * 100)) : v), z.bigint({ message: "invalid_price_per_unit" })),
            unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
          }),
          { message: "resources_is_required" },
        ),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

exports.catalogCreateValidatorMiddleware = async (req, _res, next) => {
  const file = req.files?.file;
  const files = req.files?.files;

  const parsedFile = fileDto.safeParse(file[0]);
  const parsedFiles = filesDto.safeParse(files);
  if (parsedFile.error) {
    await fileService.unlinkFiles(file);
    await fileService.unlinkFiles(files);
    return next(new AppError(400, "validation_error", formatZodError(parsedFile.error.issues)));
  }
  if (parsedFiles.error) {
    await fileService.unlinkFiles(file);
    await fileService.unlinkFiles(files);
    return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    await fileService.unlinkFiles(file);
    await fileService.unlinkFiles(files);
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  req.files["file"] = [parsedFile.data];
  req.files["files"] = parsedFiles.data;
  next();
};
