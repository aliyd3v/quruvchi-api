const ExcelJS = require("exceljs");
const prisma = require("../../lib/prisma");
const AppError = require("../../utils/AppError");
const { idChecker } = require("../../utils/idChecker");
const { localErrorHandler } = require("../../utils/localErrorHandler");
const { fromMinorUnits } = require("../../utils/amount");
const userService = require("./user.service");

const userController = {
  async createOne(req, res, next) {
    try {
      const {
        body: data,
        user: { id: createdById },
      } = req;
      await userService.create({ data, createdById });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getList(req, res, next) {
    const { query } = req;

    try {
      const data = await userService.getList(query);

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getById(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const data = await userService.getById(id);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async update(req, res, next) {
    const { params, body: data } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");

      await userService.update({ id, data });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async softDelete(req, res, next) {
    const {
      params,
      user: { id: deletedById },
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");

      await userService.softDelete({ id, deletedById });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async trashList(req, res, next) {
    try {
      const data = await userService.trashList(req.query);

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restore(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await userService.restore(id);

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async delete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await userService.delete(id);

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async block(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await userService.block(id);

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

      await userService.removeBlock(id);

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async search(req, res, next) {
    const key = typeof req.query.key === "string" ? req.query.key.trim() : null;

    try {
      const data = await userService.search(key);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchDeletedWithPagination(req, res, next) {
    try {
      const data = await userService.searchTrash(req.query);

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchSortedByRole(req, res, next) {
    const key = typeof req.query.key === "string" ? req.query.key.trim() : null;

    try {
      const data = await userService(key);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAdmins(_req, res, next) {
    try {
      const data = await userService.getAdmins();

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getWorkers(req, res, next) {
    try {
      const data = await userService.getWorkers(req.query);

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createWorkerToObject(req, res, next) {
    const {
      body: data,
      user: { id: createdById },
    } = req;

    try {
      await userService.createInObject({ data, createdById });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteWokerFromObject(req, res, next) {
    const { params } = req;

    try {
      const objectId = idChecker(params.objectId);
      if (!objectId) throw new AppError(400, "bad_request");

      const workerId = idChecker(params.workerId);
      if (!workerId) throw new AppError(400, "bad_request");

      await userService.removeAssignFromObject({ objectId, workerId });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getFilteredByRole(_, res, next) {
    try {
      const data = await userService.getFilteredByRole();

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserWithBalance(req, res, next) {
    try {
      const data = await userService.getWithBalance(req.query);

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransfers(req, res, next) {
    const { params, query } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");

      const data = await userService.getUserTransfers({ userId: id, query });

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async changePasswordUser(req, res, next) {
    try {
      await userService.changeUserPassword(req.body);

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserIncomeAndExpenditure(req, res, next) {
    const { params, query } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");

      const data = await userService.getUserIncomeExpenditure({ id, query });

      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOnlyNames(req, res, next) {
    let {
      query: { key },
    } = req;

    key = typeof key === "string" ? key.trim() : null;

    try {
      const data = await userService.getNames(key);

      res.status(200).json({
        status: "successs",
        data,
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

  async getUserIncomeAndExpenditureExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

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

      const transferWhere = {
        isActive: true,
        OR: [{ createdById: id }, { recipientUserId: id }],
        ...(object && {
          OR: [{ toObjectId: object }, { fromObjectId: object }],
        }),
      };

      const transactionWhere = {
        isActive: true,
        createdById: id,
        usedFromOrganizationBalance: false,
        ...(object && { objectId: object }),
      };

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

      const [receivedTransfers, sentTransfers, incomeTransactions, expenseTransactions] = await Promise.all([
        prisma.fundTransfer.aggregate({
          where: {
            ...transferWhere,
            recipientUserId: id,
          },
          _sum: {
            amount: true,
          },
        }),
        prisma.fundTransfer.aggregate({
          where: {
            ...transferWhere,
            createdById: id,
          },
          _sum: {
            amount: true,
          },
        }),
        prisma.transaction.aggregate({
          where: {
            ...transactionWhere,
            type: TransactionType.INCOME,
          },
          _sum: {
            amount: true,
          },
        }),
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

      const amountReceived = (receivedTransfers._sum?.amount || 0n) + (incomeTransactions._sum?.amount || 0n);
      const amountSpent = (sentTransfers._sum?.amount || 0n) + (expenseTransactions._sum?.amount || 0n);
      const remainingAmount = amountReceived - amountSpent;

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

        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Yuboruvchi

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
      }

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

      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();

      let fileName = fullName || "income-expenditure";
      if (object && objectName) {
        fileName = `${fileName}_${objectName}`;
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
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
};

module.exports = userController;
