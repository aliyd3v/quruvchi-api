const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { TaskPriority, Unit } = require("../../../generated/prisma");
const fileService = require("../../../services/file.service");

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
        { message: "profile_image_cannot_be_empty" },
      )
      .refine((data) => data.mimetype.startsWith("image/"), { message: "file_must_be_image", path: ["files"] }),
  )
  .optional();

const dto = z
  .object(
    {
      task_id: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      title: z.string({ message: "title_is_required" }).min(1, { message: "title_min_length_is_1" }).optional(),
      description: z.string({ message: "description_is_required" }).min(1, { message: "description_min_length_is_1" }).optional(),
      object_id: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      priority: z.enum(Object.values(TaskPriority), { message: "priority_in_high_low_medium" }),
      startDate: z.preprocess((v) => (!Number.isNaN(Date.parse(v)) ? new Date(v) : v), z.date({ message: "start_date_must_be_date" })),
      endDate: z.preprocess((v) => (!Number.isNaN(Date.parse(v)) ? new Date(v) : v), z.date({ message: "end_date_must_be_date" })),
      productName: z.string({ message: "product_name_must_be_string" }).trim().min(1, { message: "product_name_is_required" }),
      quantity: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? Number(v) : v), z.number({ message: "invalid_quantity" })),
      technicalParameters: z.preprocess((v) => (typeof v === "string" ? v : null), z.union([z.string(), z.null()])),
      unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
      pricePerUnit: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.floor(Number(v) * 100)) : null), z.union([z.bigint(), z.null()])),
      organizationId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      clientId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      deliveryAddress: z.preprocess((v) => (typeof v === "string" ? v : null), z.union([z.string(), z.null()])),
      contractNumber: z.preprocess((v) => (typeof v === "string" ? v : null), z.union([z.string(), z.null()])),
      contractDate: z.preprocess((v) => (!Number.isNaN(Date.parse(v)) ? new Date(v) : null), z.union([z.date(), z.null()])),
      assigned: z.preprocess(
        (v) => {
          try {
            const arr = JSON.parse(v);
            return Array.isArray(arr) ? arr : [];
          } catch (error) {
            return [];
          }
        },
        z.array(z.number({ message: "wrong_assigned_user_id" })),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.subTaskCreateValidatorMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files && Array.isArray(req.files) && req.files.length) {
    parsedFiles = filesDto.safeParse(req.files);
    if (parsedFiles.error) {
      await fileService.unlinkFiles(req.files);
      return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
    }
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    if (req.files && Array.isArray(req.files) && req.files.length) {
      await fileService.unlinkFiles(req.files);
    }
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  req.files = parsedFiles?.data || [];
  next();
};
