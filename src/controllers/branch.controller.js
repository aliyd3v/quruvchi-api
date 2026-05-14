const { InvoiceStatus, EntryType, EntryColor } = require("@prisma/client");
const ExcelJS = require("exceljs");
const prisma = require("../services/prisma");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const getWeekRange = require("../utils/getWeekRange");
const { deleteFilesFromS3 } = require("../utils/s3");

const allowedColumnKeys = ["date", "amount", "contractAmount"];

const branchController = {
  async createOne(req, res, next) {
    try {
      const {
        body: { name, stir },
        user: { id: createdById },
      } = req;

      await prisma.branch.create({
        data: {
          name,
          stir,
          createdById,
        },
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
      let { page, limit, key } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;

      const findWhere = {
        isActive: true,
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { stir: { contains: key, mode: "insensitive" } }] }),
      };

      const count = await prisma.branch.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [branches, totalCount] = await Promise.all([
        prisma.branch.findMany({
          orderBy: { name: "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            createdBy: {
              where: { isActive: true },
              omit: { password: true },
            },
          },
        }),
        prisma.branch.count({
          where: { isActive: true },
        }),
      ]);

      res.status(200).json({
        status: "success",
        data: branches.map((b) => ({
          id: b.id,
          name: b.name,
          stir: b.stir,
          createdAt: b.createdAt,
          createdBy: b.createdBy
            ? {
                id: b.createdBy.id,
                fname: b.createdBy.fname,
                lname: b.createdBy.lname,
                role: b.createdBy.role,
              }
            : null,
        })),
        count,
        totalPage,
        page,
        limit,
        totals: {
          totalCount,
        },
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      const branches = await prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          innStir: true,
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Filiallar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;

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

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Фирма номи", key: "name", minWidth: 30 },
        { header: "Фирма СТИР рақами", key: "innStir", minWidth: 20 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = branches.map((b, index) => {
        const data = {
          number: String(index + 1),
          name: b.name || "-",
          innStir: b.innStir || "-",
          createdAt: formatDate(b.createdAt),
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
        const row = sheet.addRow(data);
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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Firma nomi
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // STIR
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Sana
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

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами филиаллар: ${branches.length} ta`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const branch = await prisma.branch.findFirst({
        where: { id, isActive: true },
      });
      if (!branch) throw new AppError(404, "branch_not_found");

      let { page, limit, sort, start, end, reverse, organization, isCardPayout, type, invoiceStatus, color, date, key } = req.query;

      key = typeof key === "string" ? key.trim() : null;
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      sort = allowedColumnKeys.includes(sort) ? sort : "date";
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

      reverse = reverse !== "false";
      organization = !Number.isNaN(Number(organization)) && Number(organization) && Number.isInteger(Number(organization)) > 0 ? Number(organization) : null;
      isCardPayout = isCardPayout === "true";
      type = Object.values(EntryType).includes(type) ? type : null;
      invoiceStatus = Object.values(InvoiceStatus).includes(invoiceStatus) ? invoiceStatus : null;
      color = Object.values(EntryColor).includes(color) ? color : null;

      const findWhere = {
        isActive: true,
        branchId: id,
        ...(type && { type }),
        ...(organization && { organizationId: organization }),
        ...(isCardPayout && { isCardPayout }),
        ...(invoiceStatus && { invoiceStatus }),
        ...(color && { color }),
        ...((start || end) && {
          date: {
            ...(start && { gte: start }),
            ...(end && { lte: end }),
          },
        }),
        ...(key && {
          OR: [
            { contractNumber: { contains: key, mode: "insensitive" } },
            { innStir: { contains: key, mode: "insensitive" } },
            { lot: { contains: key, mode: "insensitive" } },
            { purpose: { contains: key, mode: "insensitive" } },
            { poaNumber: { contains: key, mode: "insensitive" } },
            { ownerPhone: { contains: key, mode: "insensitive" } },
            { description: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.entry.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const findWhereAggCardPayouts = { ...findWhere, isCardPayout: true };
      const findWhereInvoicesGrouped = { ...findWhere, invoiceStatus: { not: "NO_INVOICE" } };

      const [entries, grouped, aggCardPayouts, invoicesGrouped] = await Promise.all([
        prisma.entry.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            createdBy: {
              omit: { password: true },
            },
            invoiceFiles: true,
            organization: true,
          },
        }),
        prisma.entry.groupBy({
          by: ["type"],
          _sum: { amount: true },
          _count: true,
          where: findWhere,
        }),
        prisma.entry.aggregate({
          where: findWhereAggCardPayouts,
          _count: true,
          _sum: { amount: true },
        }),
        prisma.entry.groupBy({
          by: ["invoiceStatus"],
          _count: true,
          where: findWhereInvoicesGrouped,
        }),
      ]);

      const totals = {
        countIncomes: grouped.find((g) => g.type === "INCOME")?._count || 0,
        countExpenses: grouped.find((g) => g.type === "EXPENSE")?._count || 0,
        amountIncomes: grouped.find((g) => g.type === "INCOME")?._sum.amount || 0,
        amountExpenses: grouped.find((g) => g.type === "EXPENSE")?._sum.amount || 0,
        countCardPayouts: aggCardPayouts._count,
        amountCardPayouts: aggCardPayouts._sum.amount,
        countInvoices: invoicesGrouped.reduce((sum, g) => sum + g._count, 0),
        countNotClosedInvoices: invoicesGrouped.reduce((sum, g) => sum + (g.invoiceStatus !== "CLOSED" ? g._count : 0), 0),
      };

      const result = entries.map((e) => ({
        id: e.id,
        contractNumber: e.contractNumber,
        innStir: e.innStir,
        date: e.date,
        lot: e.lot,
        purpose: e.purpose,
        poaNumber: e.poaNumber,
        color: e.color,
        type: e.type,
        isCardPayout: e.isCardPayout,
        invoiceStatus: e.invoiceStatus,
        description: e.description,
        amount: e.amount,
        ownerPhone: e.ownerPhone,
        contractAmount: e.contractAmount,
        createdBy: {
          id: e.createdBy.id,
          fname: e.createdBy.fname,
          lname: e.createdBy.lname,
          role: e.createdBy.role,
        },
        organization: e.organization ? { id: e.organization.id, organizationName: e.organization.organizationName } : null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));

      res.status(200).json({
        status: "success",
        branch: {
          id: branch.id,
          name: branch.name,
          stir: branch.stir,
        },
        ie: result,
        limit,
        page,
        totalPage,
        totalCount: count,
        totals,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneBranchExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const branch = await prisma.branch.findFirst({
        where: { id, isActive: true },
      });
      if (!branch) throw new AppError(404, "branch_not_found");

      let { sort, start, end, reverse, organization, isCardPayout, type, invoiceStatus, color, date } = req.query;

      sort = allowedColumnKeys.includes(sort) ? sort : "date";
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

      reverse = reverse !== "false";
      organization = !Number.isNaN(Number(organization)) && Number(organization) > 0 && Number.isInteger(Nuber(organization)) ? Number(organization) : null;
      isCardPayout = isCardPayout === "true";
      type = Object.values(EntryType).includes(type) ? type : null;
      invoiceStatus = Object.values(InvoiceStatus).includes(invoiceStatus) ? invoiceStatus : null;
      color = Object.values(EntryColor).includes(color) ? color : null;

      const findWhere = {
        isActive: true,
        branchId: id,
        ...(type && { type }),
        ...(organization && { organizationId: organization }),
        ...(isCardPayout && { isCardPayout }),
        ...(invoiceStatus && { invoiceStatus }),
        ...(color && { color }),
        ...((start || end) && {
          date: {
            ...(start && { gte: start }),
            ...(end && { lte: end }),
          },
        }),
      };

      const [entries, grouped] = await Promise.all([
        prisma.entry.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          where: findWhere,
          select: {
            id: true,
            contractNumber: true,
            contractDate: true,
            innStir: true,
            date: true,
            lot: true,
            purpose: true,
            amount: true,
            contractAmount: true,
            poaNumber: true,
            color: true,
            type: true,
            isCardPayout: true,
            invoiceStatus: true,
            description: true,
            organization: {
              where: { isActive: true },
              select: {
                id: true,
                organizationName: true,
              },
            },
            createdAt: true,
          },
        }),
        prisma.entry.groupBy({
          by: ["type"],
          _sum: { amount: true },
          _count: true,
          where: findWhere,
        }),
      ]);

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(branch.name || "Entries");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 10;
      const MIN_ROW_HEIGHT = 20;
      const MAX_WIDTH = 40;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getColorStyle = (entryColor) => {
        const styles = {
          [EntryColor.PURPLE]: { bgColor: "FFE6D9FF", fontColor: "FF4B0082" }, // och binafsha / indigo
          [EntryColor.PINK]: { bgColor: "FFFFD6E8", fontColor: "FFB0005A" }, // och pushti / to‘q pushti
          [EntryColor.BROWN]: { bgColor: "FFD7CCC8", fontColor: "FF4E342E" }, // och jigarrang / to‘q jigarrang
          [EntryColor.ROSE]: { bgColor: "FFFFE4EC", fontColor: "FFAD1457" }, // rose / to‘q rose
          [EntryColor.TEAL]: { bgColor: "FFD0F0F0", fontColor: "FF006D6F" }, // och teal / to‘q teal
          [EntryColor.GREEN]: { bgColor: "FFB9F6CA", fontColor: "FF1B5E20" }, // och yashil / to‘q yashil
          [EntryColor.ORANGE]: { bgColor: "FFFFE0B2", fontColor: "FFE65100" }, // och apelsin / to‘q apelsin
          [EntryColor.YELLOW]: { bgColor: "FFFFF9C4", fontColor: "FFF57F17" }, // och sariq / to‘q sariq
          [EntryColor.RED]: { bgColor: "FFFFCDD2", fontColor: "FFB71C1C" }, // och qizil / to‘q qizil
          [EntryColor.BLUE]: { bgColor: "FFBBDEFB", fontColor: "FF0D47A1" }, // och ko‘k / to‘q ko‘k
          [EntryColor.DARK]: { bgColor: "FF424242", fontColor: "FFFFFFFF" }, // dark fon / oq text
          [EntryColor.LIGHT]: { bgColor: "FFF5F5F5", fontColor: "FF212121" }, // light fon / to‘q text
        };
        return styles[entryColor] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getInvoiceStatusText = (status) => {
        const statuses = {
          [InvoiceStatus.NO_INVOICE]: "",
          [InvoiceStatus.NOT_CLOSED]: "Ёпилмаган",
          [InvoiceStatus.CLOSED]: "Ёпилган",
          [InvoiceStatus.LATE]: "Ёпилмаган",
        };
        return statuses[status] ?? "";
      };

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "";
        return Number(num) /* .toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatAmount = (amount) => {
        if (!amount) return "";
        const num = Number(amount) / 100;
        return /* formatNumber(num) */ num;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        {
          header: "Ташкилот",
          key: "organization",
          minWidth: 25,
          maxWidth: MAX_WIDTH,
          style: { alignment: { horizontal: "left", vertical: "middle" } },
        },
        {
          header: "Шарт №",
          key: "contractNumber",
          minWidth: 12,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Шарт санаси",
          key: "contractDate",
          minWidth: 12,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Сана",
          key: "date",
          minWidth: 12,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "ИНН",
          key: "innStir",
          minWidth: 12,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Лот",
          key: "lot",
          minWidth: 8,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Кирим максади",
          key: "incomePurpose",
          minWidth: 30,
          maxWidth: MAX_WIDTH,
          wrapText: true,
          style: { alignment: { horizontal: "center", vertical: "middle", wrapText: true } },
        },
        {
          header: "Шартнома суммаси",
          key: "contractAmount",
          minWidth: 18,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
        {
          header: "Кирим суммаси",
          key: "incomeAmount",
          minWidth: 18,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
        {
          header: "Яратилган сана",
          key: "createdAt",
          minWidth: 14,
          style: {
            alignment: { horizontal: "center", vertical: "middle" },
          },
        },
        {
          header: "Чиқим максади",
          key: "expensePurpose",
          minWidth: 30,
          maxWidth: MAX_WIDTH,
          wrapText: true,
          style: { alignment: { horizontal: "center", vertical: "middle", wrapText: true } },
        },
        {
          header: "Дов №",
          key: "poaNumber",
          minWidth: 10,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Чиқим суммаси",
          key: "expenseAmount",
          minWidth: 18,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
        {
          header: "Хужжат холат",
          key: "invoiceStatus",
          minWidth: 12,
          style: {
            alignment: { horizontal: "center", vertical: "middle" },
          },
        },
      ];

      sheet.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.minWidth ? c.minWidth : c.maxWidth,
        style: c.style,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = entries.map((e) => {
        const isIncome = e.type === EntryType.INCOME;

        const data = {
          organization: e.organization?.organizationName || "",
          contractNumber: e.contractNumber || "",
          contractDate: formatDate(e.contractDate),
          date: formatDate(e.date),
          innStir: e.innStir || "",
          lot: e.lot || "",
          incomePurpose: isIncome ? e.purpose || "" : "",
          contractAmount: formatAmount(e.contractAmount),
          incomeAmount: isIncome ? formatAmount(e.amount) : "",
          createdAt: formatDate(e.createdAt),
          expensePurpose: !isIncome ? e.purpose || "" : "",
          poaNumber: e.poaNumber || "",
          expenseAmount: !isIncome ? formatAmount(e.amount) : "",
          invoiceStatus: getInvoiceStatusText(e.invoiceStatus),
          _color: e.color,
          _type: e.type,
          _invoiceStatus: e.invoiceStatus,
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
        const colorStyle = getColorStyle(data._color);
        const { _color, _type, _invoiceStatus, ...cleanData } = data;

        const row = sheet.addRow(cleanData);
        row.height = MIN_ROW_HEIGHT;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: colorStyle.bgColor },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: colorStyle.fontColor } };
          cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
        });

        // Alohida fontlar
        row.getCell(8).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: colorStyle.fontColor } };

        // Invoice status rangi
        if (_invoiceStatus === InvoiceStatus.CLOSED) {
          row.getCell(14).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: /* "FF2E7D32" */ "FFFFFFFF" } };
          row.getCell(14).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2E7D32" },
          };
        } else if (_invoiceStatus === InvoiceStatus.NOT_CLOSED || _invoiceStatus === InvoiceStatus.LATE) {
          row.getCell(14).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: /* "FFC62828" */ "FFFFFFFF" } };
          row.getCell(14).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFC62828" },
          };
        }

        {
          const wrapCols = [1, 7, 11];

          // Helper: get column meta from our columns array (fallbacks)
          const getColMeta = (idx) => {
            const meta = columns[idx - 1] || {};
            return {
              minWidth: meta.minWidth || 10,
              maxWidth: meta.maxWidth || MAX_WIDTH,
            };
          };

          // Ensure sheet columns exist
          wrapCols.forEach((c) => {
            if (!sheet.getColumn(c)) sheet.getColumn(c); // no-op but safe
          });

          // For each target column, set wrap and compute required widths/heights
          let maxRequiredLines = 1; // qator uchun kerak bo'ladigan eng katta satrlar soni

          wrapCols.forEach((colIdx) => {
            const cell = row.getCell(colIdx);
            // 1) enable wrapText and keep existing horizontal/vertical if present
            cell.alignment = {
              ...(cell.alignment || {}),
              wrapText: true,
              horizontal: cell.alignment?.horizontal || (colIdx === 1 ? "left" : "center"),
              vertical: cell.alignment?.vertical || "middle",
            };

            const text = cell.value === null || cell.value === undefined ? "" : String(cell.value);
            const linesRaw = text.split("\n");

            // 2) find longest line length (characters)
            let longest = 0;
            for (const l of linesRaw) {
              const len = l.length;
              if (len > longest) longest = len;
            }

            // 3) determine desired column width (chars).
            // Add padding of +6 chars to avoid very tight wrap. Respect min/max.
            const { minWidth, maxWidth } = getColMeta(colIdx);
            const desiredWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(longest + 6)));

            // 4) set sheet column width if it's smaller than desired (don't shrink if user already set bigger)
            const currentWidth = sheet.getColumn(colIdx).width || maxLengths[colIdx - 1] + 3 || minWidth;
            const finalColWidth = Math.max(currentWidth, desiredWidth);
            sheet.getColumn(colIdx).width = Math.min(finalColWidth, MAX_WIDTH);

            // 5) calculate how many visual lines this cell will take with this column width
            // For each raw line, linesNeeded = ceil(line.length / colWidth)
            const colWidthForCalc = sheet.getColumn(colIdx).width || desiredWidth || minWidth;
            let linesNeeded = 0;
            for (const l of linesRaw) {
              // if empty line still counts as 1
              const ln = l.length;
              const perLine = Math.max(1, Math.ceil(ln / Math.max(1, Math.floor(colWidthForCalc))));
              linesNeeded += perLine;
            }

            if (linesNeeded > maxRequiredLines) maxRequiredLines = linesNeeded;
          });

          // 6) estimate row height from maxRequiredLines
          // FONT_SIZE in points. Use multiplier 1.15 for line spacing and +4 padding.
          const estimatedHeight = Math.ceil(maxRequiredLines * (FONT_SIZE * 1.15) + 4);

          // keep minimal height and don't shrink if earlier code already enlarged it
          row.height = Math.max(row.height || MIN_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, estimatedHeight));
        }
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: FONT_NAME };
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

      const totalIncome = grouped.find((g) => g.type === EntryType.INCOME)?._sum.amount || 0n;
      const totalExpense = grouped.find((g) => g.type === EntryType.EXPENSE)?._sum.amount || 0n;
      const countIncome = grouped.find((g) => g.type === EntryType.INCOME)?._count || 0;
      const countExpense = grouped.find((g) => g.type === EntryType.EXPENSE)?._count || 0;

      // Jami kirim
      const incomeRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:H${summaryRowNumber}`);
      incomeRow.getCell(1).value = `Жами киримлар: ${countIncome} та`;
      incomeRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(9).value = formatNumber(Number(totalIncome) / 100);
      incomeRow.getCell(9).font = { bold: true, size: 11, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      incomeRow.getCell(9).alignment = { horizontal: "right", vertical: "middle" };

      // Jami chiqim
      const expenseRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:L${summaryRowNumber + 1}`);
      expenseRow.getCell(1).value = `Жами чиқимлар: ${countExpense} та`;
      expenseRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(13).value = formatNumber(Number(totalExpense) / 100);
      expenseRow.getCell(13).font = { bold: true, size: 11, name: FONT_NAME, color: { argb: "FFC62828" } };
      expenseRow.getCell(13).alignment = { horizontal: "right", vertical: "middle" };

      // Qoldiq
      const remaining = Number(totalIncome) - Number(totalExpense);
      const remainingRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:H${summaryRowNumber + 2}`);
      remainingRow.getCell(1).value = "Қолдиқ:";
      remainingRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      remainingRow.getCell(9).value = formatNumber(remaining / 100);
      remainingRow.getCell(9).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: remaining >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      remainingRow.getCell(9).alignment = { horizontal: "right", vertical: "middle" };

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

      const branch = await prisma.branch.findFirst({
        where: { id, isActive: true },
      });
      if (!branch) throw new AppError(404, "branch_not_found");

      const { name, stir } = req.body;
      await prisma.branch.update({
        where: { id },
        data: { name, stir },
      });

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

      const branch = await prisma.branch.findFirst({
        where: { id, isActive: true },
      });
      if (!branch) throw new AppError(404, "branch_not_found");

      await prisma.branch.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          deletedById: req.user.id,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { page, limit, key } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;

      const findWhere = {
        isActive: false,
        ...(key && {
          OR: [
            {
              name: {
                contains: key,
                mode: "insencitive",
              },
            },
            { stir: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.branch.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [branches, totalCount] = await Promise.all([
        prisma.branch.findMany({
          orderBy: { name: "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            createdBy: {
              where: { isActive: true },
              omit: { password: true },
            },
            deletedBy: {
              where: { isActive: true },
              omit: { password: true },
            },
          },
        }),
        prisma.branch.count({
          where: { isActive: false },
        }),
      ]);

      res.status(200).json({
        status: "success",
        data: branches.map((b) => ({
          id: b.id,
          name: b.name,
          stir: b.stir,
          createdAt: b.createdAt,
          deletedAt: b.deletedAt,
          createdBy: b.createdBy
            ? {
                id: b.createdBy.id,
                fname: b.createdBy.fname,
                lname: b.createdBy.lname,
                role: b.createdBy.role,
              }
            : null,
          deletedBy: b.deletedBy
            ? {
                id: b.deletedBy.id,
                fname: b.deletedBy.fname,
                lname: b.deletedBy.lname,
                role: b.deletedBy.role,
              }
            : null,
        })),
        count,
        totalPage,
        page,
        limit,
        totals: { totalCount },
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const branch = await prisma.branch.findFirst({
        where: { isActive: false, id },
      });
      if (!branch) throw new AppError(404, "branch_not_found");

      await prisma.branch.update({
        where: { id },
        data: {
          isActive: true,
          deletedAt: null,
          deletedById: null,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const branch = await prisma.branch.findFirst({
        where: { isActive: false, id },
        include: {
          entries: {
            include: {
              invoiceFiles: true,
              bankAcceptanceFiles: true,
            },
          },
        },
      });
      if (!branch) throw new AppError(404, "branch_not_found");

      await prisma.branch.delete({
        where: { id },
      });

      const attachments = [];
      if (branch.entries.length) {
        for (const e of branch.entries) {
          if (e.bankAcceptanceFiles.length) {
            for (const f of e.bankAcceptanceFiles) {
              attachments.push(f.filename);
            }
          }

          if (e.invoiceFiles.length) {
            for (const f of e.invoiceFiles) {
              attachments.push(f.filename);
            }
          }
        }
      }

      if (attachments.length) await deleteFilesFromS3(attachments);

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getBranchesName(req, res, next) {
    try {
      const key = typeof req.query.key === "string" ? req.query.key.trim() : null;

      const branches = await prisma.branch.findMany({
        where: {
          isActive: true,
          ...(key && {
            OR: [{ name: { contains: key, mode: "insensitive" } }, { stir: { contains: key, mode: "insensitive" } }],
          }),
        },
        select: {
          id: true,
          name: true,
        },
      });

      res.status(200).json({
        status: "success",
        data: branches,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = branchController;
