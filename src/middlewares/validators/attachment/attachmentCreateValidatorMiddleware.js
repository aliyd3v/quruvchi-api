const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
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
      { message: "profile_image_cannot_be_empty" }
    )
    // .refine(data => data.mimetype.startsWith('image/'), {
    //     message: 'file_must_be_image',
    //     path: ['file']
    // })
  )
  .refine(
    (data) => {
      return data.length > 0;
    },
    { message: "files_cannot_be_empty", path: ["files"] }
  );

const attachmentCreateBodyDto = z
  .object(
    {
      object_id: z
        .string()
        .refine((value) => !Number.isNaN(Number(value) && Number(value) > 0, { message: "invalid_object_id" }))
        .optional(),

      workVolume_id: z
        .string()
        .refine((value) => !Number.isNaN(Number(value) && Number(value) > 0, { message: "invalid_work_volume_id" }))
        .optional(),

      lot_id: z
        .string()
        .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, { message: "invalid_lot_id" })
        .optional(),

      transaction_id: z
        .string()
        .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, { message: "invalid_transaction_id" })
        .optional(),

      task_id: z
        .string()
        .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, { message: "invalid_task_id" })
        .optional(),
    },
    { message: "body_is_required" }
  )
  .superRefine((data, ctx) => {
    const filled = Object.entries(data)
      .filter(([_, v]) => v !== undefined && v !== null && v !== "")
      .map(([k]) => k);
    if (filled.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "attachment_can_be_linked_to_only_one_entity" });
    }
  });

exports.attachmentCreateValidatorMiddleware = async (req, _res, next) => {
  if (!req.files || !Array.isArray(req.files)) {
    return next(new AppError(400, "validation_error", formatZodError([{ path: ["files"], message: "files_cannot_be_empty" }])));
  }
  const parsedFiles = attachmentCreateFilesDto.safeParse(req.files);
  if (parsedFiles.error) {
    if (req.files && Array.isArray(req.files) && req.files.length) {
      await fileService.unlinkFiles(req.files);
    }
    return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
  }
  const parsedBody = attachmentCreateBodyDto.safeParse(req.body);
  if (parsedBody.error) {
    await fileService.unlinkFiles(req.files);
    return next(new AppError(400, "validation_error", formatZodError(parsedBody.error.issues)));
  }
  req.files = parsedFiles.data;
  req.body = parsedBody.data;
  next();
};
