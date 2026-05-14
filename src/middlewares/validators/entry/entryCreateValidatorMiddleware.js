const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { EntryColor, InvoiceStatus, EntryType } = require("@prisma/client");
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
        { message: "profile_image_cannot_be_empty" },
      ),
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
        { message: "profile_image_cannot_be_empty" },
      ),
    )
    .optional()
    .default([]),
});

// Validator body.
const dto = z
  .object(
    {
      amount: z.preprocess(
        (val) => {
          if (val === undefined || val === null) return undefined;
          const str = String(val).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .trim()
          .refine((v) => v !== "", { message: "amount_cannot_be_empty" })
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_amount" })
          .transform((v) => BigInt(Math.round(v * 100))),
      ),
      contractAmount: z.preprocess(
        (val) => {
          if (val === undefined || val === null) return "";
          const str = String(val).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .trim()
          .transform((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.round(v * 100)) : null)),
      ),
      date: z.preprocess(
        (val) => {
          if (val === undefined || val === null || val === "") return undefined;
          if (typeof val === "string") return new Date(val);
          return val;
        },
        z.union([z.date({ invalid_type_error: "date_must_be_date" }), z.undefined().refine(() => false, { message: "date_required" })]),
      ),
      contractDate: z.any().transform((v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null)),
      purpose: z.string({ message: "purpose_must_be_string" }).trim().nonempty({ message: "purpose_cannot_be_empty" }),
      organizationId: z.any().optional(),
      branchId: z.preprocess(
        (val) => {
          if (val === undefined || val === null) return undefined;
          const str = String(val).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .trim()
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_branch_id" })
          .transform((v) => Number(v)),
      ),
      description: z.any().optional(),
      contractNumber: z.any().optional(),
      innStir: z.any().optional(),
      lot: z.any().optional(),
      poaNumber: z.any().optional(),
      type: z.enum(Object.values(EntryType), { message: "wrong_type" }),
      color: z.enum(Object.values(EntryColor), { message: "wrong_value_color" }),
      invoiceStatus: z.enum([InvoiceStatus.CLOSED, InvoiceStatus.NOT_CLOSED, InvoiceStatus.NO_INVOICE], { message: "wrong_value_invoice_status" }),
      isCardPayout: z.any().optional(),
      ownerPhone: z.preprocess(
        (val) => (typeof val === "string" ? val.replace(/\s+/g, "") : val),
        z.string({ message: "phone_is_required" }).regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.entryCreateValidatorMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files) {
    parsedFiles = filesDto.safeParse(req.files);
    if (parsedFiles.error) {
      if (req.files.invoiceFiles?.length) await fileService.unlinkFiles(req.files.invoiceFiles);
      if (req.files.bankAcceptanceFiles?.length) await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
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
