const { TransactionType, Unit, Role } = require("../generated/prisma");
const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { fromMinorUnits } = require("../utils/amount");
const txnService = require("../services/txn.service");
const getWeekRange = require("../utils/getWeekRange");
const fileService = require("../services/file.service");
const { deleteFilesFromS3 } = require("../utils/s3");

const allowedColumnKeys = ["purpose", "type", "notes", "amount", "object", "date", "createdAt", "updatedAt"];

const transactionController = {
  async createOne(req, res, next) {
    try {
      const {
        body: { notes, amount, date, purpose, items, object_id: objectId, organization_id: organizationId, organization_balance: isFromOrganizationBalance, branchId, executedById },
        user: { id: createdById, role },
      } = req;

      const txn = await txnService.create({
        amount,
        objectId,
        organizationId,
        isFromOrganizationBalance,
        branchId,
        createdById,
        executedById,
        purpose: purpose || "",
        date,
        notes: notes || "",
        items: items || [],
        role,
      });

      if (req.files) {
        req.transactionId = txn.id;
        return next();
      } else {
        return res.status(201).json({ status: "success" });
      }
    } catch (error) {
      if (req.files) await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },

  async uploadTransactionAttachment(req, res, next) {
    try {
      const uploadedFiles = req.uploadedFiles;

      const newAttachmentsData = uploadedFiles.map((u) => ({
        ...u,
        transactionId: req.transactionId,
        createdById: req.user.id,
      }));
      if (!newAttachmentsData.length) throw new AppError(400, "files_didnt_upload");

      await prisma.attachment.createMany({ data: newAttachmentsData });

      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async incomeToObject(req, res, next) {
    try {
      const {
        body: { amount, notes, date, purpose, object_id: objectId },
        user: { id: createdById, role },
      } = req;

      await txnService.createIncomeToObject({
        amount,
        date,
        notes: notes || "",
        purpose: purpose || "",
        objectId,
        createdById,
        role,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let { page, limit, sort, reverse, type, date, start, end, object, branch, createdBy, isReviewed, organization, key } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(page) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(limit) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      type = Object.values(TransactionType).includes(type) ? type : null;
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";
      object = !Number.isNaN(Number(object)) && Number(object) > 0 && Number.isInteger(Number(object)) ? Number(object) : null;
      branch = !Number.isNaN(Number(branch)) && Number(branch) > 0 && Number.isInteger(Number(branch)) ? Number(branch) : null;
      createdBy = !Number.isNaN(Number(createdBy)) && Number(createdBy) > 0 && Number.isInteger(Number(createdBy)) ? Number(createdBy) : null;
      organization = !Number.isNaN(Number(organization)) && Number(organization) > 0 && Number.isInteger(Number(organization)) ? Number(organization) : null;
      isReviewed = ["true", "false"].includes(isReviewed) ? isReviewed === "true" : null;
      start = !Number.isNaN(new Date(start).getTime()) ? new Date(start) : null;
      end = !Number.isNaN(new Date(end).getTime()) ? new Date(end) : null;

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            start = new Date(new Date().setHours(0, 0, 0, 0));
            end = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            start = startOfWeek;
            end = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            start = new Date(startOfMonth);
            end = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            start = new Date(startOfYear);
            end = new Date(endOfYear);
            break;
        }
      }

      const isExistscreatedBy = createdBy
        ? (
            await prisma.user.findUnique({
              where: { id: createdBy },
              select: { isActive: true },
            })
          )?.isActive || null
        : null;

      const isExistsObject = object
        ? (
            await prisma.object.findUnique({
              where: { id: object },
              select: { isActive: true },
            })
          )?.isActive || null
        : null;

      const isExistsBranch = branch
        ? (
            await prisma.branch.findUnique({
              where: { id: branch },
              select: { isActive: true },
            })
          )?.isActive || null
        : null;

      const organizationExists = organization
        ? (
            await prisma.organization.findUnique({
              where: { id: organization },
              select: { isActive: true },
            })
          )?.isActive || null
        : null;

      const findWhere = {
        isActive: true,
        ...(key && { OR: [{ purpose: { contains: key, mode: "insensitive" } }, { notes: { contains: key, mode: "insensitive" } }] }),
        ...(type && { type }),
        ...(typeof isReviewed === "boolean" && { isReviewed }),
        ...(isExistscreatedBy && { createdById: createdBy }),
        ...(isExistsObject && { objectId: object }),
        ...(isExistsBranch && { branchId: branch }),
        ...(organizationExists && { organizationId: organization }),
        ...((start || end) && {
          date: {
            ...(start && { gte: new Date(start) }),
            ...(end && { lte: new Date(end) }),
          },
        }),
      };

      const count = await prisma.transaction.count({
        where: findWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = totalPage === 0 ? 1 : page > totalPage ? totalPage : page;

      const [transactions, sums, groupByReviewed] = await Promise.all([
        prisma.transaction.findMany({
          where: findWhere,
          orderBy:
            sort === "object"
              ? {
                  object: { name: reverse ? "desc" : "asc" },
                }
              : { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            amount: true,
            type: true,
            date: true,
            notes: true,
            purpose: true,
            isReviewed: true,
            isSalary: true,
            usedFromOrganizationBalance: true,
            object: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            branch: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                avatar: true,
                role: true,
              },
            },
            organization: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            attachments: {
              where: { isActive: true },
              select: {
                url: true,
                mimeType: true,
                filesize: true,
                filename: true,
                originalname: true,
              },
            },
            _count: {
              select: {
                items: {
                  where: { isActive: true },
                },
              },
            },
            createdAt: true,
          },
        }),
        prisma.transaction.groupBy({
          by: ["type"],
          _sum: { amount: true },
          _count: true,
          where: { isActive: true },
        }),
        prisma.transaction.groupBy({
          by: ["isReviewed"],
          _count: true,
          where: { isActive: true },
        }),
      ]);

      const isReviewedCount = groupByReviewed.find((g) => !!g.isReviewed)?._count || 0;
      const isNotReviewedCount = groupByReviewed.find((g) => !g.isReviewed)?._count || 0;
      const totalIncome = sums.find((s) => s.type === "INCOME")?._sum.amount ?? 0n;
      const totalExpense = sums.find((s) => s.type === "EXPENSE")?._sum.amount ?? 0n;
      const remaining = totalIncome - totalExpense;

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalPage,
        reverse,
        totals: {
          totalCount: sums.reduce((sum, s) => sum + s._count, 0) || 0,
          remaining,
          totalIncome,
          totalExpense,
          isReviewedCount,
          isNotReviewedCount,
        },
        data: transactions,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      let { sort, reverse, type, date, start, end, object, createdBy, isReviewed, organization } = req.query;

      reverse = reverse !== "false";
      type = Object.values(TransactionType).includes(type) ? type : null;
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";
      object = !Number.isNaN(Number(object)) && Number(object) > 0 && Number.isInteger(Number(object)) ? Number(object) : null;
      createdBy = !Number.isNaN(Number(createdBy)) && Number(createdBy) > 0 && Number.isInteger(Number(createdBy)) ? Number(createdBy) : null;
      organization = !Number.isNaN(Number(organization)) && Number(organization) > 0 && Number.isInteger(Number(organization)) ? Number(organization) : null;
      isReviewed = ["true", "false"].includes(isReviewed) ? isReviewed !== "false" : null;
      start = !Number.isNaN(Date.parse(start)) ? new Date(start) : null;
      end = !Number.isNaN(Date.parse(end)) ? new Date(end) : null;

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            start = new Date(new Date().setHours(0, 0, 0, 0));
            end = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            start = startOfWeek;
            end = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            start = new Date(startOfMonth);
            end = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            start = new Date(startOfYear);
            end = new Date(endOfYear);
            break;
        }
      }

      const isExistscreatedBy = createdBy ? (await prisma.user.findUnique({ where: { id: createdBy }, select: { isActive: true } }))?.isActive || null : null;
      const isExistsObject = object ? (await prisma.object.findUnique({ where: { id: object }, select: { isActive: true } }))?.isActive || null : null;
      const organizationExists = organization ? (await prisma.organization.findUnique({ where: { id: organization }, select: { isActive: true } }))?.isActive || null : null;

      const [transactions, sums, groupByReviewed] = await Promise.all([
        prisma.transaction.findMany({
          where: {
            isActive: true,
            ...(typeof isReviewed === "boolean" && { isReviewed }),
            ...(type && { type }),
            ...(date && { createdAt: { gte: new Date(start), lte: new Date(end) } }),
            ...(isExistscreatedBy && { createdById: createdBy }),
            ...(isExistsObject && { objectId: object }),
            ...(organizationExists && { organizationId: organization }),
          },
          orderBy: sort === "object" ? { object: { name: reverse ? "desc" : "asc" } } : { [sort]: reverse ? "desc" : "asc" },
          select: {
            amount: true,
            type: true,
            date: true,
            notes: true,
            purpose: true,
            isReviewed: true,
            isSalary: true,
            usedFromOrganizationBalance: true,
            object: { where: { isActive: true }, select: { name: true } },
            createdBy: { where: { isActive: true }, select: { fname: true, lname: true } },
            organization: { where: { isActive: true }, select: { organizationName: true } },
            createdAt: true,
          },
        }),
        prisma.transaction.groupBy({ by: ["type"], _sum: { amount: true }, _count: true, where: { isActive: true } }),
        prisma.transaction.groupBy({ by: ["isReviewed"], _count: true, where: { isActive: true } }),
      ]);

      const isReviewedCount = groupByReviewed.find((g) => !!g.isReviewed)?._count || 0;
      const isNotReviewedCount = groupByReviewed.find((g) => !g.isReviewed)?._count || 0;
      const totalIncome = sums.find((s) => s.type === "INCOME")?._sum.amount ?? 0n;
      const totalExpense = sums.find((s) => s.type === "EXPENSE")?._sum.amount ?? 0n;
      const remaining = totalIncome - totalExpense;

      const totals = {
        totalCount: sums.reduce((sum, s) => sum + s._count, 0) || 0,
        remaining: fromMinorUnits(remaining),
        totalIncome: fromMinorUnits(totalIncome),
        totalExpense: fromMinorUnits(totalExpense),
        isReviewedCount,
        isNotReviewedCount,
      };

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transactions");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.2;
      const MIN_ROW_HEIGHT = 25;
      const NOTES_MAX_WIDTH = 40;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          // Taxminiy hisoblash - har bir belgi ~1.2 unit
          const effectiveWidth = Math.floor(columnWidth * (text === "purpose" || text === "object" || text === "organization" ? 1.25 : 1.2));
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10); // +10 padding uchun
      };

      // Transaction type bo'yicha stil
      const getTypeStyle = (txnType) => {
        const styles = {
          [TransactionType.INCOME]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" }, // Yashil - kirim
          [TransactionType.EXPENSE]: { bgColor: "FFFFCDD2", fontColor: "FFC62828" }, // Qizil - chiqim
        };
        return styles[txnType] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getTypeUz = (txnType) => {
        const types = {
          [TransactionType.INCOME]: "Кирим",
          [TransactionType.EXPENSE]: "Чиқим",
        };
        return types[txnType] || "";
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

      const formatNumber = (num) => {
        return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", wrapText: false },
        { header: "Сана", key: "date", wrapText: false },
        { header: "Тури", key: "type", wrapText: false },
        { header: "Мақсад", key: "purpose", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Изоҳ", key: "notes", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        {
          header: "Сумма",
          key: "amount",
          wrapText: false,
          style: { numFmt: "#,##0.00" },
        },
        { header: "Обект", key: "object", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Ташкилот", key: "organization", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Яратувчи", key: "createdBy", wrapText: true, minWidth: 23 },
        { header: "Текширилган", key: "isReviewed", wrapText: false },
        { header: "Ойлик", key: "isSalary", wrapText: false },
        { header: "Таш. балансидан", key: "usedFromOrgBalance", wrapText: false },
      ];

      sheet.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        style: c.style,
      }));

      // Max uzunliklar
      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = transactions.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const data = {
          number: String(index + 1),
          date: formatDate(t.date || t.createdAt),
          type: getTypeUz(t.type),
          purpose: t.purpose || "",
          notes: t.notes || "",
          amount: formatAmount(t.amount),
          object: t.object?.name || "",
          organization: t.organization?.organizationName || "",
          createdBy: createdByName,
          isReviewed: t.isReviewed ? "Ҳа" : "Йўқ",
          isSalary: t.isSalary ? "Ҳа" : "Йўқ",
          usedFromOrgBalance: t.usedFromOrganizationBalance ? "Ҳа" : "Йўқ",
          _type: t.type, // Stil uchun
        };

        // Max uzunliklarni yangilash
        columns.forEach((col, idx) => {
          if (col.maxWidth) return;

          const len = col.key === "amount" ? String(data[col.key]).length + 5 : String(data[col.key]).length;
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
          width = col.maxWidth;
        } else {
          width = maxLengths[idx] + 6;
          width = Math.max(width, 10);
        }

        sheet.getColumn(idx + 1).width = width;
      });

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const typeStyle = getTypeStyle(data._type);
        const { _type, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: typeStyle.bgColor },
          };
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
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Sana
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Turi
        row.getCell(3).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Maqsad
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Izoh
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" }; // Summa
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };
        row.getCell(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(8).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Tashkilot
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Yaratuvchi
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Tekshirilgan
        row.getCell(11).alignment = { horizontal: "center", vertical: "middle" }; // Oylik
        row.getCell(12).alignment = { horizontal: "center", vertical: "middle" }; // Tash. balansidan
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;
      sheet.mergeCells(`A${summaryRowNumber}:E${summaryRowNumber}`);

      const summaryRow = sheet.getRow(summaryRowNumber);
      summaryRow.getCell(1).value = "ЖАМИ:";
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      // Kirim
      const incomeRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:E${summaryRowNumber + 1}`);
      incomeRow.getCell(1).value = "Умумий кирим:";
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(6).value = formatNumber(totals.totalIncome);
      incomeRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      incomeRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Chiqim
      const expenseRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:E${summaryRowNumber + 2}`);
      expenseRow.getCell(1).value = "Умумий чиқим:";
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(6).value = formatNumber(totals.totalExpense);
      expenseRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      expenseRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Qoldiq
      const remainingRow = sheet.getRow(summaryRowNumber + 3);
      sheet.mergeCells(`A${summaryRowNumber + 3}:E${summaryRowNumber + 3}`);
      remainingRow.getCell(1).value = "Қолдиқ:";
      remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      remainingRow.getCell(1).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      remainingRow.getCell(6).value = formatNumber(totals.remaining);
      remainingRow.getCell(6).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: totals.remaining >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      remainingRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { purpose, date, notes, amount, branchId, executedById } = req.body;

      const objectId = req.body.object_id || null;
      const organizationId = req.body.organization_id || null;
      const usedFromOrganizationBalance = typeof req.body.organization_balance === "boolean" ? req.body.organization_balance : false;

      await txnService.update({
        id,
        purpose,
        date,
        amount,
        objectId,
        branchId,
        executedById,
        organizationId,
        usedFromOrganizationBalance,
        notes: notes || "",
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async addItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const {
        body: { name, parameter, quantity, pricePerUnit, unit, inventoryId },
        user: { id: createdById },
      } = req;

      await txnService.addItem({ transactionId: id, inventoryId, name, parameter, quantity, pricePerUnit, unit, createdById });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateTxnItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { name, parameter, quantity, pricePerUnit, unit, inventoryId } = req.body;

      await txnService.updateItem({
        itemId: id,
        name,
        parameter,
        quantity,
        pricePerUnit,
        unit,
        inventoryId,
        userId: req.user.id,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteTxnItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { id: deletedById } = req.user;
      await txnService.deleteItem({ itemId: id, deletedById });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { id: deletedById, role } = req.user;

      await txnService.delete({ id, deletedById, role });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { page, limit, sort, reverse, type, date, start, end, object, createdBy, isReviewed, organization, key } = req.query;

      page = !Number.isNaN(page) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(limit) && Number(limit) > 0 ? Number(limit) : 30;
      reverse = reverse !== "false";
      type = Object.values(TransactionType).includes(type) ? type : "ALL";
      date = ["TODAY", "WEEK", "MONTH", "YEAR"].includes(date) ? date : "ALL";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";
      object = !Number.isNaN(Number(object)) && Number(object) > 0 ? Number(object) : "ALL";
      createdBy = !Number.isNaN(Number(createdBy) && Number(createdBy) > 0) ? Number(createdBy) : "ALL";
      organization = !Number.isNaN(Number(organization)) && Number(organization) > 0 ? Number(organization) : "ALL";
      isReviewed = isReviewed !== "false" && isReviewed !== "true" ? "ALL" : isReviewed !== "false";
      start = !Number.isNaN(new Date(start).getTime()) ? new Date(start) : null;
      end = !Number.isNaN(new Date(end).getTime()) ? new Date(end) : null;

      if (date !== "ALL" && ["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            start = new Date(new Date().setHours(0, 0, 0, 0));
            end = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            start = startOfWeek;
            end = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            start = new Date(startOfMonth);
            end = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            start = new Date(startOfYear);
            end = new Date(endOfYear);
            break;
        }
      }

      const isExistscreatedBy = createdBy !== "ALL" ? (await prisma.user.findUnique({ where: { id: createdBy }, select: { isActive: true } }))?.isActive || null : null;
      const isExistsObject = object !== "ALL" ? (await prisma.object.findUnique({ where: { id: object }, select: { isActive: true } }))?.isActive || null : null;
      const organizationExists = organization !== "ALL" ? (await prisma.organization.findUnique({ where: { id: organization }, select: { isActive: true } }))?.isActive || null : null;

      const findWhere = {
        isActive: false,
        ...(key ? { OR: [{ purpose: { contains: key, mode: "insensitive" } }, { notes: { contains: key, mode: "insensitive" } }] } : {}),
        ...(isReviewed !== "ALL" ? { isReviewed } : {}),
        ...(type !== "ALL" ? { type } : {}),
        ...(date !== "ALL" ? { createdAt: { gte: new Date(start), lte: new Date(end) } } : {}),
        ...(isExistscreatedBy ? { createdById: createdBy } : {}),
        ...(isExistsObject ? { objectId: object } : {}),
        ...(organizationExists ? { organizationId: organization } : {}),
      };

      const count = await prisma.transaction.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = totalPage === 0 ? 1 : page > totalPage ? totalPage : page;

      const [transactions, grouped] = await Promise.all([
        prisma.transaction.findMany({
          where: findWhere,
          orderBy: sort === "object" ? { object: { name: reverse === true ? "desc" : "asc" } } : { [sort]: reverse === true ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            amount: true,
            type: true,
            date: true,
            notes: true,
            purpose: true,
            isReviewed: true,
            isSalary: true,
            usedFromOrganizationBalance: true,
            object: { where: { isActive: true }, select: { id: true, name: true } },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
              },
            },
            organization: { where: { isActive: true }, select: { id: true, organizationName: true } },
            attachments: {
              where: { isActive: true },
              select: {
                url: true,
                mimeType: true,
                filesize: true,
                filename: true,
                originalname: true,
              },
            },
            _count: { select: { items: { where: { isActive: true } } } },
            deletedBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
              },
            },
            createdAt: true,
            deletedAt: true,
          },
        }),
        prisma.transaction.groupBy({ by: ["type"], _count: true, where: { isActive: false } }),
      ]);

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalPage,
        reverse,
        totals: {
          totalCount: grouped.reduce((sum, g) => sum + (g?._count || 0), 0),
          countIncomes: grouped.find((g) => g.type === TransactionType.INCOME)?._count || 0,
          countExpenses: grouped.find((g) => g.type === TransactionType.EXPENSE)?._count || 0,
        },
        data: transactions,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransactions(req, res, next) {
    try {
      let { page, limit, sort, reverse, type, date, start, end, object, branch, isReviewed, organization, key } = req.query;

      page = !isNaN(page) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !isNaN(limit) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "false" ? false : true;
      type = Object.values(TransactionType).includes(type) ? type : null;
      date = ["TODAY", "WEEK", "MONTH", "YEAR"].includes(date) ? date : null;
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";
      object = !isNaN(Number(object)) && Number(object) > 0 && Number.isInteger(Number(object)) ? Number(object) : null;
      branch = !isNaN(Number(branch)) && Number(branch) > 0 && Number.isInteger(Number(branch)) ? Number(branch) : null;
      organization = !isNaN(Number(organization)) && Number(organization) > 0 && Number.isInteger(Number(object)) ? Number(organization) : null;
      isReviewed = ["true", "false"].includes(isReviewed) ? isReviewed === "true" : null;
      start = !Number.isNaN(Date.parse(start)) ? new Date(start) : null;
      end = !Number.isNaN(Date.parse(end)) ? new Date(end) : null;

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            start = new Date(new Date().setHours(0, 0, 0, 0));
            end = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            start = startOfWeek;
            end = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            start = new Date(startOfMonth);
            end = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            start = new Date(startOfYear);
            end = new Date(endOfYear);
            break;
        }
      }

      const isExistsObject =
        object &&
        (
          await prisma.object.findUnique({
            where: { id: object },
            select: { isActive: true },
          })
        )?.isActive;

      const isExistsBranch =
        branch &&
        (
          await prisma.branch.findUnique({
            where: { id: branch },
            select: { isActive: true },
          })
        )?.isActive;

      const organizationExists =
        organization &&
        (
          await prisma.organization.findUnique({
            where: { id: organization },
            select: { isActive: true },
          })
        )?.isActive;

      const findWhere = {
        isActive: true,
        createdById: req.user.id,
        ...(key && { OR: [{ purpose: { contains: key, mode: "insensitive" } }, { notes: { contains: key, mode: "insensitive" } }] }),
        ...(isReviewed !== null && { isReviewed }),
        ...(type && { type }),
        ...((start || end) && { date: { ...(start && { gte: new Date(start) }), ...(end && { lte: new Date(end) }) } }),
        ...(isExistsObject && { objectId: object }),
        ...(isExistsBranch && { branchId: branch }),
        ...(organizationExists && { organizationId: organization }),
      };

      const count = await prisma.transaction.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = totalPage === 0 ? 1 : page > totalPage ? totalPage : page;

      const [transactions, sums, groupByReviewed] = await Promise.all([
        prisma.transaction.findMany({
          where: findWhere,
          orderBy: sort === "object" ? { object: { name: reverse === true ? "desc" : "asc" } } : { [sort]: reverse === true ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            amount: true,
            type: true,
            date: true,
            notes: true,
            purpose: true,
            isReviewed: true,
            isSalary: true,
            usedFromOrganizationBalance: true,
            object: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            branch: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                avatar: true,
                role: true,
              },
            },
            organization: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            attachments: {
              where: { isActive: true },
              select: {
                url: true,
                mimeType: true,
                filesize: true,
                filename: true,
                originalname: true,
              },
            },
            _count: {
              select: {
                items: {
                  where: { isActive: true },
                },
              },
            },
            createdAt: true,
          },
        }),
        prisma.transaction.groupBy({
          by: ["type"],
          _sum: { amount: true },
          _count: true,
          where: { isActive: true, createdById: req.user.id },
        }),
        prisma.transaction.groupBy({
          by: ["isReviewed"],
          _count: true,
          where: { isActive: true, createdById: req.user.id },
        }),
      ]);

      const isReviewedCount = groupByReviewed.find((g) => !!g.isReviewed)?._count || 0;
      const isNotReviewedCount = groupByReviewed.find((g) => !g.isReviewed)?._count || 0;
      const totalIncome = sums.find((s) => s.type === TransactionType.INCOME)?._sum.amount ?? 0n;
      const totalExpense = sums.find((s) => s.type === TransactionType.EXPENSE)?._sum.amount ?? 0n;
      const remaining = totalIncome - totalExpense;

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalPage,
        reverse,
        totals: {
          totalCount: sums.reduce((sum, s) => sum + s._count, 0) || 0,
          remaining,
          totalIncome,
          totalExpense,
          isReviewedCount,
          isNotReviewedCount,
        },
        data: transactions,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransactionsExcelDoc(req, res, next) {
    try {
      let { sort, reverse, type, date, start, end, object, isReviewed, organization } = req.query;

      reverse = reverse === "false" ? false : true;
      type = typeof type === "string" && Object.values(TransactionType).includes(type.trim()) ? type.trim() : "ALL";
      date = typeof date === "string" && ["TODAY", "WEEK", "MONTH", "YEAR"].includes(date.trim()) ? date.trim() : "ALL";
      sort = typeof sort === "string" && allowedColumnKeys.includes(sort.trim()) ? sort.trim() : "createdAt";
      object = !isNaN(Number(object)) && Number(object) > 0 ? Number(object) : "ALL";
      organization = !isNaN(Number(organization)) && Number(organization) > 0 ? Number(organization) : "ALL";
      isReviewed = isReviewed !== "false" && isReviewed !== "true" ? "ALL" : isReviewed !== "false";
      start = typeof start === "string" && !isNaN(new Date(start.trim()).getTime()) ? new Date(start.trim()) : null;
      end = typeof end === "string" && !isNaN(new Date(end.trim()).getTime()) ? new Date(end.trim()) : null;

      if (date !== "ALL" && ["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            start = new Date(new Date().setHours(0, 0, 0, 0));
            end = new Date(new Date().setHours(23, 59, 59, 999));
            break;

          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            start = startOfWeek;
            end = endOfWeek;
            break;

          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            start = new Date(startOfMonth);
            end = new Date(endOfMonth);
            break;

          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            start = new Date(startOfYear);
            end = new Date(endOfYear);
            break;
        }
      }

      const isExistsObject = object !== "ALL" ? (await prisma.object.findUnique({ where: { id: object }, select: { isActive: true } }))?.isActive || null : null;
      const organizationExists = organization !== "ALL" ? (await prisma.organization.findUnique({ where: { id: organization }, select: { isActive: true } }))?.isActive || null : null;

      const [transactions, sums, groupByReviewed] = await Promise.all([
        prisma.transaction.findMany({
          where: {
            isActive: true,
            createdById: req.user.id,
            ...(isReviewed !== "ALL" && { isReviewed }),
            ...(type !== "ALL" && { type }),
            ...(date !== "ALL" && { createdAt: { gte: new Date(start), lte: new Date(end) } }),
            ...(isExistsObject && { objectId: object }),
            ...(organizationExists && { organizationId: organization }),
          },
          orderBy: sort === "object" ? { object: { name: reverse ? "desc" : "asc" } } : { [sort]: reverse ? "desc" : "asc" },
          select: {
            amount: true,
            type: true,
            date: true,
            notes: true,
            purpose: true,
            isReviewed: true,
            isSalary: true,
            usedFromOrganizationBalance: true,
            object: {
              where: { isActive: true },
              select: { name: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            organization: {
              where: { isActive: true },
              select: { organizationName: true },
            },
            createdAt: true,
          },
        }),
        prisma.transaction.groupBy({
          by: ["type"],
          _sum: { amount: true },
          _count: true,
          where: { isActive: true, createdById: req.user.id },
        }),
        prisma.transaction.groupBy({
          by: ["isReviewed"],
          _count: true,
          where: { isActive: true, createdById: req.user.id },
        }),
      ]);

      const isReviewedCount = groupByReviewed.find((g) => !!g.isReviewed)?._count || 0;
      const isNotReviewedCount = groupByReviewed.find((g) => !g.isReviewed)?._count || 0;
      const totalIncome = sums.find((s) => s.type === "INCOME")?._sum.amount ?? 0n;
      const totalExpense = sums.find((s) => s.type === "EXPENSE")?._sum.amount ?? 0n;
      const remaining = totalIncome - totalExpense;

      const totals = {
        totalCount: sums.reduce((sum, s) => sum + s._count, 0) || 0,
        remaining: Number(remaining) !== 0 ? Number(remaining) / 100 : 0,
        totalIncome: Number(totalIncome) !== 0 ? Number(totalIncome) / 100 : 0,
        totalExpense: Number(totalExpense) !== 0 ? Number(totalExpense) / 100 : 0,
        isReviewedCount,
        isNotReviewedCount,
      };
      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transactions");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.2;
      const MIN_ROW_HEIGHT = 25;
      const NOTES_MAX_WIDTH = 40;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          // Taxminiy hisoblash - har bir belgi ~1.2 unit
          const effectiveWidth = Math.floor(columnWidth * (text === "purpose" || text === "object" || text === "organization" ? 1.25 : 1.2));
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10); // +10 padding uchun
      };

      // Transaction type bo'yicha stil
      const getTypeStyle = (txnType) => {
        const styles = {
          [TransactionType.INCOME]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" }, // Yashil - kirim
          [TransactionType.EXPENSE]: { bgColor: "FFFFCDD2", fontColor: "FFC62828" }, // Qizil - chiqim
        };
        return styles[txnType] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getTypeUz = (txnType) => {
        const types = {
          [TransactionType.INCOME]: "Кирим",
          [TransactionType.EXPENSE]: "Чиқим",
        };
        return types[txnType] || "";
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

      const formatNumber = (num) => {
        return Number(num).toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", wrapText: false },
        { header: "Сана", key: "date", wrapText: false },
        { header: "Тури", key: "type", wrapText: false },
        { header: "Мақсад", key: "purpose", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Изоҳ", key: "notes", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        {
          header: "Сумма",
          key: "amount",
          wrapText: false,
          style: { numFmt: "#,##0.00" },
        },
        { header: "Обект", key: "object", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Ташкилот", key: "organization", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Яратувчи", key: "createdBy", wrapText: true, minWidth: 23 },
        { header: "Текширилган", key: "isReviewed", wrapText: false },
        { header: "Ойлик", key: "isSalary", wrapText: false },
        { header: "Таш. балансидан", key: "usedFromOrgBalance", wrapText: false },
      ];

      sheet.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        style: c.style,
      }));

      // Max uzunliklar
      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = transactions.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const data = {
          number: String(index + 1),
          date: formatDate(t.date || t.createdAt),
          type: getTypeUz(t.type),
          purpose: t.purpose || "",
          notes: t.notes || "",
          amount: formatAmount(t.amount),
          object: t.object?.name || "",
          organization: t.organization?.organizationName || "",
          createdBy: createdByName,
          isReviewed: t.isReviewed ? "Ҳа" : "Йўқ",
          isSalary: t.isSalary ? "Ҳа" : "Йўқ",
          usedFromOrgBalance: t.usedFromOrganizationBalance ? "Ҳа" : "Йўқ",
          _type: t.type, // Stil uchun
        };

        // Max uzunliklarni yangilash
        columns.forEach((col, idx) => {
          if (col.maxWidth) return;

          const len = col.key === "amount" ? String(data[col.key]).length + 5 : String(data[col.key]).length;
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
          width = col.maxWidth;
        } else {
          width = maxLengths[idx] + 6;
          width = Math.max(width, 10);
        }

        sheet.getColumn(idx + 1).width = width;
      });

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const typeStyle = getTypeStyle(data._type);
        const { _type, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: typeStyle.bgColor },
          };
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
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Sana
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Turi
        row.getCell(3).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Maqsad
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Izoh
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" }; // Summa
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };
        row.getCell(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(8).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Tashkilot
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Yaratuvchi
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Tekshirilgan
        row.getCell(11).alignment = { horizontal: "center", vertical: "middle" }; // Oylik
        row.getCell(12).alignment = { horizontal: "center", vertical: "middle" }; // Tash. balansidan
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;
      sheet.mergeCells(`A${summaryRowNumber}:E${summaryRowNumber}`);

      const summaryRow = sheet.getRow(summaryRowNumber);
      summaryRow.getCell(1).value = "ЖАМИ:";
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      // Kirim
      const incomeRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:E${summaryRowNumber + 1}`);
      incomeRow.getCell(1).value = "Умумий кирим:";
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(6).value = formatNumber(totals.totalIncome);
      incomeRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      incomeRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Chiqim
      const expenseRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:E${summaryRowNumber + 2}`);
      expenseRow.getCell(1).value = "Умумий чиқим:";
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(6).value = formatNumber(totals.totalExpense);
      expenseRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      expenseRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Qoldiq
      const remainingRow = sheet.getRow(summaryRowNumber + 3);
      sheet.mergeCells(`A${summaryRowNumber + 3}:E${summaryRowNumber + 3}`);
      remainingRow.getCell(1).value = "Қолдиқ:";
      remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      remainingRow.getCell(1).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      remainingRow.getCell(6).value = formatNumber(totals.remaining);
      remainingRow.getCell(6).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: totals.remaining >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      remainingRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { isActive: false, id },
        select: { id: true },
      });
      if (!txn) throw new AppError(404, "transaction_not_found");

      await txnService.restore({ txn });

      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { id, isActive: false },
        include: { attachments: true },
      });
      if (!txn) throw new AppError(404, "transaction_not_found");

      await prisma.transaction.delete({
        where: { id },
      });
      if (txn.attachments.length) {
        await deleteFilesFromS3(txn.attachments.map((f) => f.filename));
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async toggleReviewed(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { isActive: true, id },
        select: { id: true, isReviewed: true },
      });
      if (!txn) throw new AppError(404, "transaction_not_found");

      await prisma.transaction.update({
        where: { id },
        data: { isReviewed: !txn.isReviewed },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async incomeToSelf(req, res, next) {
    try {
      const {
        body: { amount, notes, purpose },
        user: { id: createdById, role },
      } = req;

      await txnService.createIncomeToUser({
        amount,
        notes,
        purpose,
        createdById,
        role,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTransactionItemsXLSX(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { id, isActive: true },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            where: { isActive: true },
          },
        },
      });
      if (!txn) throw new AppError(404, "transaction_not_found");

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transactions");

      sheet.columns = [
        { header: "№", key: "number" /* width: 8 */ },
        { header: "Номи", key: "name" /* width: 30 */ },
        { header: "Параметри", key: "parameter" /* width: 30 */ },
        { header: "Ўлчов бирлиги", key: "unit" /* width: 18 */ },
        { header: "Сони", key: "quantity" /* width: 12 */ },
        { header: "Бирлик нархи", key: "pricePerUnit" /* width: 18 */ },
        { header: "Умумий нархи", key: "totalPrice" /* width: 20 */ },
      ];

      let totalSum = 0;

      txn.items.forEach((item, index) => {
        let unitUz = null;

        switch (item.unit) {
          case Unit.KG:
            unitUz = "Килограмм";
            break;
          case Unit.M:
            unitUz = "Метр";
            break;
          case Unit.M2:
            unitUz = "Квадрат метр";
            break;
          case Unit.M3:
            unitUz = "Куб метр";
            break;
          case Unit.PCS:
            unitUz = "Дона";
            break;
          case Unit.SET:
            unitUz = "Тўплам";
            break;
          case Unit.TON:
            unitUz = "Тонна";
            break;
          case Unit.L:
            unitUz = "Литр";
            break;
          case Unit.UZS:
            unitUz = "Сўм";
            break;
          case Unit.H:
            unitUz = "Соат";
            break;
          case Unit.DAY:
            unitUz = "Кун";
            break;
          case Unit.WORK_VOLUME:
            unitUz = "Иш ҳажми";
            break;
          case Unit.SERVICE:
            unitUz = "Хизмат";
            break;
          default:
            unitUz = "Дона";
            break;
        }

        const row = sheet.addRow({
          number: index + 1,
          name: item.name,
          parameter: item.parameter,
          unit: unitUz,
          quantity: item.quantity.toString(),
          pricePerUnit: fromMinorUnits(item.pricePerUnit),
          totalPrice: fromMinorUnits(item.totalPrice),
        });

        totalSum += fromMinorUnits(item.totalPrice);

        row.height = 20;

        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).numFmt = "#,##0";

        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).numFmt = "#,##0.00";

        row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(7).numFmt = "#,##0.00";
        row.getCell(7).font = { bold: true };
      });

      const headerRow = sheet.getRow(1);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Arial" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E90FF" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
      });

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
            cell.font = { size: 11, name: "Arial" };
          });
        }
      });

      const lastRow = sheet.addRow([]);
      lastRow.height = 25;
      lastRow.getCell(6).value = "ЖАМИ:";
      lastRow.getCell(6).font = { bold: true, size: 12, name: "Arial" };
      lastRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      lastRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };

      lastRow.getCell(7).value = totalSum;
      lastRow.getCell(7).numFmt = "#,##0.00";
      lastRow.getCell(7).font = { bold: true, size: 12, color: { argb: "FF006400" }, name: "Arial" };
      lastRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
      lastRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };

      lastRow.eachCell((cell, colNumber) => {
        if (colNumber >= 6) {
          cell.border = {
            top: { style: "medium" },
            left: { style: "thin" },
            bottom: { style: "medium" },
            right: { style: "thin" },
          };
        }
      });

      sheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) maxLength = columnLength;
        });
        column.width = maxLength + 4;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTransactionItems(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { isActive: true, id },
        include: {
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          executedBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          attachments: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          organization: {
            where: { isActive: true },
            select: { id: true, organizationName: true, stirNumber: true },
          },
          branch: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          items: {
            orderBy: { createdAt: "asc" },
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              parameter: true,
              quantity: true,
              pricePerUnit: true,
              totalPrice: true,
              unit: true,
              createdAt: true,
              inventoryHistory: {
                where: { isActive: true },
                select: {
                  inventory: {
                    where: { isActive: true },
                    select: {
                      id: true,
                      name: true,
                      parameter: true,
                      unit: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!txn) throw new AppError(404, "transaction_not_found");

      const result = {
        id: txn.id,
        notes: txn.notes,
        amount: txn.amount,
        date: txn.date,
        purpose: txn.purpose,
        isReviewed: txn.isReviewed,
        isSalary: txn.isSalary,
        type: txn.type,
        createdAt: txn.createdAt,
        usedFromOrganizationBalance: txn.usedFromOrganizationBalance,
        object: txn.object,
        branch: txn.branch,
        organization: txn.organization,
        createdBy: txn.createdBy,
        executedBy: txn.executedBy,
        attachments: txn.attachments,
        items: txn.items.map((i) => ({
          id: i.id,
          name: i.name,
          parameter: i.parameter,
          quantity: i.quantity,
          pricePerUnit: i.pricePerUnit,
          totalPrice: i.totalPrice,
          unit: i.unit,
          createdAt: i.createdAt,
          inventoryId: i.inventoryHistory?.inventory?.id || null,
          inventory: i.inventoryHistory?.inventory
            ? {
                id: i.inventoryHistory.inventory.id,
                name: i.inventoryHistory.inventory.name,
                parameter: i.inventoryHistory.inventory.parameter,
                unit: i.inventoryHistory.inventory.unit,
              }
            : null,
        })),
      };

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransactionItems(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { isActive: true, id },
        include: {
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          attachments: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          organization: {
            where: { isActive: true },
            select: { id: true, organizationName: true, stirNumber: true },
          },
          branch: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          items: {
            orderBy: { createdAt: "asc" },
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              parameter: true,
              quantity: true,
              pricePerUnit: true,
              totalPrice: true,
              unit: true,
              createdAt: true,
              inventoryHistory: {
                select: {
                  inventory: {
                    where: { isActive: true },
                    select: {
                      id: true,
                      name: true,
                      parameter: true,
                      unit: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!txn) throw new AppError(404, "transaction_not_found");

      if (req.user.id !== txn.createdById && req.user.role !== Role.SUPERADMIN) throw new AppError(400, "no_access");

      const result = {
        id: txn.id,
        notes: txn.notes,
        amount: txn.amount,
        date: txn.date,
        purpose: txn.purpose,
        isReviewed: txn.isReviewed,
        isSalary: txn.isSalary,
        type: txn.type,
        createdAt: txn.createdAt,
        usedFromOrganizationBalance: txn.usedFromOrganizationBalance,
        object: txn.object,
        branch: txn.branch,
        organization: txn.organization,
        createdBy: txn.createdBy,
        attachments: txn.attachments,
        items: txn.items.map((i) => ({
          id: i.id,
          name: i.name,
          parameter: i.parameter,
          quantity: i.quantity,
          pricePerUnit: i.pricePerUnit,
          totalPrice: i.totalPrice,
          unit: i.unit,
          createdAt: i.createdAt,
          inventory: i.inventoryHistory?.inventory
            ? {
                id: i.inventoryHistory.inventory.id,
                name: i.inventoryHistory.inventory.name,
                parameter: i.inventoryHistory.inventory.parameter,
                unit: i.inventoryHistory.inventory.unit,
              }
            : null,
        })),
      };

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransactionItemsXLSX(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const txn = await prisma.transaction.findFirst({
        where: { id, isActive: true },
        include: { items: true, createdBy: true },
      });
      if (!txn || !txn.isActive) throw new AppError(404, "transaction_not_found");

      if (req.user.id !== txn.createdById && req.user.role !== Role.SUPERADMIN) throw new AppError(400, "no_access");

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transactions");

      sheet.columns = [
        { header: "№", key: "number" /* width: 8 */ },
        { header: "Номи", key: "name" /* width: 30 */ },
        { header: "Параметри", key: "parameter" /* width: 30 */ },
        { header: "Ўлчов бирлиги", key: "unit" /* width: 18 */ },
        { header: "Сони", key: "quantity" /* width: 12 */ },
        { header: "Бирлик нархи", key: "pricePerUnit" /* width: 18 */ },
        { header: "Умумий нархи", key: "totalPrice" /* width: 20 */ },
      ];

      let totalSum = 0;

      txn.items.forEach((item, index) => {
        let unitUz = null;

        switch (item.unit) {
          case Unit.KG:
            unitUz = "Килограмм";
            break;
          case Unit.M:
            unitUz = "Метр";
            break;
          case Unit.M2:
            unitUz = "Квадрат метр";
            break;
          case Unit.M3:
            unitUz = "Куб метр";
            break;
          case Unit.PCS:
            unitUz = "Дона";
            break;
          case Unit.SET:
            unitUz = "Тўплам";
            break;
          case Unit.TON:
            unitUz = "Тонна";
            break;
          default:
            unitUz = "Дона";
            break;
        }
        const row = sheet.addRow({
          number: index + 1,
          name: item.name,
          parameter: item.parameter,
          unit: unitUz,
          quantity: item.quantity.toString(),
          pricePerUnit: fromMinorUnits(item.pricePerUnit),
          totalPrice: fromMinorUnits(item.totalPrice),
        });

        totalSum += fromMinorUnits(item.totalPrice);

        row.height = 20;

        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).numFmt = "#,##0";

        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).numFmt = "#,##0.00";

        row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(7).numFmt = "#,##0.00";
        row.getCell(7).font = { bold: true };
      });

      const headerRow = sheet.getRow(1);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Arial" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E90FF" },
        };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
            cell.font = { size: 11, name: "Arial" };
          });
        }
      });

      const lastRow = sheet.addRow([]);
      lastRow.height = 25;
      lastRow.getCell(6).value = "ЖАМИ:";
      lastRow.getCell(6).font = { bold: true, size: 12, name: "Arial" };
      lastRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      lastRow.getCell(6).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };

      lastRow.getCell(7).value = totalSum;
      lastRow.getCell(7).numFmt = "#,##0.00";
      lastRow.getCell(7).font = { bold: true, size: 12, color: { argb: "FF006400" }, name: "Arial" };
      lastRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
      lastRow.getCell(7).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };

      lastRow.eachCell((cell, colNumber) => {
        if (colNumber >= 6) {
          cell.border = {
            top: { style: "medium" },
            left: { style: "thin" },
            bottom: { style: "medium" },
            right: { style: "thin" },
          };
        }
      });

      sheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = maxLength + 4;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = transactionController;
