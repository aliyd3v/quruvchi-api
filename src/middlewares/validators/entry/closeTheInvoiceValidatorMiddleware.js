const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const fileService = require("../../../services/file.service");

const filesDto = z.object({
  invoiceFiles: z
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
        { message: "file_cannot_be_empty" }
      )
    )
    .optional()
    .default([]),
  bankAcceptanceFiles: z
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
        { message: "file_cannot_be_empty" }
      )
    )
    .optional()
    .default([]),
});

const dto = z.object(
  {
    description: z
      .string({ message: "description_must_be_string" })
      .trim()
      .optional()
      .transform((v) => v || null),
  },
  { message: "body_is_required" }
);

exports.closeTheInvoiceValidatorMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files) {
    parsedFiles = filesDto.safeParse(req.files);
    if (parsedFiles.error) {
      if (req.files.invoiceFiles?.length) {
        await fileService.unlinkFiles(req.files.invoiceFiles);
      }
      if (req.files.bankAcceptanceFiles?.length) {
        await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
      }
      return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
    }
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    if (req.files) {
      if (req.files.invoiceFiles?.length) {
        await fileService.unlinkFiles(req.files.invoiceFiles);
      }
      if (req.files.bankAcceptanceFiles?.length) {
        await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
      }
    }
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  if (parsedFiles) {
    req.files = parsedFiles.data;
  }
  next();
};
