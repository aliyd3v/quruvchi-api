const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const fileService = require("../../../services/file.service");

const attachmentCreateFilesDto = z.array(
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
);

const dto = z
  .object(
    {
      title: z.string({ message: "title_is_required" }).trim().min(1, { message: "title_is_required" }),
      lotId: z
        .string({ message: "lot_id_must_be_string" })
        .trim()
        .regex(/^\d{14}$/, { message: "lot_id_must_be_14_digits" }),
      startingPrice: z.preprocess(
        (val) => {
          if (val === undefined || val === null) return undefined;
          const str = String(val).trim().replace(/\s|,/g, "");
          return str;
        },
        z
          .string()
          .refine((v) => v !== "", { message: "starting_price_cannot_be_empty" })
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_starting_price" })
          .transform((v) => BigInt(Math.floor(v * 100)))
      ),
      guaranteeAmount: z.preprocess(
        (val) => {
          if (val === undefined || val === null) return undefined;
          return val;
        },
        z
          .string()
          .refine((v) => v !== "", { message: "guarantee_amount_cannot_be_empty" })
          .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_guarantee_amount" })
          .transform((v) => BigInt(Math.floor(v * 100)))
      ),
      lotEndDate: z.preprocess((v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(v) : v) : v), z.date({ message: "end_date_must_be_date_format" })),
      objectId: z.string({ message: "invalid_object_id" }).optional(),
      tenderType: z.string({ message: "tender_type_must_be_string" }).trim().optional(),
      lotBranch: z.string({ message: "lot_branch_must_be_string" }).trim().optional(),
      workExecutionType: z.string({ message: "work_execution_type_must_be_string" }).trim().optional(),
      objectComplexityCategory: z.string({ message: "object_complexity_category_must_be_string" }).trim().optional(),
      programCategory: z.string({ message: "program_category_must_be_string" }).trim().optional(),
      fundingSource: z.string({ message: "funding_source_must_be_string" }).trim().optional(),
      fundingAmountCurrentYear: z
        .string({ message: "invalid_funding_amount_current_year" })
        .optional()
        .transform((v) => (v && !Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.floor(Number(v) * 100)) : null)),
      workDurationDays: z
        .string({ message: "invalid_work_duration_days" })
        .refine((v) => v && !Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)), { message: "invalid_work_duration_days" })
        .transform((v) => Number(v)),
      proposalSubmissionDeadline: z
        .string({ message: "proposal_submission_deadline_must_be_number" })
        .refine((v) => v && !Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)), { message: "invalid_proposal_submission_deadline" })
        .transform((v) => Number(v)),
      customer: z.string({ message: "customer_must_be_string" }).trim().optional(),
      objectRegion: z.string({ message: "object_region_must_be_string" }).trim().optional(),
      objectCityDistrict: z.string({ message: "object_city_district_must_be_string" }).trim().optional(),
      objectAddress: z.string({ message: "object_address_must_be_string" }).trim().optional(),
      contactPerson: z.string({ message: "contact_person_must_be_string" }).trim().optional(),
      organizationDirector: z.string({ message: "organization_director_must_be_string" }).trim().optional(),
      organizationPhone: z.string({ message: "organization_phone_must_be_string" }).trim().optional(),
      organizerName: z.string({ message: "organizer_name_must_be_string" }).trim().optional(),
      organizationEmail: z.string({ message: "organization_email_must_be_string" }).trim().optional(),
      tenderFiles: z.string({ message: "tender_files_must_be_string" }).trim().optional(),
      assigned: z.preprocess(
        (val) => {
          if (val === undefined || val === null || val === "") {
            return undefined;
          }
          if (typeof val === "string") {
            try {
              return JSON.parse(val);
            } catch (e) {
              return val;
            }
          }
          return val;
        },
        z
          .array(z.number({ required_error: "assigned_user_id_must_be_number", invalid_type_error: "assigned_user_id_must_be_number" }))
          .refine((arr) => arr.every((v) => Number.isInteger(v) && v > 0), { message: "assigned_user_id_must_be_positive_integer" }, { message: "assigned_users_value_must_be_in_array" })
      ),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.lotCreateValidationMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files) {
    if (!Array.isArray(req.files)) {
      return next(new AppError(400, "validation_error", formatZodError([{ path: ["files"], message: "files_cannot_be_empty" }])));
    }
    parsedFiles = attachmentCreateFilesDto.safeParse(req.files);
    if (parsedFiles.error) {
      if (req.files && Array.isArray(req.files) && req.files.length) {
        await fileService.unlinkFiles(req.files);
      }
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
  if (parsedFiles) {
    req.files = parsedFiles.data;
  }
  next();
};
