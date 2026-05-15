const { z } = require("zod");
const { Role } = require("../../generated/prisma");
const Permissions = require("../../constants/permission");

exports.userCreateDto = z
  .object(
    {
      fname: z.string({ message: "fname_is_required" }).trim().min(1, { message: "fname_min_length_is_1" }),
      lname: z.string({ message: "lname_is_required" }).trim().min(1, { message: "lname_min_length_is_1" }),
      phone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      password: z.string({ message: "password_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      password_repeat: z.string({ message: "password_repeat_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      email: z.string({ message: "email_is_required" }).trim().email({ message: "email_format_is_wrong" }),
      role: z.enum([Role.ACCOUNTANT, Role.ADMIN, Role.WORKER, Role.PTO], { message: "role_in_accountant_admin_worker" }),
      permissions: z
        .array(z.nativeEnum(Permissions))
        .default([])
        .catch([])
        .transform((arr) => arr.filter((i) => Object.values(Permissions).includes(i))),
      birthday: z.preprocess((v) => (!isNaN(Date.parse(v)) ? new Date(v) : null), z.union([z.date(), z.null()])),
    },
    { message: "body_is_required" },
  )
  .refine((data) => data.password === data.password_repeat, { message: "passwords_must_match", path: ["password_repeat"] });

exports.workerCreateToObjectDto = z
  .object(
    {
      object_id: z.number({ message: "object_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "object_id_must_be_positive_integer" }),
      fname: z.string({ message: "fname_is_required" }).min(1, { message: "fname_min_length_is_1" }),
      lname: z.string({ message: "lname_is_required" }).min(1, { message: "lname_min_length_is_1" }),
      phone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      password: z.string({ message: "password_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      password_repeat: z.string({ message: "password_repeat_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      email: z.string({ message: "email_is_required" }).email({ message: "email_format_is_wrong" }),
    },
    { message: "body_is_required" },
  )
  .refine((data) => data.password === data.password_repeat, { message: "passwords_must_match", path: ["password_repeat"] });

exports.userUpdateDto = z
  .object(
    {
      fname: z.string({ message: "fname_is_required" }).min(1, { message: "fname_min_length_is_1" }),
      lname: z.string({ message: "lname_is_required" }).min(1, { message: "lname_min_length_is_1" }),
      phone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      email: z.string({ message: "email_is_required" }).trim().email({ message: "email_format_is_wrong" }),
      role: z.enum([Role.ACCOUNTANT, Role.ADMIN, Role.WORKER], { message: "role_in_accountant_admin_worker" }),
      permissions: z
        .array(z.nativeEnum(Permissions))
        .default([])
        .catch([])
        .transform((arr) => arr.filter((i) => Object.values(Permissions).includes(i))),
      birthday: z.preprocess((v) => (!isNaN(Date.parse(v)) ? new Date(v) : null), z.union([z.date(), z.null()])),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.blockUserDto = z
  .object({ period: z.enum(["1d", "7d", "1m"], { message: "period_in_1d_7d_1m" }) }, { message: "body_is_required" })
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.changeUserPasswordDto = z
  .object(
    {
      userId: z.number({ message: "user_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "user_id_must_be_positive_integer" }),
      new_password: z.string({ message: "new_password_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
      new_password_repeat: z.string({ message: "new_password_repeat_is_required" }).trim().min(6, { message: "password_min_length_is_6" }).max(32, { message: "password_max_length_is_32" }),
    },
    { message: "body_is_required" },
  )
  .refine((data) => data.new_password === data.new_password_repeat, { message: "passwords_must_match", path: ["new_password", "new_password_repeat"] });
