const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { hashPassword } = require("../utils/bcrypt");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const SMS = require("../utils/sms");
const { fromMinorUnits } = require("../utils/amount");
const { TransactionType, Role } = require("../generated/prisma");
const { deleteFileFromS3 } = require("../utils/s3");

const allowedColumnKeys = ["fname", "lname", "phone", "email", "role", "lastSeans", "createdAt", "deletedAt"];
const allowedColumnKeysForGetUsersWithBalance = ["fname", "lname", "phone", "email", "balance", "role", "lastSeans", "createdAt"];

const userController = {
  async createOne(req, res, next) {
    try {
      const {
        body: { password, phone, email, fname, lname },
        user: { id: createdById },
      } = req;

      const passwordHash = await hashPassword(password);

      const condidatPhone = await prisma.user.findUnique({
        where: { phone },
      });
      if (condidatPhone) {
        if (!condidatPhone.isActive) throw new AppError(400, "phone_already_taken_and_but_that_user_disabled");
        else throw new AppError(400, "phone_already_taken");
      }

      const condidatEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (condidatEmail) {
        if (!condidatEmail.isActive) throw new AppError(400, "email_already_taken_and_but_that_user_disabled");
        else throw new AppError(400, "email_already_taken");
      }

      const { password_repeat, ...data } = req.body;
      data.password = passwordHash;
      data.createdById = createdById;

      await prisma.user.create({
        data,
      });

      await SMS.send(`+998${phone}`, `Rsq.uz Hurmatli ${fname + " " + lname} siz uchun profil yaratildi. Login: +998${phone} Pochta: ${email} Parol: ${password} Tizimga kirish uchun: rsq.uz/kabinet`);

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let { page, limit, role, sort, reverse, key } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";
      role = [Role.ACCOUNTANT, Role.ADMIN, Role.PTO, Role.WORKER].includes(role) ? role : null;

      const findWhere = {
        isActive: true,
        ...(role ? { role } : { role: { not: "SUPERADMIN" } }),
        ...(key && {
          OR: [
            { fname: { contains: key, mode: "insensitive" } },
            { lname: { contains: key, mode: "insensitive" } },
            { email: { contains: key, mode: "insensitive" } },
            { phone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.user.count({
        where: findWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [users, counts, totalHaveTask] = await Promise.all([
        prisma.user.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          include: {
            avatar: { select: { url: true } },
            tasks: {
              where: {
                task: {
                  isActive: true,
                  startDate: { lte: new Date() },
                  endDate: { gte: new Date() },
                },
              },
              take: 1,
              select: { id: true },
            },
            objects: { where: { isActive: true } },
            createdBy: {
              where: { isActive: true },
              select: { id: true, lname: true, fname: true },
            },
          },
        }),
        prisma.user.groupBy({
          by: ["isActive"],
          _count: true,
          where: { role: { not: "SUPERADMIN" } },
        }),
        prisma.user.count({
          where: {
            role: { not: "SUPERADMIN" },
            isActive: true,
            tasks: {
              some: {
                task: {
                  startDate: { lte: new Date() },
                  endDate: { gte: new Date() },
                  isActive: true,
                },
              },
            },
          },
        }),
      ]);

      const totals = {
        TOTAL: 0,
        ACTIVE: 0,
        HAVE_TASK: 0,
        DELETED: 0,
      };
      totals.TOTAL = counts.find((g) => !!g.isActive)?._count || 0;
      totals.DELETED = counts.find((g) => !g.isActive)?._count || 0;
      totals.HAVE_TASK = totalHaveTask;
      totals.ACTIVE = totals.TOTAL - totalHaveTask;

      const result = users.map((u) => ({
        id: u.id,
        fname: u.fname,
        lname: u.lname,
        phone: u.phone,
        email: u.email,
        role: u.role,
        birthday: u.birthday,
        blockedUntil: u.blockedUntil,
        lastSeans: u.lastSeans,
        avatar: u.avatar ? { url: u.avatar.url } : null,
        createdAt: u.createdAt,
        status: u.tasks.length ? "NOT_ACTIVE" : "ACTIVE",
        objects: u.objects.map((o) => ({ id: o.id, name: o.name })),
        createdBy: u.createdBy ? { id: u.createdBy.id, fname: u.createdBy.fname, lname: u.createdBy.lname } : null,
      }));

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        totals,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      let {
        query: { role, sort = "fname", reverse },
      } = req;

      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";
      role = typeof role === "string" && [Role.ACCOUNTANT, Role.ADMIN, Role.PTO, Role.WORKER].includes(role.trim()) ? role.trim() : null;

      const users = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        where: {
          isActive: true,
          ...(role ? { role } : { role: { not: "SUPERADMIN" } }),
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Foydalanuvchilar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getRoleUz = (role) => {
        const Role = {
          [Role.ADMIN]: "Admin",
          [Role.ACCOUNTANT]: "Hisobchi",
          [Role.WORKER]: "Ishchi",
          [Role.PTO]: "PTO",
        };
        return Role[role] || role || "-";
      };

      const getRoletyle = (role) => {
        const styles = {
          [Role.ADMIN]: { bgColor: "FFFFE0B2", fontColor: "FFE65100" },
          [Role.ACCOUNTANT]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [Role.WORKER]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [Role.PTO]: { bgColor: "FFF3E5F5", fontColor: "FF7B1FA2" },
        };
        return styles[role] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()} ${hours}:${minutes}`;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Ismi familiyasi", key: "fullName", minWidth: 25 },
        { header: "Lavozim", key: "role", minWidth: 15 },
        { header: "Telefon", key: "phone", minWidth: 18 },
        { header: "Yaratilgan sana", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = users.map((u, index) => {
        const data = {
          number: String(index + 1),
          fullName: `${u.fname || ""} ${u.lname || ""}`.trim() || "-",
          role: getRoleUz(u.role),
          phone: u.phone || "-",
          createdAt: formatDate(u.createdAt),
          _role: u.role,
        };

        columns.forEach((col, idx) => {
          const len = String(data[col.key]).length;
          if (len > maxLengths[idx]) {
            maxLengths[idx] = len;
          }
        });

        return data;
      });

      // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
      columns.forEach((col, idx) => {
        let width = maxLengths[idx] + 3;
        width = Math.max(width, col.minWidth || 10);
        sheet.getColumn(idx + 1).width = width;
      });

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const Roletyle = getRoletyle(data._role);
        const { _role, ...cleanData } = data;

        const row = sheet.addRow(cleanData);
        row.height = MIN_ROW_HEIGHT;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Ismi familiyasi

        // Lavozim - rangli fon
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(3).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: Roletyle.bgColor },
        };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: Roletyle.fontColor },
        };

        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Telefon
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan sana
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: "FFFFFFFF" },
          size: 12,
          name: FONT_NAME,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Role bo'yicha hisoblash
      const roleCounts = {
        [Role.ADMIN]: 0,
        [Role.ACCOUNTANT]: 0,
        [Role.WORKER]: 0,
        [Role.PTO]: 0,
      };
      users.forEach((u) => {
        if (roleCounts[u.role] !== undefined) roleCounts[u.role]++;
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:E${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Jami: ${users.length} ta | Admin: ${roleCounts[Role.ADMIN]} | Hisobchi: ${roleCounts[Role.ACCOUNTANT]} | Ishchi: ${roleCounts[Role.WORKER]} | PTO: ${
        roleCounts[Role.PTO]
      }`;
      summaryRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      summaryRow.getCell(1).alignment = {
        horizontal: "left",
        vertical: "middle",
      };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      // res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx')
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { id, role: { not: "SUPERADMIN" }, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          permissions: true,
          birthday: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      res.status(200).json({
        status: "success",
        data: user,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { id, isActive: true, role: { not: "SUPERADMIN" } },
        select: { id: true, role: true },
      });
      if (!user) throw new AppError(404, "user_not_found");

      await prisma.user.update({
        where: { id },
        data: { ...req.body },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deactivateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { id, isActive: true, role: { not: "SUPERADMIN" } },
      });
      if (!user) throw new AppError(404, "user_not_found");

      await prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          deletedById: req.user.id,
          deletedAt: new Date(),
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deactivatedUsers(req, res, next) {
    try {
      let { page, limit, sort, reverse, key } = req.query;

      key = typeof key === "string" ? key.trim() : null;
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "deletedAt";

      const findWhere = {
        isActive: false,
        role: { not: "SUPERADMIN" },
        ...(key && {
          OR: [
            { fname: { contains: key, mode: "insensitive" } },
            { lname: { contains: key, mode: "insensitive" } },
            { email: { contains: key, mode: "insensitive" } },
            { phone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.user.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const deletedUsers = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              role: true,
            },
          },
          deletedBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              role: true,
            },
          },
        },
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: deletedUsers,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async activateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { id, isActive: false, role: { not: "SUPERADMIN" } },
      });
      if (!user) throw new AppError(404, "user_not_found");

      await prisma.user.update({
        where: { id },
        data: {
          isActive: true,
          deletedById: null,
          deletedAt: null,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDeleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { isActive: false, id },
        include: { avatar: true },
      });
      if (!user) throw new AppError(404, "user_not_found");

      await prisma.user.delete({
        where: { id },
      });

      if (user.avatar) {
        await deleteFileFromS3(user.avatar.filename);
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async blockOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      let period = 0;
      switch (req.body.period) {
        case "1d":
          period = new Date(Date.now() + 24 * 60 * 60 * 1000);
          break;
        case "7d":
          period = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          break;
        case "1m":
          period = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          period = 0;
          break;
      }

      await prisma.user.update({
        where: {
          id,
          isActive: true,
          NOT: {
            role: "SUPERADMIN",
          },
        },
        data: {
          blockedUntil: period,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async removeBlock(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await prisma.user.update({
        where: {
          id,
          isActive: true,
        },
        data: {
          blockedUntil: null,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async search(req, res, next) {
    try {
      const key = typeof req.query.key === "string" ? req.query.key.trim() : null;

      const users = await prisma.user.findMany({
        where: {
          role: { not: "SUPERADMIN" },
          isActive: true,
          ...(key && {
            OR: [{ fname: { contains: key, mode: "insensitive" } }, { lname: { contains: key, mode: "insensitive" } }, { email: { contains: key, mode: "insensitive" } }],
          }),
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          avatar: { select: { url: true } },
        },
        orderBy: { fname: "asc" },
      });

      res.status(200).json({
        status: "success",
        data: users,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchWithPagination(req, res, next) {
    try {
      let {
        query: { page = 1, limit = 10, sort = "fname", reverse, key },
      } = req;
      if (typeof key === "string") {
        key = key.trim();
      }
      page = Number(page);
      limit = Number(limit);
      reverse = reverse === "true" ? true : false;
      if (isNaN(page) || page === 0 || page < 0) page = 1;
      if (isNaN(limit) || limit === 0 || limit < 0) limit = 10;
      let take = limit;
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";
      const findWhere = {
        AND: [
          { role: { not: "SUPERADMIN" } },
          { isActive: true },
          {
            OR: [
              { fname: { contains: key, mode: "insensitive" } },
              { lname: { contains: key, mode: "insensitive" } },
              { email: { contains: key, mode: "insensitive" } },
              { phone: { contains: key, mode: "insensitive" } },
            ],
          },
        ],
      };
      const orderBy = {};
      orderBy[sort] = reverse === true ? "desc" : "asc";
      const count = await prisma.user.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      if (totalPage === 0) page = 1;
      else if (totalPage !== 0 && page > totalPage) page = totalPage;
      const skip = (page - 1) * limit;
      const users = await prisma.user.findMany({
        where: findWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          objects: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          blockedUntil: true,
          permissions: true,
          lastSeans: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy,
        take,
        skip,
      });

      const totals = {
        TOTAL: 0,
        ACTIVE: 0,
        HAVE_TASK: 0,
        DELETED: 0,
      };

      const totalUserCount = await prisma.user.count({
        where: { role: { not: "SUPERADMIN" }, isActive: true },
      });
      totals.TOTAL = totalUserCount;

      const totalDeleted = await prisma.user.count({
        where: { role: { not: "SUPERADMIN" }, isActive: false },
      });
      totals.DELETED = totalDeleted;

      const totalHaveTask = await prisma.user.count({
        where: {
          role: { not: "SUPERADMIN" },
          isActive: true,
          tasks: {
            some: {
              task: {
                startDate: { lte: new Date() },
                endDate: { gte: new Date() },
                isActive: true,
              },
            },
          },
        },
      });
      totals.HAVE_TASK = totalHaveTask;
      totals.ACTIVE = totalUserCount - totalHaveTask;

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        totals,
        data: users,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchDeletedWithPagination(req, res, next) {
    try {
      let {
        query: { page = 1, limit = 10, sort = "fname", reverse, key },
      } = req;
      if (typeof key === "string") {
        key = key.trim();
      }
      page = Number(page);
      limit = Number(limit);
      reverse = reverse === "true" ? true : false;
      if (isNaN(page) || page === 0 || page < 0) page = 1;
      if (isNaN(limit) || limit === 0 || limit < 0) limit = 10;
      let take = limit;
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";
      const findWhere = {
        AND: [
          { role: { not: "SUPERADMIN" } },
          { isActive: false },
          {
            OR: [
              { fname: { contains: key, mode: "insensitive" } },
              { lname: { contains: key, mode: "insensitive" } },
              { email: { contains: key, mode: "insensitive" } },
              { phone: { contains: key, mode: "insensitive" } },
            ],
          },
        ],
      };
      const orderBy = {};
      orderBy[sort] = reverse === true ? "desc" : "asc";
      const count = await prisma.user.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      if (totalPage === 0) page = 1;
      else if (totalPage !== 0 && page > totalPage) page = totalPage;
      const skip = (page - 1) * limit;
      const users = await prisma.user.findMany({
        where: findWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          objects: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          blockedUntil: true,
          permissions: true,
          lastSeans: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              avatar: true,
              role: true,
            },
          },
          deletedBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              avatar: true,
              role: true,
            },
          },
        },
        orderBy,
        take,
        skip,
      });
      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: users,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchSortedByRole(req, res, next) {
    try {
      const key = typeof req.query.key === "string" ? req.query.key.trim() : null;

      const users = await prisma.user.findMany({
        where: {
          role: { not: "SUPERADMIN" },
          isActive: true,
          ...(key && {
            OR: [
              { fname: { contains: key, mode: "insensitive" } },
              { lname: { contains: key, mode: "insensitive" } },
              { email: { contains: key, mode: "insensitive" } },
              { phone: { contains: key, mode: "insensitive" } },
            ],
          }),
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          role: true,
          avatar: { select: { url: true } },
        },
        orderBy: { fname: "asc" },
      });

      const sorted = users.sort((a, b) => a.role.localeCompare(b.role));

      res.status(200).json({
        status: "success",
        data: sorted,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAdmins(_req, res, next) {
    try {
      const admins = await prisma.user.findMany({
        where: {
          isActive: true,
          role: "ADMIN",
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          role: true,
          avatar: true,
          phone: true,
          email: true,
          createdAt: true,
        },
      });

      res.status(200).json({
        status: "success",
        data: admins,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getWorkers(req, res, next) {
    try {
      let { page = 1, limit = 10, sort = "fname", reverse /* status = 'all' */ } = req.query;

      // Check query items for valid.
      page = Number(page);
      limit = Number(limit);
      reverse = reverse === "true" ? true : false;
      if (isNaN(page) || page === 0 || page < 0) page = 1;
      if (isNaN(limit) || limit === 0 || limit < 0) limit = 10;

      // Limit.
      let take = limit;

      // Sort.
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";

      // OrderBy.
      const orderBy = {};
      orderBy[sort] = reverse === true ? "desc" : "asc";

      // Count.
      const count = await prisma.user.count({
        where: {
          isActive: true,
          role: Role.WORKER,
        },
      });

      // Total page.
      let totalPage = Math.ceil(count / limit);

      if (totalPage === 0) {
        page = 1;
      } else if (totalPage !== 0 && page > totalPage) {
        page = totalPage;
      }

      // Skip.
      const skip = (page - 1) * limit;

      // Get from database.
      const users = await prisma.user.findMany({
        where: {
          role: Role.WORKER,
          isActive: true,
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          tasks: {
            where: { task: { isActive: true } },
            select: {
              id: true,
              task: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  startDate: true,
                  endDate: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
          objects: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          blockedUntil: true,
          permissions: true,
          lastSeans: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy,
        take,
        skip,
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: users,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createWorkerToObject(req, res, next) {
    try {
      const object = await prisma.object.findFirst({
        where: { isActive: true, id: req.body.object_id },
        select: { id: true },
      });
      if (!object) throw new AppError(404, "object_not_found");

      const condidatPhone = await prisma.user.findUnique({
        where: { phone: req.body.phone },
      });
      if (condidatPhone) {
        if (condidatPhone.isActive === false) throw new AppError(400, "phone_already_taken_and_but_that_user_disabled");
        else throw new AppError(400, "phone_already_taken");
      }

      const condidatEmail = await prisma.user.findUnique({
        where: { email: req.body.email },
      });
      if (condidatEmail) {
        if (condidatEmail.isActive === false) throw new AppError(400, "email_already_taken_and_but_that_user_disabled");
        else throw new AppError(400, "email_already_taken");
      }

      const passwordHash = await hashPassword(req.body.password);

      const newWorker = await prisma.user.create({
        data: {
          fname: req.body.fname,
          lname: req.body.lname,
          phone: req.body.phone,
          password: passwordHash,
          email: req.body.email,
          role: Role.WORKER,
          createdById: req.user.id,
        },
        select: { id: true },
      });

      await prisma.object.update({
        where: { isActive: true, id: req.body.object_id },
        data: { assigned: { connect: [{ id: newWorker.id }] } },
      });

      // Send SMS.
      await SMS.send(
        `998${newWorker.phone}`,
        `Rsq.uz Hurmatli ${newWorker.fname + " " + newWorker.lname} siz uchun profil yaratildi. Login: +998${newWorker.phone} Pochta: ${newWorker.email} Parol: ${req.body.password} Tizimga kirish uchun: rsq.uz/kabinet`,
      );

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteWokerFromObject(req, res, next) {
    try {
      const objectId = idChecker(req.params.objectId);
      if (!objectId) throw new AppError(400, "bad_request");

      const workerId = idChecker(req.params.workerId);
      if (!workerId) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({
        where: { id: objectId, isActive: true },
        select: { id: true, assigned: true },
      });
      if (!object) throw new AppError(404, "object_not_found");

      const worker = await prisma.user.findFirst({
        where: { id: workerId, isActive: true },
        select: { id: true },
      });
      if (!worker) throw new AppError(404, "worker_not_found");

      await prisma.object.update({
        where: { isActive: true, id: objectId },
        data: {
          assigned: { disconnect: [{ id: workerId }] },
        },
      });

      await prisma.user.update({
        where: { isActive: true, id: workerId },
        data: { isActive: false },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getFilteredByRole(req, res, next) {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true, NOT: { role: "SUPERADMIN" } },
        select: {
          id: true,
          fname: true,
          lname: true,
          email: true,
          phone: true,
          role: true,
          avatar: true,
        },
      });

      const filtered = {
        admin: [],
        accountant: [],
        worker: [],
        pto: [],
      };

      users.forEach((user) => filtered[user.role.toLocaleLowerCase()].push(user));

      res.status(200).json({
        status: "success",
        data: filtered,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserWithBalance(req, res, next) {
    try {
      let { page, limit, sort, reverse, key } = req.query;

      key = typeof key === "string" ? key.trim() : null;
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = allowedColumnKeysForGetUsersWithBalance.includes(sort) ? sort : "fname";

      const findWhere = {
        role: { not: "SUPERADMIN" },
        isActive: true,
        ...(key && {
          OR: [
            { fname: { contains: key, mode: "insensitive" } },
            { lname: { contains: key, mode: "insensitive" } },
            { email: { contains: key, mode: "insensitive" } },
            { phone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.user.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const users = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        include: {
          avatar: true,
          acceptedTransfers: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          createdTransactions: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      const result = users.map((u) => ({
        id: u.id,
        fname: u.fname,
        lname: u.lname,
        phone: u.phone,
        email: u.email,
        role: u.role,
        fund: {
          balance: u.balance,
          totalSpent: u.totalExpense,
          totalGiven: u.totalIncome,
        },
        avatar: u.avatar ? { url: u.avatar.url } : null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserWithBalanceExcelDoc(req, res, next) {
    try {
      let { sort = "fname", reverse } = req.query;

      reverse = typeof reverse === "string" && ["true", "false"].includes(reverse.trim()) ? reverse.trim() === "true" : false;
      sort = allowedColumnKeysForGetUsersWithBalance.includes(sort) ? sort : "fname";

      const users = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        where: { isActive: true, role: { not: "SUPERADMIN" } },
        select: {
          id: true,
          fname: true,
          lname: true,
          role: true,
          balance: true,
          totalExpense: true,
          totalIncome: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Foydalanuvchilar balansi");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getRoleUz = (role) => {
        const Role = {
          [Role.ADMIN]: "Admin",
          [Role.ACCOUNTANT]: "Hisobchi",
          [Role.WORKER]: "Ishchi",
          [Role.PTO]: "PTO",
        };
        return Role[role] || role || "-";
      };

      const getRoletyle = (role) => {
        const styles = {
          [Role.ADMIN]: { bgColor: "FFFFE0B2", fontColor: "FFE65100" },
          [Role.ACCOUNTANT]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [Role.WORKER]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [Role.PTO]: { bgColor: "FFF3E5F5", fontColor: "FF7B1FA2" },
        };
        return styles[role] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "0.00";
        return Number(num).toLocaleString("uz-UZ", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Ismi familiyasi", key: "fullName", minWidth: 25 },
        { header: "Lavozim", key: "role", minWidth: 15 },
        { header: "Jami berilgan", key: "totalGiven", minWidth: 18 },
        { header: "Jami sarflangan", key: "totalSpent", minWidth: 18 },
        { header: "Qolgan summa", key: "balance", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = users.map((u, index) => {
        const balance = Number(u.balance);

        const data = {
          number: String(index + 1),
          fullName: `${u.fname || ""} ${u.lname || ""}`.trim() || "-",
          role: getRoleUz(u.role),
          totalGiven: formatAmount(u.totalIncome),
          totalSpent: formatAmount(u.totalExpense),
          balance: formatAmount(balance),
          _role: u.role,
          _balance: balance,
        };

        columns.forEach((col, idx) => {
          const len = String(data[col.key]).length;
          if (len > maxLengths[idx]) {
            maxLengths[idx] = len;
          }
        });

        return data;
      });

      // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
      columns.forEach((col, idx) => {
        let width = maxLengths[idx] + 3;
        width = Math.max(width, col.minWidth || 10);
        sheet.getColumn(idx + 1).width = width;
      });

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const Roletyle = getRoletyle(data._role);
        const { _role, _balance, ...cleanData } = data;

        const row = sheet.addRow(cleanData);
        row.height = MIN_ROW_HEIGHT;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Ismi familiyasi

        // Lavozim - rangli fon
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(3).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: Roletyle.bgColor },
        };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: Roletyle.fontColor },
        };

        // Jami berilgan - yashil
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(4).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          color: { argb: "FF2E7D32" },
        };

        // Jami sarflangan - qizil
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          color: { argb: "FFC62828" },
        };

        // Qolgan summa - musbat yashil, manfiy qizil
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _balance >= 0 ? "FF2E7D32" : "FFC62828" },
        };
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: "FFFFFFFF" },
          size: 12,
          name: FONT_NAME,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Umumiy summalar
      const totalGiven = users.reduce((sum, u) => sum + fromMinorUnits(u.totalIncome), 0);
      const totalSpent = users.reduce((sum, u) => sum + fromMinorUnits(u.totalExpense), 0);
      const totalBalance = users.reduce((sum, u) => sum + fromMinorUnits(u.balance), 0);

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Jami foydalanuvchilar: ${users.length} ta`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = {
        horizontal: "left",
        vertical: "middle",
      };

      summaryRow.getCell(4).value = formatNumber(totalGiven);
      summaryRow.getCell(4).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FF2E7D32" },
      };
      summaryRow.getCell(4).alignment = {
        horizontal: "right",
        vertical: "middle",
      };

      summaryRow.getCell(5).value = formatNumber(totalSpent);
      summaryRow.getCell(5).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FFC62828" },
      };
      summaryRow.getCell(5).alignment = {
        horizontal: "right",
        vertical: "middle",
      };

      summaryRow.getCell(6).value = formatNumber(totalBalance);
      summaryRow.getCell(6).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: totalBalance >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      summaryRow.getCell(6).alignment = {
        horizontal: "right",
        vertical: "middle",
      };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransfers(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          avatar: true,
          balance: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      let { page, limit, reverse, sort } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse === "false" ? false : true;
      sort = ["createdAt", "amount"].includes(sort) ? sort : "createdAt";

      const count = await prisma.fundTransfer.count({
        where: {
          isActive: true,
          OR: [{ createdById: id }, { recipientUserId: id }],
        },
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [transfers] = await Promise.all([
        prisma.fundTransfer.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: {
            isActive: true,
            OR: [{ createdById: id }, { recipientUserId: id }],
          },
          select: {
            id: true,
            amount: true,
            contractNumber: true,
            note: true,
            recipientUserId: true,
            fromObject: { select: { id: true, name: true } },
            toObject: { select: { id: true, name: true } },
            fromOrganization: { select: { id: true, organizationName: true } },
            toOrganization: { select: { id: true, organizationName: true } },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: true,
                role: true,
              },
            },
            recipientUser: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: true,
                role: true,
              },
            },
            createdAt: true,
          },
        }),
      ]);

      res.status(200).json({
        status: "success",
        page,
        totalPage,
        totalCount: count,
        limit,
        sort,
        reverse,
        user: {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          avatar: user.avatar ? { url: user.avatar.url } : null,
        },
        data: transfers,
        totals: {
          remainingAmount: user.balance,
          amountReceived: user.totalIncome,
          amountSpent: user.totalExpense,
        },
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async changePasswordUser(req, res, next) {
    try {
      const { userId, new_password: newPassword } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new AppError(404, "user_not_found");

      const passwordHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: passwordHash,
          pwdVersion: { increment: 1 },
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserIncomeAndExpenditure(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { id, isActive: true },
        include: { avatar: true },
        omit: { password: true },
      });
      if (!user) throw new AppError(404, "user_not_found");

      let { page, limit, object } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;

      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({ where: { id: Number(object), isActive: true }, select: { id: true } }))
          ? Number(object)
          : null;

      // Transfers uchun where shartlari
      const transferWhere = {
        isActive: true,
        OR: [{ senderUserId: id }, { recipientUserId: id }],
        ...(object && { OR: [{ toObjectId: object }, { fromObjectId: object }] }),
      };

      // Transactions uchun where shartlari
      const transactionWhere = {
        isActive: true,
        createdById: id,
        usedFromOrganizationBalance: false,
        ...(object && { objectId: object }),
      };

      // Countlarni hisoblash
      const [transfersCount, transactionsCount] = await Promise.all([prisma.fundTransfer.count({ where: transferWhere }), prisma.transaction.count({ where: transactionWhere })]);
      const count = transfersCount + transactionsCount;

      // User uchun barcha transfer va transactionlardan summalarni hisoblash
      let amountReceived = 0n; // Daromad
      let amountSpent = 0n; // Xarajat

      // Transferlardan hisoblash:
      // - recipientUserId = id bo'lsa, bu user pul OLDİ (daromad)
      // - createdById = id bo'lsa, bu user pul YUBORDİ (xarajat)
      const transferStats = await Promise.all([
        // User olgan transferlar
        prisma.fundTransfer.aggregate({
          where: { ...transferWhere, recipientUserId: id },
          _sum: { amount: true },
        }),
        // User yuborgan transferlar
        prisma.fundTransfer.aggregate({
          where: { ...transferWhere, senderUserId: id },
          _sum: { amount: true },
        }),
      ]);

      // Transactionlardan hisoblash:
      // - type = 'income' bo'lsa, daromad
      // - type = 'expense' bo'lsa, xarajat
      const transactionStats = await Promise.all([
        // Income transactionlari
        prisma.transaction.aggregate({
          where: { ...transactionWhere, type: TransactionType.INCOME },
          _sum: { amount: true },
        }),
        // Expense transactionlari
        prisma.transaction.aggregate({
          where: { ...transactionWhere, type: TransactionType.EXPENSE },
          _sum: { amount: true },
        }),
      ]);

      // Daromadlarni hisoblash
      amountReceived =
        (transferStats[0]?._sum.amount || 0n) + // transferdan olgan pul
        (transactionStats[0]?._sum.amount || 0n); // income transactionlar

      // Xarajatlarni hisoblash
      amountSpent =
        (transferStats[1]?._sum.amount || 0n) + // transferga yuborgan pul
        (transactionStats[1]?._sum.amount || 0n); // expense transactionlar

      const remainingAmount = amountReceived - amountSpent;

      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const skip = (page - 1) * limit;

      // Asosiy ma'lumotlarni olish
      const [transfers, transactions] = await Promise.all([
        prisma.fundTransfer.findMany({
          orderBy: { createdAt: "desc" },
          where: transferWhere,
          select: {
            id: true,
            amount: true,
            contractNumber: true,
            note: true,
            recipientUserId: true,
            fromObject: {
              select: {
                id: true,
                name: true,
              },
            },
            toObject: {
              select: {
                id: true,
                name: true,
              },
            },
            fromOrganization: {
              select: {
                id: true,
                organizationName: true,
              },
            },
            toOrganization: {
              select: {
                id: true,
                organizationName: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: true,
                role: true,
              },
            },
            recipientUser: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: true,
                role: true,
              },
            },
            createdAt: true,
          },
        }),
        prisma.transaction.findMany({
          orderBy: { date: "desc" },
          where: transactionWhere,
          include: {
            attachments: true,
            items: true,
            object: true,
            organization: true,
            salaryPayment: { include: { owner: true } },
          },
        }),
      ]);

      // Ma'lumotlarni birlashtirish va tartiblash
      const joined = [...transactions.map((t) => ({ ...t, t: "transaction", date: t.date })), ...transfers.map((t) => ({ ...t, t: "transfer", date: t.createdAt }))];

      const sorted = joined.sort((a, b) => new Date(b.date) - new Date(a.date));
      const result = sorted.slice(skip, skip + limit > count ? count : skip + limit);

      res.status(200).json({
        status: "success",
        page,
        totalPage,
        totalCount: count,
        limit,
        user: {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          avatar: user.avatar ? { url: user.avatar.url } : null,
        },
        data: result.map((t) => {
          if (t.t === "transfer") {
            return {
              t: t.t,
              id: t.id,
              amount: fromMinorUnits(t.amount),
              contractNumber: t.contractNumber,
              note: t.note,
              fromObject: t.fromObject ? { id: t.fromObject.id, name: t.fromObject.name } : null,
              toObject: t.toObject ? { id: t.toObject.id, name: t.toObject.name } : null,
              fromOrganization: t.fromOrganization ? { id: t.fromOrganization.id, organizationName: t.fromOrganization.organizationName } : null,
              toOrganization: t.toOrganization ? { id: t.toOrganization.id, organizationName: t.toOrganization.organizationName } : null,
              createdBy: t.createdBy
                ? {
                    id: t.createdBy.id,
                    fname: t.createdBy.fname,
                    lname: t.createdBy.lname,
                    avatar: t.createdBy.avatar ? { url: t.createdBy.avatar.url } : null,
                    role: t.createdBy.role,
                  }
                : null,
              recipientUser: t.recipientUser
                ? {
                    id: t.recipientUser.id,
                    fname: t.recipientUser.fname,
                    lname: t.recipientUser.lname,
                    avatar: t.recipientUser.avatar ? { url: t.recipientUser.avatar.url } : null,
                    role: t.recipientUser.role,
                  }
                : null,
              createdAt: t.createdAt,
              date: t.date,
            };
          } else if (t.t === "transaction") {
            return {
              t: t.t,
              id: t.id,
              notes: t.notes,
              amount: fromMinorUnits(t.amount),
              date: t.date,
              purpose: t.purpose,
              isReviewed: t.isReviewed,
              isSalary: t.isSalary,
              type: t.type,
              object: t.object ? { id: t.object.id, name: t.object.name } : null,
              attachments: t.attachments.map((a) => ({
                id: a.id,
                url: a.url,
                originalname: a.originalname,
                filesize: a.filesize,
                mimeType: a.mimeType,
              })),
              organization: t.organization ? { id: t.organization.id, organizationName: t.organization.organizationName } : null,
              usedFromOrganizationBalance: t.usedFromOrganizationBalance,
              salaryPayment: t.salaryPayment
                ? {
                    id: t.salaryPayment.id,
                    owner: {
                      id: t.salaryPayment.owner.id,
                      fname: t.salaryPayment.owner.fname,
                      lname: t.salaryPayment.owner.lname,
                    },
                  }
                : null,
              items: t.items.map((i) => ({
                id: i.id,
                name: i.name,
                parameter: i.parameter,
                quantity: i.quantity,
                pricePerUnit: fromMinorUnits(i.pricePerUnit),
                totalPrice: fromMinorUnits(i.totalPrice),
                unit: i.unit,
              })),
              updatedAt: t.updatedAt,
            };
          }
        }),
        totals: {
          remainingAmount: fromMinorUnits(remainingAmount),
          amountReceived: fromMinorUnits(amountReceived),
          amountSpent: fromMinorUnits(amountSpent),
        },
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserIncomeAndExpenditureExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      // Object parametrini olish
      let { object } = req.query;

      object =
        !Number.isNaN(Number(object)) && Number(object) > 0
          ? (await prisma.object.findFirst({
              where: { id: Number(object), isActive: true },
              select: { id: true },
            }))
            ? Number(object)
            : null
          : null;

      // Transferlar uchun where shartlari
      const transferWhere = {
        isActive: true,
        OR: [{ createdById: id }, { recipientUserId: id }],
        ...(object && {
          OR: [{ toObjectId: object }, { fromObjectId: object }],
        }),
      };

      // Transactionlar uchun where shartlari
      const transactionWhere = {
        isActive: true,
        createdById: id,
        usedFromOrganizationBalance: false,
        ...(object && { objectId: object }),
      };

      // User ma'lumotlari
      const user = await prisma.user.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          avatar: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      // Statistikani hisoblash - TO'G'RI INDEKS QO'LLASH
      const [receivedTransfers, sentTransfers, incomeTransactions, expenseTransactions] = await Promise.all([
        // User olgan transferlar
        prisma.fundTransfer.aggregate({
          where: {
            ...transferWhere,
            recipientUserId: id,
          },
          _sum: {
            amount: true,
          },
        }),
        // User yuborgan transferlar
        prisma.fundTransfer.aggregate({
          where: {
            ...transferWhere,
            createdById: id,
          },
          _sum: {
            amount: true,
          },
        }),
        // Income transactionlari
        prisma.transaction.aggregate({
          where: {
            ...transactionWhere,
            type: TransactionType.INCOME,
          },
          _sum: {
            amount: true,
          },
        }),
        // Expense transactionlari
        prisma.transaction.aggregate({
          where: {
            ...transactionWhere,
            type: TransactionType.EXPENSE,
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

      // Totallarni hisoblash - TO'G'RI O'ZGARUVCHILAR
      const amountReceived = (receivedTransfers._sum?.amount || 0n) + (incomeTransactions._sum?.amount || 0n);
      const amountSpent = (sentTransfers._sum?.amount || 0n) + (expenseTransactions._sum?.amount || 0n);
      const remainingAmount = amountReceived - amountSpent;

      // Asosiy ma'lumotlarni olish
      const [transfers, transactions] = await Promise.all([
        prisma.fundTransfer.findMany({
          orderBy: { createdAt: "desc" },
          where: transferWhere,
          select: {
            id: true,
            amount: true,
            note: true,
            recipientUserId: true,
            fromObject: { select: { id: true, name: true } },
            toObject: { select: { id: true, name: true } },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: true,
              },
            },
            recipientUser: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: true,
              },
            },
            createdAt: true,
          },
        }),
        prisma.transaction.findMany({
          orderBy: { date: "desc" },
          where: transactionWhere,
          select: {
            id: true,
            amount: true,
            notes: true,
            purpose: true,
            type: true,
            date: true,
            object: { select: { id: true, name: true } },
            organization: { select: { id: true, organizationName: true } },
          },
        }),
      ]);

      // Ma'lumotlarni birlashtirish
      const joined = [
        ...transactions.map((t) => ({
          ...t,
          _type: "transaction",
          _date: t.date,
        })),
        ...transfers.map((t) => ({
          ...t,
          _type: "transfer",
          _date: t.createdAt,
        })),
      ];

      const sorted = joined.sort((a, b) => new Date(b._date) - new Date(a._date));

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const fullName = `${user.fname || ""} ${user.lname || ""}`.trim();

      // Agar object berilgan bo'lsa, sheet nomiga object nomini qo'shamiz
      let sheetName = fullName || "Kirim-chiqim";
      let objectName = "";
      if (object) {
        const objectData = await prisma.object.findFirst({
          where: { id: object, isActive: true },
          select: { name: true },
        });
        if (objectData) {
          sheetName = `${fullName} - ${objectData.name}`;
          objectName = objectData.name;
        }
      }

      const sheet = workbook.addWorksheet(sheetName);

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 35;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()} ${hours}:${minutes}`;
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "0.00";
        return Number(num).toLocaleString("uz-UZ", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      const getFullName = (person) => {
        if (!person) return "-";
        return `${person.fname || ""} ${person.lname || ""}`.trim() || "-";
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Yuboruvchi", key: "sender", minWidth: 22 },
        { header: "Miqdor", key: "amount", minWidth: 18 },
        {
          header: "Qabul qiluvchi/xarajat",
          key: "recipient",
          minWidth: 25,
          maxWidth: MAX_WIDTH,
          wrapText: true,
        },
        { header: "O'tkazma sanasi", key: "date", minWidth: 18 },
        {
          header: "O'tkazma tavsifi",
          key: "description",
          minWidth: 30,
          maxWidth: MAX_WIDTH,
          wrapText: true,
        },
        {
          header: "Obyekt",
          key: "object",
          minWidth: 20,
          maxWidth: MAX_WIDTH,
          wrapText: true,
        },
        { header: "Turi", key: "type", minWidth: 15 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = sorted.map((item, index) => {
        let sender = "-";
        let recipient = "-";
        let description = "-";
        let objectName = "-";
        let type = "-";
        let isIncome = false;

        if (item._type === "transfer") {
          sender = getFullName(item.createdBy);
          recipient = getFullName(item.recipientUser);
          description = item.note || "-";
          objectName = item.toObject?.name || item.fromObject?.name || "-";
          type = "O'tkazma";
          // Agar user qabul qiluvchi bo'lsa - kirim
          isIncome = item.recipientUserId === id;
        } else if (item._type === "transaction") {
          sender = item.type === TransactionType.INCOME ? item.organization?.organizationName || "-" : fullName;
          recipient = item.type === TransactionType.EXPENSE ? item.purpose || item.organization?.organizationName || "Xarajat" : fullName;
          description = item.notes || item.purpose || "-";
          objectName = item.object?.name || "-";
          type = item.type === TransactionType.INCOME ? "Kirim" : "Chiqim";
          isIncome = item.type === TransactionType.INCOME;
        }

        const data = {
          number: String(index + 1),
          sender,
          amount: formatAmount(item.amount),
          recipient,
          date: formatDate(item._date),
          description,
          object: objectName,
          type,
          _isIncome: isIncome,
          _type: item._type,
        };

        columns.forEach((col, idx) => {
          if (col.maxWidth) return;
          const len = String(data[col.key]).length;
          if (len > maxLengths[idx]) {
            maxLengths[idx] = len;
          }
        });

        return data;
      });

      // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
      columns.forEach((col, idx) => {
        let width;
        if (col.maxWidth) {
          width = Math.min(maxLengths[idx] + 3, col.maxWidth);
        } else {
          width = maxLengths[idx] + 3;
        }
        width = Math.max(width, col.minWidth || 10);
        sheet.getColumn(idx + 1).width = width;
      });

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const { _isIncome, _type, ...cleanData } = data;

        const row = sheet.addRow(cleanData);
        row.height = MIN_ROW_HEIGHT;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Yuboruvchi

        // Miqdor - kirim yashil, chiqim qizil
        row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _isIncome ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(4).alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        }; // Qabul qiluvchi
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" }; // Sana
        row.getCell(6).alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        }; // Tavsif
        row.getCell(7).alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        }; // Obyekt
        row.getCell(8).alignment = { horizontal: "center", vertical: "middle" }; // Turi
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: "FFFFFFFF" },
          size: 12,
          name: FONT_NAME,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Hisoblangan totallarni formatlab olish
      const totalIncome = fromMinorUnits(amountReceived);
      const totalExpense = fromMinorUnits(amountSpent);
      const balance = fromMinorUnits(remainingAmount);

      // Agar object filter bo'lsa, sarlavhada bildirish
      if (object && objectName) {
        const titleRow = sheet.getRow(summaryRowNumber - 1);
        sheet.mergeCells(`A${summaryRowNumber - 1}:H${summaryRowNumber - 1}`);
        titleRow.getCell(1).value = `OBYEKT: ${objectName}`;
        titleRow.getCell(1).font = { bold: true, size: 14, name: FONT_NAME };
        titleRow.getCell(1).alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        titleRow.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F0F0" },
        };
        // summaryRowNumber o'zgarishini hisobga olish
        // Keyingi qatorlarni yozishda +1 qo'shamiz
      }

      // Jami kirim
      const incomeRowStart = object && objectName ? summaryRowNumber + 1 : summaryRowNumber;
      const incomeRow = sheet.getRow(incomeRowStart);
      sheet.mergeCells(`A${incomeRowStart}:B${incomeRowStart}`);
      incomeRow.getCell(1).value = "Jami olingan:";
      incomeRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      incomeRow.getCell(1).alignment = {
        horizontal: "right",
        vertical: "middle",
      };
      incomeRow.getCell(3).value = formatNumber(totalIncome);
      incomeRow.getCell(3).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FF2E7D32" },
      };
      incomeRow.getCell(3).alignment = {
        horizontal: "right",
        vertical: "middle",
      };

      // Jami chiqim
      const expenseRow = sheet.getRow(incomeRowStart + 1);
      sheet.mergeCells(`A${incomeRowStart + 1}:B${incomeRowStart + 1}`);
      expenseRow.getCell(1).value = "Jami sarflangan:";
      expenseRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      expenseRow.getCell(1).alignment = {
        horizontal: "right",
        vertical: "middle",
      };
      expenseRow.getCell(3).value = formatNumber(totalExpense);
      expenseRow.getCell(3).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FFC62828" },
      };
      expenseRow.getCell(3).alignment = {
        horizontal: "right",
        vertical: "middle",
      };

      // Qoldiq
      const balanceRow = sheet.getRow(incomeRowStart + 2);
      sheet.mergeCells(`A${incomeRowStart + 2}:B${incomeRowStart + 2}`);
      balanceRow.getCell(1).value = "Qoldiq:";
      balanceRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      balanceRow.getCell(1).alignment = {
        horizontal: "right",
        vertical: "middle",
      };
      balanceRow.getCell(3).value = formatNumber(balance);
      balanceRow.getCell(3).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: balance >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      balanceRow.getCell(3).alignment = {
        horizontal: "right",
        vertical: "middle",
      };

      // Info qatori (agar object bo'lsa)
      if (object) {
        const infoRow = sheet.getRow(incomeRowStart + 4);
        sheet.mergeCells(`A${incomeRowStart + 4}:H${incomeRowStart + 4}`);
        infoRow.getCell(1).value = `* Hisob-kitoblar faqat tanlangan obyekt uchun amalga oshirildi`;
        infoRow.getCell(1).font = {
          italic: true,
          size: 9,
          name: FONT_NAME,
          color: { argb: "FF666666" },
        };
        infoRow.getCell(1).alignment = {
          horizontal: "left",
          vertical: "middle",
        };
      }

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();

      // Foydalanuvchi va object nomini fayl nomiga qo'shish
      let fileName = fullName || "income-expenditure";
      if (object && objectName) {
        fileName = `${fileName}_${objectName}`;
      }

      // Xos belgilarni tozalash
      // fileName = fileName.replace(/[^\w\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\s-]/gi, '').trim()

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      // res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}.xlsx`)
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOnlyNames(req, res, next) {
    try {
      let {
        query: { key },
      } = req;

      key = typeof key === "string" ? key.trim() || "" : "";

      const users = await prisma.user.findMany({
        orderBy: {
          fname: "asc",
        },
        where: {
          role: { not: "SUPERADMIN" },
          isActive: true,
          ...(key && {
            OR: [{ fname: { contains: key, mode: "insensitive" } }, { lname: { contains: key, mode: "insensitive" } }],
          }),
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          avatar: {
            select: {
              url: true,
            },
          },
        },
      });

      res.status(200).json({
        status: "successs",
        data: users,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = userController;
