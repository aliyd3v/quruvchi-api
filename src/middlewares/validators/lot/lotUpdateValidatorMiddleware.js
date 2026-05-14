const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      title: z.string({ message: "title_is_required" }).trim().min(1, { message: "title_is_required" }),
      lotId: z
        .string({ message: "lot_id_must_be_string" })
        .trim()
        .regex(/^\d{14}$/, { message: "lot_id_must_be_14_digits" }),
      startingPrice: z
        .number({ message: "invalid_starting_price" })
        .positive({ message: "invalid_starting_price" })
        .transform((v) => BigInt(Math.floor(v * 100))),
      guaranteeAmount: z
        .number({ message: "invalid_guarantee_amount" })
        .positive({ message: "invalid_guarantee_amount" })
        .transform((v) => BigInt(Math.floor(v * 100))),
      lotEndDate: z.preprocess((v) => (typeof v === "string" ? (!isNaN(Date.parse(v)) ? new Date(v) : v) : v), z.date({ message: "end_date_must_be_date_format" })),
      objectId: z.string({ message: "invalid_object_id" }).optional(),
      tenderType: z.string({ message: "tender_type_must_be_string" }).trim().optional(),
      lotBranch: z.string({ message: "lot_branch_must_be_string" }).trim().optional(),
      workExecutionType: z.string({ message: "work_execution_type_must_be_string" }).trim().optional(),
      objectComplexityCategory: z.string({ message: "object_complexity_category_must_be_string" }).trim().optional(),
      programCategory: z.string({ message: "program_category_must_be_string" }).trim().optional(),
      fundingSource: z.string({ message: "funding_source_must_be_string" }).trim().optional(),
      fundingAmountCurrentYear: z
        .number({ message: "invalid_funding_amount_current_year" })
        .optional()
        .transform((v) => (v && v > 0 ? BigInt(Math.floor(v * 100)) : null)),
      workDurationDays: z.number({ message: "invalid_work_duration_days" }).positive({ message: "invalid_work_duration_days" }),
      proposalSubmissionDeadline: z.number({ message: "proposal_submission_deadline_must_be_number" }).positive({ message: "invalid_proposal_submission_deadline" }),
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
      assigned: z
        .array(z.number({ required_error: "assigned_user_id_must_be_number", invalid_type_error: "assigned_user_id_must_be_number" }))
        .refine((arr) => arr.every((v) => Number.isInteger(v) && v > 0), { message: "assigned_user_id_must_be_positive_integer" }, { message: "assigned_users_value_must_be_in_array" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.lotUpdateValidatorMiddleware = async (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
