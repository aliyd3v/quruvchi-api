const { ObjectStatus, WorkType, TransactionType } = require("../generated/prisma");
const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const { fromMinorUnits } = require("../utils/amount");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { Role } = require("../generated/prisma");
const storage = require("../lib/storage");

const allowedColumnKeys = ["name", "serviceName", "description", "status", "projectType", "workType", "productName", "createdAt", "updatedAt"];

const objectController = {
  async createOne(req, res, next) {
    try {
      const { assigned, location, workType, name, description, amount: budget, startDate, endDate } = req.body;

      const assignedResult = (
        await prisma.user.findMany({
          where: { id: { in: assigned }, isActive: true, role: { not: "SUPERADMIN" } },
          select: { id: true },
        })
      ).map((u) => u.id);

      const newLocation = await prisma.location.create({ data: { lat: location.lat, lon: location.lon } });

      await prisma.object.create({
        data: {
          name,
          description,
          budget,
          assigned: { connect: assignedResult.map((id) => ({ id })) },
          workType,
          locationId: newLocation.id,
          startDate,
          endDate,
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
      let { page, limit, key, reverse, sort, direction } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(page)) ? Number(limit) : 10;
      reverse = reverse !== "faslse";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      const findWhere = {
        isActive: true,
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }] }),
      };

      const findWhereForTotal = { isActive: true };

      if (Object.values(WorkType).includes(direction)) {
        findWhere.workType = direction;
        findWhereForTotal.workType = direction;
      } else if (direction === "COMPLETED") {
        findWhere.status = "COMPLETED";
        findWhereForTotal.status = "COMPLETED";
      }

      const count = await prisma.object.count({
        where: findWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [objects, groubByRes] = await Promise.all([
        prisma.object.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            name: true,
            description: true,
            totalExpense: true,
            totalIncome: true,
            workType: true,
            address: { select: { lat: true, lon: true } },
            status: true,
            budget: true,
            assigned: {
              where: { isActive: true },
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
            tasks: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.object.groupBy({ by: ["status"], _count: true, where: findWhereForTotal }),
      ]);

      const nowMs = Date.now();

      const result = objects.map((o) => {
        let progress = 0;
        const startDate = new Date(o.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(o.endDate);
        endDate.setHours(23, 59, 59, 999);

        if (endDate.getTime() < nowMs) {
          progress = 100;
        } else if (startDate.getTime() < nowMs && nowMs < endDate.getTime()) {
          progress = Math.floor(((nowMs - startDate.getTime()) * 100) / (endDate.getTime() - startDate.getTime()));
        }

        const result = {
          ...o,
          totalExpense: o.totalExpense,
          totalIncome: o.totalIncome,
          address: {
            lat: Number(o.address.lat),
            lon: Number(o.address.lon),
            url: `https://yandex.uz/maps/?pt=${o.address.lon},${o.address.lat}&z=16`,
          },
          budget: o.budget,
          spent: o.totalExpense,
          remaining: o.budget - o.totalExpense,
          progress,
        };
        return result;
      });

      const statusesCount = {
        TOTAL: 0,
        ACTIVE: 0,
        PAUSED: 0,
        COMPLETED: 0,
        LATE: 0,
      };
      for (const g of groubByRes) {
        statusesCount[g.status] = g._count;
      }
      statusesCount["TOTAL"] = Object.values(statusesCount).reduce((sum, c) => sum + c, 0);

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: result,
        statusesCount,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      let { reverse, sort, direction } = req.query;

      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      const findWhere = { isActive: true };

      if (Object.values(WorkType).includes(direction)) {
        findWhere.workType = direction;
      } else if (direction === "COMPLETED") {
        findWhere.status = "COMPLETED";
      }

      const [objects, groupByRes] = await Promise.all([
        prisma.object.findMany({
          orderBy: { [sort]: reverse === false ? "asc" : "desc" },
          where: findWhere,
          select: {
            id: true,
            name: true,
            description: true,
            totalExpense: true,
            totalIncome: true,
            workType: true,
            status: true,
            budget: true,
            assigned: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            _count: {
              select: { tasks: { where: { isActive: true } } },
            },
            startDate: true,
            endDate: true,
            createdAt: true,
          },
        }),
        prisma.object.groupBy({ by: ["status"], _count: true, where: findWhere }),
      ]);

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Obyektlar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.5;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 40;

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
          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getStatusStyle = (status) => {
        const styles = {
          [ObjectStatus.ACTIVE]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [ObjectStatus.PAUSED]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [ObjectStatus.COMPLETED]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [ObjectStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [ObjectStatus.ACTIVE]: "Фаол",
          [ObjectStatus.PAUSED]: "Тўхтатилган",
          [ObjectStatus.COMPLETED]: "Якунланган",
          [ObjectStatus.LATE]: "Кечиккан",
        };
        return statuses[status] || "";
      };

      const getWorkTypeUz = (workType) => {
        const types = {
          [WorkType.CONSTRUCTION]: "Қурилиш",
          [WorkType.TRADE]: "Савдо",
          [WorkType.FURNITURE]: "Мебел",
          [WorkType.SEWING]: "Тикувчилик",
          [WorkType.SMETA]: "Смета",
          [WorkType.OTHER]: "Бошқа",
        };
        return types[workType] || "-";
      };

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
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
        { header: "№", key: "number", minWidth: 5 },
        { header: "Номи", key: "name", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Тавсиф", key: "description", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Иш тури", key: "workType", minWidth: 14 },
        { header: "Ҳолат", key: "status", minWidth: 14 },
        { header: "Бюджет", key: "budget", minWidth: 18 },
        { header: "Умумий кирим", key: "totalIncome", minWidth: 18 },
        { header: "Умумий чиқим", key: "totalExpense", minWidth: 18 },
        { header: "Қолдиқ", key: "remaining", minWidth: 18 },
        { header: "Вазифалар", key: "tasksCount", minWidth: 12 },
        { header: "Масъуллар", key: "assigned", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Бошланиш", key: "startDate", minWidth: 14 },
        { header: "Тугаш", key: "endDate", minWidth: 14 },
        { header: "Яратилган", key: "createdAt", minWidth: 14 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = objects.map((o, index) => {
        const assignedNames = o.assigned
          .map((u) => `${u.fname || ""} ${u.lname || ""}`.trim())
          .filter(Boolean)
          .join(", ");
        const remaining = Number(o.budget) - Number(o.totalExpense);

        const data = {
          number: String(index + 1),
          name: o.name || "",
          description: o.description || "",
          workType: getWorkTypeUz(o.workType),
          status: getStatusUz(o.status),
          budget: formatAmount(o.budget),
          totalIncome: formatAmount(o.totalIncome),
          totalExpense: formatAmount(o.totalExpense),
          remaining: formatNumber(remaining / 100),
          tasksCount: String(o._count?.tasks || 0),
          assigned: assignedNames || "-",
          startDate: formatDate(o.startDate),
          endDate: formatDate(o.endDate),
          createdAt: formatDate(o.createdAt),
          _status: o.status,
          _remaining: remaining,
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

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const { _status, _remaining, ...cleanData } = data;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Nomi
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Tavsif
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Ish turi

        // Holat - rangli fon
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        // Byudjet
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

        // Umumiy kirim - yashil
        row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(7).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

        // Umumiy chiqim - qizil
        row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(8).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };

        // Qoldiq - musbat yashil, manfiy qizil
        row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(9).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _remaining >= 0 ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Vazifalar
        row.getCell(11).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Mas'ullar
        row.getCell(12).alignment = { horizontal: "center", vertical: "middle" }; // Boshlanish
        row.getCell(13).alignment = { horizontal: "center", vertical: "middle" }; // Tugash
        row.getCell(14).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan
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

      // Statuslar bo'yicha hisoblash
      const statusCounts = {
        ACTIVE: 0,
        PAUSED: 0,
        COMPLETED: 0,
        LATE: 0,
      };
      for (const g of groupByRes) {
        statusCounts[g.status] = g._count;
      }
      const totalCount = Object.values(statusCounts).reduce((sum, c) => sum + c, 0);

      // Umumiy summalar
      const totalBudget = objects.reduce((sum, o) => sum + Number(o.budget), 0) / 100;
      const totalIncome = objects.reduce((sum, o) => sum + Number(o.totalIncome), 0) / 100;
      const totalExpense = objects.reduce((sum, o) => sum + Number(o.totalExpense), 0) / 100;
      const totalRemaining = totalBudget - totalExpense;

      // Jami obyektlar
      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:E${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами обектлар: ${totalCount}`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      summaryRow.getCell(6).value = formatNumber(totalBudget);
      summaryRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      summaryRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(7).value = formatNumber(totalIncome);
      summaryRow.getCell(7).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      summaryRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(8).value = formatNumber(totalExpense);
      summaryRow.getCell(8).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      summaryRow.getCell(8).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(9).value = formatNumber(totalRemaining);
      summaryRow.getCell(9).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: totalRemaining >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      summaryRow.getCell(9).alignment = { horizontal: "right", vertical: "middle" };

      // Status statistikasi
      const statsRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:E${summaryRowNumber + 1}`);
      statsRow.getCell(1).value = `Фаол: ${statusCounts.ACTIVE} | To'хтатилган: ${statusCounts.PAUSED} | Якунланган: ${statusCounts.COMPLETED} | Кечиккан: ${statusCounts.LATE}`;
      statsRow.getCell(1).font = { size: FONT_SIZE, name: FONT_NAME };
      statsRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

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

      const object = await prisma.object.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          budget: true,
          totalIncome: true,
          totalExpense: true,
          balance: true,
          workType: true,
          address: { select: { lat: true, lon: true } },
          status: true,
          assigned: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              avatar: { select: { url: true } },
              role: true,
              balance: true,
            },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              url: true,
              originalname: true,
              mimeType: true,
              filesize: true,
              createdBy: {
                where: { isActive: true },
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                },
              },
              createdAt: true,
            },
          },
          workVolumes: {
            where: { isActive: true },
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalAmount: true,
              spentAmount: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                },
              },
              answersToWorkVolume: {
                where: { isActive: true },
                select: {
                  id: true,
                  unitPrice: true,
                  unit: true,
                  totalAmount: true,
                  quantity: true,
                  notes: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                    },
                  },
                  createdAt: true,
                },
              },
              createdAt: true,
            },
          },
          transactions: {
            where: { isActive: true },
            select: {
              id: true,
              amount: true,
              date: true,
              isSalary: true,
              purpose: true,
              type: true,
              _count: { select: { items: true } },
              attachments: {
                take: 1,
                where: { isActive: true },
                select: { url: true },
              },
              createdBy: {
                select: {
                  fname: true,
                  lname: true,
                  avatar: { select: { url: true } },
                },
              },
              createdAt: true,
            },
          },
          transfersFrom: {
            where: { isActive: true },
            select: {
              id: true,
              amount: true,
              fromObject: { select: { name: true } },
              toObject: { select: { name: true } },
              createdAt: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  avatar: { select: { url: true } },
                  role: true,
                },
              },
              recipientUser: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  avatar: { select: { url: true } },
                  role: true,
                },
              },
              note: true,
            },
          },
          transfersTo: {
            where: { isActive: true },
            select: {
              id: true,
              amount: true,
              fromObject: { select: { name: true } },
              toObject: { select: { name: true } },
              createdAt: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  avatar: { select: { url: true } },
                  role: true,
                },
              },
              recipientUser: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  avatar: { select: { url: true } },
                  role: true,
                },
              },
              note: true,
            },
          },
          tasks: {
            where: { isActive: true, parentId: null },
            select: {
              id: true,
              title: true,
              status: true,
              endDate: true,
              assigned: {
                where: { user: { isActive: true } },
                select: {
                  user: {
                    select: {
                      fname: true,
                      lname: true,
                    },
                  },
                },
              },
            },
          },
          inventoryHistory: {
            where: { isActive: true, inventoryId: { not: null }, inventory: { isActive: true } },
            include: {
              attachments: true,
              createdBy: true,
              executedBy: true,
              inventory: {
                include: {
                  avatars: true,
                },
              },
            },
          },
          startDate: true,
          endDate: true,
        },
      });
      if (!object) {
        return next(new AppError(404, "object_not_found"));
      }

      const assigned = object.assigned.map((user) => ({
        id: user.id,
        fname: user.fname,
        lname: user.lname,
        avatar: user.avatar ? { url: user.avatar.url } : null,
        role: user.role,
        fund: { balance: user.balance },
      }));
      const prorabs = assigned.filter((a) => a.role === Role.ADMIN);
      const workers = assigned.filter((a) => a.role === Role.WORKER);
      const pto = assigned.filter((a) => a.role === Role.PTO);
      const accountants = assigned.filter((a) => a.role === Role.ACCOUNTANT);
      const transfers = [...object.transfersFrom, ...object.transfersTo].sort((a, b) => b.createdAt - a.createdAt);

      const assignedsCount = assigned.length;

      delete object.assigned;
      delete object.transfersFrom;
      delete object.transfersTo;

      const nowMs = Date.now();

      let progress = 0;
      const startDate = new Date(object.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(object.endDate);
      endDate.setHours(23, 59, 59, 999);

      if (endDate.getTime() < nowMs) {
        progress = 100;
      } else if (startDate.getTime() < nowMs && nowMs < endDate.getTime()) {
        progress = Math.floor(((nowMs - startDate.getTime()) * 100) / (endDate.getTime() - startDate.getTime()));
      }

      const result = {
        ...object,
        budget: object.budget,
        totalIncome: object.totalIncome,
        totalExpense: object.totalExpense,
        balance: object.balance,
        spent: object.totalExpense,
        remaining: object.budget - object.totalExpense,
        address: {
          lat: Number(object.address?.lat),
          lon: Number(object.address?.lon),
          url: `https://yandex.uz/maps/?pt=${object.address?.lon},${object.address?.lat}&z=16`,
        },
        workVolumes: object.workVolumes.map((wv) => {
          return {
            ...wv,
            unitPrice: wv.unitPrice,
            totalAmount: wv.totalAmount,
            spentAmount: wv.spentAmount,
            remaining: wv.totalAmount - wv.spentAmount,
            answersToWorkVolume: wv.answersToWorkVolume.map((a) => ({
              ...a,
              totalAmount: a.totalAmount,
              unitPrice: a.unitPrice,
            })),
          };
        }),
        assignedsCount,
        assigned: {
          prorabs,
          workers,
          pto,
          accountants,
        },
        transactions: object.transactions,
        transfers: transfers,
        progress,
        inventoryHistory: object.inventoryHistory.map((h) => ({
          id: h.id,
          description: h.description,
          quantity: Number(h.quantity),
          type: h.type,
          createdAt: h.createdAt,
          createdBy: h.createdBy
            ? {
                id: h.createdBy.id,
                fname: h.createdBy.fname,
                lname: h.createdBy.lname,
                role: h.createdBy.role,
              }
            : null,
          executedBy: h.executedBy
            ? {
                id: h.executedBy.id,
                fname: h.executedBy.fname,
                lname: h.executedBy.lname,
                role: h.executedBy.role,
              }
            : null,
          attachments: h.attachments.map((a) => ({
            id: a.id,
            url: a.url,
            originalname: a.originalname,
            filesize: a.filesize,
          })),
          inventory: h.inventory
            ? {
                id: h.inventory.id,
                name: h.inventory.name,
                sku: h.inventory.sku,
                unit: h.inventory.unit,
                avatars: h.inventory.avatars.map((a) => ({ url: a.url })),
              }
            : null,
          unit: h.inventory?.unit || null,
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

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { assigned, location, workType, startDate, endDate, name, description, amount: budget } = req.body;

      const object = await prisma.object.findFirst({
        where: { id, isActive: true },
        include: {
          address: true,
          assigned: true,
        },
      });
      if (!object) throw new AppError(404, "object_not_found");

      if (location.lat !== Number(object.address.lat) || location.lon !== Number(object.address.lon)) {
        await prisma.location.update({
          where: { id: object.address.id },
          data: { lat: location.lat, lon: location.lon },
        });
      }
      const assignedResult = (await prisma.user.findMany({ where: { id: { in: assigned }, isActive: true, role: { not: "SUPERADMIN" } }, select: { id: true } })).map((u) => u.id);

      await prisma.object.update({
        where: { id },
        data: {
          name,
          description,
          startDate,
          endDate,
          budget,
          workType,
          assigned: { set: assignedResult.map((id) => ({ id })) },
        },
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

      const object = await prisma.object.findFirst({ where: { isActive: true, id }, select: { id: true } });
      if (!object) throw new AppError(404, "object_not_found");

      await prisma.object.update({
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

  async changeStatus(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({ where: { isActive: true, id }, select: { id: true } });
      if (!object) throw new AppError(404, "object_not_found");

      await prisma.object.update({ where: { id }, data: { status: req.body.status } });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserObjects(req, res, next) {
    try {
      let { page, limit, key, reverse, sort } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      const findWhere = {
        isActive: true,
        assigned: { some: { id: req.user.id } },
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }] }),
      };

      const count = await prisma.object.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [objects] = await Promise.all([
        prisma.object.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            startDate: true,
            endDate: true,
            workType: true,
            createdAt: true,
            updatedAt: true,
            address: { select: { id: true, lat: true, lon: true } },
          },
        }),
      ]);

      const nowMs = Date.now();

      const result = objects.map((o) => {
        let progress = 0;
        const startDate = new Date(o.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(o.endDate);
        endDate.setHours(23, 59, 59, 999);

        if (endDate.getTime() < nowMs) {
          progress = 100;
        } else if (startDate.getTime() < nowMs && nowMs < endDate.getTime()) {
          progress = Math.floor(((nowMs - startDate.getTime()) * 100) / (endDate.getTime() - startDate.getTime()));
        }

        const result = {
          ...o,
          address: { ...o.address, url: `https://yandex.uz/maps/?pt=${o.address.lon},${o.address.lat}&z=16` },
          progress,
        };
        return result;
      });

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

  async getUserObject(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const [object, transfers] = await Promise.all([
        prisma.object.findFirst({
          where: { id, isActive: true, assigned: { some: { id: req.user.id } } },
          include: {
            address: true,
            assigned: {
              where: { isActive: true },
              include: { avatar: true },
            },
            workVolumes: {
              where: { isActive: true },
              include: {
                createdBy: {
                  include: { avatar: true },
                },
                answersToWorkVolume: {
                  where: { isActive: true, createdById: req.user.id },
                  include: {
                    createdBy: {
                      include: { avatar: true },
                    },
                  },
                },
              },
            },
            tasks: {
              where: { isActive: true, assigned: { some: { userId: req.user.id } } },
              include: {
                subtasks: {
                  where: { isActive: true, assigned: { some: { userId: req.user.id } } },
                  include: {
                    createdBy: {
                      include: { avatar: true },
                    },
                  },
                },
              },
            },
            transactions: {
              where: {
                isActive: true,
                createdById: req.user.id,
              },
              include: {
                _count: {
                  select: {
                    items: {
                      where: { isActive: true },
                    },
                  },
                },
                createdBy: {
                  include: { avatar: true },
                },
                organization: true,
              },
            },
            inventoryHistory: {
              where: { isActive: true, inventoryId: { not: null }, inventory: { isActive: true } },
              include: {
                attachments: true,
                createdBy: true,
                executedBy: true,
                inventory: {
                  include: { avatars: true },
                },
              },
            },
          },
        }),
        prisma.fundTransfer.findMany({
          where: {
            isActive: true,
            AND: [{ OR: [{ fromObjectId: id }, { toObjectId: id }] }, { OR: [{ recipientUserId: req.user.id }, { createdById: req.user.id }] }],
          },
          select: {
            id: true,
            amount: true,
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
            recipientUser: {
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
                avatar: {
                  select: {
                    url: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
                avatar: {
                  select: {
                    url: true,
                  },
                },
              },
            },
            createdAt: true,
          },
        }),
      ]);
      if (!object) {
        return next(new AppError(404, "object_not_found"));
      }

      const tasks = [];
      object.tasks.forEach((t) => {
        t.subtasks.map((s) => {
          tasks.push({
            id: s.id,
            title: s.title,
            description: s.description,
            durationDays: s.durationDays,
            startDate: s.startDate,
            endDate: s.endDate,
            checked: s.checked,
            status: s.status,
            priority: s.priority,
            progress: s.progress,
            comments: s.comments,
            createdAt: s.createdAt,
            createdBy: {
              id: s.createdBy.id,
              fname: s.createdBy.fname,
              lname: s.createdBy.lname,
              role: s.createdBy.role,
              avatar: s.createdBy.avatar
                ? {
                    url: s.createdBy.avatar.url,
                  }
                : null,
            },
          });
        });
      });

      const nowMs = Date.now();

      let progress = 0;
      const startDate = new Date(object.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(object.endDate);
      endDate.setHours(23, 59, 59, 999);

      if (endDate.getTime() < nowMs) {
        progress = 100;
      } else if (startDate.getTime() < nowMs && nowMs < endDate.getTime()) {
        progress = Math.floor(((nowMs - startDate.getTime()) * 100) / (endDate.getTime() - startDate.getTime()));
      }

      const result = {
        id: object.id,
        name: object.name,
        description: object.description,
        startDate: object.startDate,
        endDate: object.endDate,
        status: object.status,
        workType: object.workType,
        workersCount: object.assigned.length,
        tasks,
        workVolumes: object.workVolumes.map((wv) => ({
          id: wv.id,
          title: wv.title,
          description: wv.description,
          unit: wv.unit,
          unitPrice: fromMinorUnits(wv.unitPrice),
          totalAmount: fromMinorUnits(wv.totalAmount),
          spentAmount: fromMinorUnits(wv.spentAmount),
          quantity: wv.quantity,
          createdAt: wv.createdAt,
          createdBy: {
            id: wv.createdBy.id,
            fname: wv.createdBy.fname,
            lname: wv.createdBy.lname,
            role: wv.createdBy.role,
            avatar: wv.createdBy.avatar ? { url: wv.createdBy.avatar.url } : null,
          },
          answersToWorkVolume: wv.answersToWorkVolume.map((a) => ({
            id: a.id,
            notes: a.notes,
            quantity: a.quantity,
            unit: a.unit,
            unitPrice: fromMinorUnits(a.unitPrice),
            totalAmount: fromMinorUnits(a.totalAmount),
            createdAt: a.createdAt,
            createdBy: {
              id: a.createdBy.id,
              fname: a.createdBy.fname,
              lname: a.createdBy.lname,
              role: a.createdBy.role,
              avatar: a.createdBy.avatar ? { url: wv.createdBy.avatar.url } : null,
            },
          })),
        })),
        transfers: transfers.map((t) => ({
          ...t,
          amount: fromMinorUnits(t.amount),
        })),
        assigned: object.assigned.map((a) => ({
          id: a.id,
          fname: a.fname,
          lname: a.lname,
          role: a.role,
          avatar: a.avatar ? { url: a.avatar.url } : null,
        })),
        address: object.address
          ? {
              lon: object.address.lon,
              lat: object.address.lat,
              url: `https://yandex.uz/maps/?pt=${object.address.lon},${object.address.lat}&z=16`,
            }
          : null,
        transactions: object.transactions.map((t) => ({
          id: t.id,
          notes: t.notes,
          amount: fromMinorUnits(t.amount),
          date: t.date,
          purpose: t.purpose,
          type: t.type,
          _count: { items: t._count.items },
          organization: t.organization
            ? {
                id: t.organization.id,
                organizationName: t.organization.organizationName,
                stirNumber: t.organization.stirNumber,
              }
            : null,
        })),
        createdAt: object.createdAt,
        progress,
        inventoryHistory: object.inventoryHistory.map((h) => ({
          id: h.id,
          description: h.description,
          quantity: Number(h.quantity),
          type: h.type,
          createdAt: h.createdAt,
          createdBy: h.createdBy
            ? {
                id: h.createdBy.id,
                fname: h.createdBy.fname,
                lname: h.createdBy.lname,
                role: h.createdBy.role,
              }
            : null,
          executedBy: h.executedBy
            ? {
                id: h.executedBy.id,
                fname: h.executedBy.fname,
                lname: h.executedBy.lname,
                role: h.executedBy.role,
              }
            : null,
          attachments: h.attachments.map((a) => ({
            id: a.id,
            url: a.url,
            originalname: a.originalname,
            filesize: a.filesize,
          })),
          inventory: h.inventory
            ? {
                id: h.inventory.id,
                name: h.inventory.name,
                sku: h.inventory.sku,
                unit: h.inventory.unit,
                avatars: h.inventory.avatars.map((a) => ({
                  id: a.id,
                  url: a.url,
                  originalname: a.originalname,
                  filesize: a.filesize,
                })),
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

  async getObjectWorkers(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          assigned: {
            where: { isActive: true, role: Role.WORKER },
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              avatar: true,
              balance: true,
            },
          },
        },
      });
      if (!object) throw new AppError(404, "object_not_found");

      res.status(200).json({
        status: "success",
        data: object.assigned.map((w) => ({ ...w, balace: fromMinorUnits(w.balance) })),
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTxnExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({ where: { isActive: true, id } });
      if (!object) throw new AppError(404, "object_not_found");

      const txns = await prisma.transaction.findMany({
        orderBy: { date: "desc" },
        where: { objectId: id, isActive: true },
        include: {
          createdBy: true,
          organization: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Транзакции");

      // ==================== КОНСТАНТЫ ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.2;
      const MIN_ROW_HEIGHT = 25;
      const NOTES_MAX_WIDTH = 40;

      // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getTypeStyle = (txnType) => {
        const styles = {
          [TransactionType.INCOME]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [TransactionType.EXPENSE]: { bgColor: "FFFFCDD2", fontColor: "FFC62828" },
        };
        return styles[txnType] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getTypeUz = (txnType) => {
        const types = {
          [TransactionType.INCOME]: "Кирим",
          [TransactionType.EXPENSE]: "Чиким",
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

      // ==================== КОЛОНКИ ====================
      const columns = [
        { header: "№", key: "number", wrapText: false },
        { header: "Сана", key: "date", wrapText: false },
        { header: "Тури", key: "type", wrapText: false },
        { header: "Мақсад", key: "purpose", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Изоҳ", key: "notes", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Сумма", key: "amount", wrapText: false },
        { header: "Ташкилот", key: "organization", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Яратувчи", key: "createdBy", wrapText: true, minWidth: 23 },
        { header: "Текширилган", key: "isReviewed", wrapText: false },
        { header: "Ойлик", key: "isSalary", wrapText: false },
        { header: "Таш. балансидан", key: "usedFromOrgBalance", wrapText: false },
      ];

      // ==================== ПОДГОТОВКА ДАННЫХ ====================
      let totalIncome = 0;
      let totalExpense = 0;

      const rowsData = txns.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const amount = Number(t.amount) / 100;
        if (t.type === TransactionType.INCOME) {
          totalIncome += amount;
        } else if (t.type === TransactionType.EXPENSE) {
          totalExpense += amount;
        }

        return {
          number: String(index + 1),
          date: formatDate(t.date || t.createdAt),
          type: getTypeUz(t.type),
          purpose: t.purpose || "",
          notes: t.notes || "",
          amount: formatAmount(t.amount),
          organization: t.organization?.organizationName || "",
          createdBy: createdByName,
          isReviewed: t.isReviewed ? "Ҳа" : "Йўқ",
          isSalary: t.isSalary ? "Ҳа" : "Йўқ",
          usedFromOrgBalance: t.usedFromOrganizationBalance ? "Ҳа" : "Йўқ",
          _type: t.type,
        };
      });

      const remaining = totalIncome - totalExpense;

      // ==================== ОБЪЕКТ НОМИНИ ХИСОБГА ОЛИШ ====================
      const titleRowNumber = 1;
      sheet.mergeCells(`A${titleRowNumber}:K${titleRowNumber}`);
      const titleRow = sheet.getRow(titleRowNumber);
      titleRow.height = 30;

      // ==================== HEADER ROW ====================
      // Avval headerlarni qo'shamiz
      const headerRow = sheet.addRow(columns.map((col) => col.header));
      headerRow.height = 30;
      headerRow.eachCell((cell, colNumber) => {
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

      // Endi columnlarni belgilaymiz
      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.maxWidth || 15,
      }));

      // ==================== ОБЪЕКТ НОМИНИ ХИСОБГА ОЛИШ ==================== // IKKINCHI QISMI (headerdaki oxirgi columnni valuesi 1 - rowga o'tib qolib durgani uchun bu qismi headerdan keyin yozildi)
      titleRow.getCell(1).value = `Объект: ${object.name || ""}`;
      titleRow.getCell(1).font = { bold: true, size: 14, name: FONT_NAME };
      titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      titleRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };

      // ==================== ДОБАВЛЕНИЕ ДАННЫХ ====================
      rowsData.forEach((data) => {
        const typeStyle = getTypeStyle(data._type);
        const { _type, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row heightni hisoblash
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const colWidth = sheet.getColumn(idx + 1).width || 15;
            const height = calculateRowHeight(cleanData[col.key], colWidth);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell, colNumber) => {
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
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Сана
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Тури
        row.getCell(3).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };
        row.getCell(4).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Мақсад
        row.getCell(5).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Изоҳ
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" }; // Сумма
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };
        row.getCell(7).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Ташкилот
        row.getCell(8).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Яратувчи
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Текширилган
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Ойлик
        row.getCell(11).alignment = { horizontal: "center", vertical: "middle" }; // Таш. балансидан
      });

      // ==================== НАСТРОЙКА ШИРИНЫ КОЛОНОК ====================
      columns.forEach((col, idx) => {
        const column = sheet.getColumn(idx + 1);
        if (col.maxWidth) {
          column.width = col.maxWidth;
        } else {
          // Auto width ni hisoblash
          let maxLength = col.header.length;
          rowsData.forEach((row) => {
            const cellValue = String(row[col.key]);
            const lines = cellValue.split("\n");
            lines.forEach((line) => {
              if (line.length > maxLength) maxLength = line.length;
            });
          });
          column.width = Math.max(maxLength + 3, 10);
        }
      });

      // ==================== ВСЕГО СТРОКА ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Жами: кирим, чиким ва колдиқ
      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:E${summaryRowNumber}`);
      summaryRow.getCell(1).value = "ЖАМИ:";
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      // Кирим
      const incomeRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:E${summaryRowNumber + 1}`);
      incomeRow.getCell(1).value = "Умумий кирим:";
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(6).value = formatNumber(totalIncome);
      incomeRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      incomeRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Чиким
      const expenseRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:E${summaryRowNumber + 2}`);
      expenseRow.getCell(1).value = "Умумий чиким:";
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(6).value = formatNumber(totalExpense);
      expenseRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      expenseRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Колдиқ
      const remainingRow = sheet.getRow(summaryRowNumber + 3);
      sheet.mergeCells(`A${summaryRowNumber + 3}:E${summaryRowNumber + 3}`);
      remainingRow.getCell(1).value = "Колдиқ:";
      remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      remainingRow.getCell(1).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      remainingRow.getCell(6).value = formatNumber(remaining);
      remainingRow.getCell(6).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: remaining >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      remainingRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Заголовок сатрини музлатиш
      sheet.views = [{ state: "frozen", ySplit: 2 }]; // 2 сатр (объект номи ва заголовок)

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTxnExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({
        where: {
          id,
          isActive: true,
          assigned: {
            some: {
              id: req.user.id,
            },
          },
        },
      });
      if (!object) throw new AppError(404, "object_not_found");

      const txns = await prisma.transaction.findMany({
        orderBy: { date: "desc" },
        where: {
          objectId: id,
          isActive: true,
          createdById: req.user.id,
        },
        include: {
          createdBy: true,
          organization: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Транзакции");

      // ==================== КОНСТАНТЫ ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.2;
      const MIN_ROW_HEIGHT = 25;
      const NOTES_MAX_WIDTH = 40;

      // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getTypeStyle = (txnType) => {
        const styles = {
          [TransactionType.INCOME]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [TransactionType.EXPENSE]: { bgColor: "FFFFCDD2", fontColor: "FFC62828" },
        };
        return styles[txnType] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getTypeUz = (txnType) => {
        const types = {
          [TransactionType.INCOME]: "Кирим",
          [TransactionType.EXPENSE]: "Чиким",
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

      // ==================== КОЛОНКИ ====================
      const columns = [
        { header: "№", key: "number", wrapText: false },
        { header: "Сана", key: "date", wrapText: false },
        { header: "Тури", key: "type", wrapText: false },
        { header: "Мақсад", key: "purpose", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Изоҳ", key: "notes", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Сумма", key: "amount", wrapText: false },
        { header: "Ташкилот", key: "organization", wrapText: true, maxWidth: NOTES_MAX_WIDTH },
        { header: "Яратувчи", key: "createdBy", wrapText: true, minWidth: 23 },
        { header: "Текширилган", key: "isReviewed", wrapText: false },
        { header: "Ойлик", key: "isSalary", wrapText: false },
        { header: "Таш. балансидан", key: "usedFromOrgBalance", wrapText: false },
      ];

      // ==================== ПОДГОТОВКА ДАННЫХ ====================
      let totalIncome = 0;
      let totalExpense = 0;

      const rowsData = txns.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const amount = Number(t.amount) / 100;
        if (t.type === TransactionType.INCOME) {
          totalIncome += amount;
        } else if (t.type === TransactionType.EXPENSE) {
          totalExpense += amount;
        }

        return {
          number: String(index + 1),
          date: formatDate(t.date || t.createdAt),
          type: getTypeUz(t.type),
          purpose: t.purpose || "",
          notes: t.notes || "",
          amount: formatAmount(t.amount),
          organization: t.organization?.organizationName || "",
          createdBy: createdByName,
          isReviewed: t.isReviewed ? "Ҳа" : "Йўқ",
          isSalary: t.isSalary ? "Ҳа" : "Йўқ",
          usedFromOrgBalance: t.usedFromOrganizationBalance ? "Ҳа" : "Йўқ",
          _type: t.type,
        };
      });

      const remaining = totalIncome - totalExpense;

      // ==================== ОБЪЕКТ НОМИНИ ХИСОБГА ОЛИШ ====================
      const titleRowNumber = 1;
      sheet.mergeCells(`A${titleRowNumber}:K${titleRowNumber}`);
      const titleRow = sheet.getRow(titleRowNumber);
      titleRow.height = 30;

      // ==================== HEADER ROW ====================
      // Avval headerlarni qo'shamiz
      const headerRow = sheet.addRow(columns.map((col) => col.header));
      headerRow.height = 30;
      headerRow.eachCell((cell, colNumber) => {
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

      // Endi columnlarni belgilaymiz
      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.maxWidth || 15,
      }));

      // ==================== ОБЪЕКТ НОМИНИ ХИСОБГА ОЛИШ ==================== // IKKINCHI QISMI (headerdaki oxirgi columnni valuesi 1 - rowga o'tib qolib durgani uchun bu qismi headerdan keyin yozildi)
      titleRow.getCell(1).value = `Объект: ${object.name || ""}`;
      titleRow.getCell(1).font = { bold: true, size: 14, name: FONT_NAME };
      titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      titleRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };

      // ==================== ДОБАВЛЕНИЕ ДАННЫХ ====================
      rowsData.forEach((data) => {
        const typeStyle = getTypeStyle(data._type);
        const { _type, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row heightni hisoblash
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const colWidth = sheet.getColumn(idx + 1).width || 15;
            const height = calculateRowHeight(cleanData[col.key], colWidth);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell, colNumber) => {
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
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Сана
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Тури
        row.getCell(3).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };
        row.getCell(4).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Мақсад
        row.getCell(5).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Изоҳ
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" }; // Сумма
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };
        row.getCell(7).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Ташкилот
        row.getCell(8).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Яратувчи
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Текширилган
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Ойлик
        row.getCell(11).alignment = { horizontal: "center", vertical: "middle" }; // Таш. балансидан
      });

      // ==================== НАСТРОЙКА ШИРИНЫ КОЛОНОК ====================
      columns.forEach((col, idx) => {
        const column = sheet.getColumn(idx + 1);
        if (col.maxWidth) {
          column.width = col.maxWidth;
        } else {
          // Auto width ni hisoblash
          let maxLength = col.header.length;
          rowsData.forEach((row) => {
            const cellValue = String(row[col.key]);
            const lines = cellValue.split("\n");
            lines.forEach((line) => {
              if (line.length > maxLength) maxLength = line.length;
            });
          });
          column.width = Math.max(maxLength + 3, 10);
        }
      });

      // ==================== ВСЕГО СТРОКА ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Жами: кирим, чиким ва колдиқ
      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:E${summaryRowNumber}`);
      summaryRow.getCell(1).value = "ЖАМИ:";
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      // Кирим
      const incomeRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:E${summaryRowNumber + 1}`);
      incomeRow.getCell(1).value = "Умумий кирим:";
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(6).value = formatNumber(totalIncome);
      incomeRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      incomeRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Чиким
      const expenseRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:E${summaryRowNumber + 2}`);
      expenseRow.getCell(1).value = "Умумий чиким:";
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(6).value = formatNumber(totalExpense);
      expenseRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      expenseRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Колдиқ
      const remainingRow = sheet.getRow(summaryRowNumber + 3);
      sheet.mergeCells(`A${summaryRowNumber + 3}:E${summaryRowNumber + 3}`);
      remainingRow.getCell(1).value = "Колдиқ:";
      remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      remainingRow.getCell(1).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      remainingRow.getCell(6).value = formatNumber(remaining);
      remainingRow.getCell(6).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: remaining >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      remainingRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      // Заголовок сатрини музлатиш
      sheet.views = [{ state: "frozen", ySplit: 2 }]; // 2 сатр (объект номи ва заголовок)

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTransfersExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({ where: { isActive: true, id } });
      if (!object) throw new AppError(404, "object_not_found");

      const transfers = await prisma.fundTransfer.findMany({
        where: {
          isActive: true,
          OR: [{ toObjectId: id }, { fromObjectId: id }],
        },
        include: {
          createdBy: true,
          fromObject: true,
          fromOrganization: true,
          recipientUser: true,
          toObject: true,
          toOrganization: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Пул ўтказмалари");

      // ==================== КОНСТАНТЫ ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.2;
      const MIN_ROW_HEIGHT = 25;

      // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const formatNumber = (num) => {
        return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
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

      const roleToUz = (role) => {
        switch (role) {
          case Role.ACCOUNTANT:
            return "Бухгалтер";
            break;
          case Role.SUPERADMIN:
            return "Раҳбар";
            break;
          case Role.ADMIN:
            return "Прораб";
            break;
          case Role.PTO:
            return "ПТО";
            break;
          case Role.WORKER:
            return "Ишчи";
            break;
          default:
            return "Фойдаланувчи";
            break;
        }
      };

      // Yuboruvchini aniqlash funksiyasi
      const getSender = (transfer) => {
        if (transfer.fromObject) {
          return `Объект: ${transfer.fromObject.name || ""}`;
        } else if (transfer.fromOrganization) {
          return `Ташкилот: ${transfer.fromOrganization.organizationName || ""}`;
        } else if (transfer.createdBy) {
          return `${roleToUz(transfer.createdBy.role)}: ${transfer.createdBy.fname || ""} ${transfer.createdBy.lname || ""}`;
        }
        return "Номаълум";
      };

      // Qabul qiluvchini aniqlash funksiyasi
      const getRecipient = (transfer) => {
        if (transfer.toObject) {
          return `Объект: ${transfer.toObject.name || ""}`;
        } else if (transfer.toOrganization) {
          return `Ташкилот: ${transfer.toOrganization.organizationName || ""}`;
        } else if (transfer.recipientUser) {
          return `${roleToUz(transfer.recipientUser.role)}: ${transfer.recipientUser.fname || ""} ${transfer.recipientUser.lname || ""}`;
        }
        return "Номаълум";
      };

      // Yo'nalishni aniqlash (kirim/chiqim)
      const getDirection = (transfer) => {
        const isIncoming = transfer.toObjectId === id;
        return isIncoming ? "Кирим" : "Чиқим";
      };

      // Yo'nalish bo'yicha stil
      const getDirectionStyle = (transfer) => {
        const isIncoming = transfer.toObjectId === id;
        if (isIncoming) {
          return { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" }; // Яшил - кирим
        } else {
          return { bgColor: "FFFFCDD2", fontColor: "FFC62828" }; // Кизил - чиқим
        }
      };

      // ==================== КОЛОНКИ ====================
      const columns = [
        { header: "№", key: "number", wrapText: false, width: 8 },
        { header: "Йўналиш", key: "direction", wrapText: false, width: 15 },
        { header: "Юборилган манба", key: "sender", wrapText: true, width: 35 },
        { header: "Сумма (сўм)", key: "amount", wrapText: false, width: 18 },
        { header: "Қабул қилувчи", key: "recipient", wrapText: true, width: 35 },
        { header: "Ўтказма санаси", key: "date", wrapText: false, width: 20 },
        { header: "Ўтказма тавсифи", key: "description", wrapText: true, width: 40 },
        { header: "Яратувчи", key: "createdBy", wrapText: true, width: 25 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width,
      }));

      // ==================== ПОДГОТОВКА ДАННЫХ ====================
      let totalIncoming = 0;
      let totalOutgoing = 0;

      const rowsData = transfers.map((transfer, index) => {
        const direction = getDirection(transfer);
        const amount = Number(transfer.amount) / 100;

        // Jami summalarni hisoblash
        if (direction === "Кирим") {
          totalIncoming += amount;
        } else {
          totalOutgoing += amount;
        }

        const createdByName = transfer.createdBy ? `${transfer.createdBy.fname || ""} ${transfer.createdBy.lname || ""}`.trim() : "";

        return {
          number: String(index + 1),
          direction: direction,
          sender: getSender(transfer),
          amount: formatAmount(transfer.amount),
          recipient: getRecipient(transfer),
          date: formatDate(transfer.createdAt),
          description: transfer.description || "",
          createdBy: createdByName,
          _direction: direction,
          _amount: amount,
          _transfer: transfer, // Original transfer uchun
        };
      });

      const netBalance = totalIncoming - totalOutgoing;

      // ==================== ОБЪЕКТ НОМИНИ ХИСОБГА ОЛИШ ====================
      const titleRowNumber = 1;
      sheet.mergeCells(`A${titleRowNumber}:H${titleRowNumber}`);
      const titleRow = sheet.getRow(titleRowNumber);
      titleRow.height = 30;
      titleRow.getCell(1).value = `Объект: ${object.name || ""}`;
      titleRow.getCell(1).font = { bold: true, size: 14, name: FONT_NAME };
      titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      titleRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };

      // ==================== HEADER ROW ====================
      const headerRow = sheet.addRow(columns.map((col) => col.header));
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

      // ==================== ДОБАВЛЕНИЕ ДАННЫХ ====================
      rowsData.forEach((data) => {
        const directionStyle = getDirectionStyle(data._transfer);
        const { _direction, _amount, _transfer, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row heightni hisoblash (wrap text uchun)
        let maxHeight = MIN_ROW_HEIGHT;
        const wrapTextColumns = [2, 4, 7, 8]; // sender, recipient, description, createdBy column indekslari (0-based emas)

        wrapTextColumns.forEach((colIdx) => {
          const colWidth = sheet.getColumn(colIdx).width || 15;
          const cellValue = cleanData[columns[colIdx - 1].key];
          const height = calculateRowHeight(cellValue, colWidth);
          if (height > maxHeight) maxHeight = height;
        });

        row.height = maxHeight;

        // Barcha celllarga asosiy stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: directionStyle.bgColor },
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
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Йўналиш
        row.getCell(2).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: directionStyle.fontColor },
        };
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Юборилган манба
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" }; // Сумма
        row.getCell(4).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: directionStyle.fontColor },
        };
        row.getCell(5).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Қабул қилувчи
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // Ўтказма санаси
        row.getCell(7).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Ўтказма тавсифи
        row.getCell(8).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Яратувчи
      });

      // ==================== ВСЕГО СТРОКА ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Жами ўтказмалар сони
      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами ўтказмалар: ${transfers.length} та`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Кирим суммаси
      const incomeRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:C${summaryRowNumber + 1}`);
      incomeRow.getCell(1).value = "Жами кирим:";
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(4).value = formatNumber(totalIncoming);
      incomeRow.getCell(4).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FF2E7D32" },
      };
      incomeRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

      // Чиқим суммаси
      const expenseRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:C${summaryRowNumber + 2}`);
      expenseRow.getCell(1).value = "Жами чиқим:";
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(4).value = formatNumber(totalOutgoing);
      expenseRow.getCell(4).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FFC62828" },
      };
      expenseRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

      // Заголовок сатрини музлатиш
      sheet.views = [{ state: "frozen", ySplit: 2 }]; // 2 сатр (объект номи ва заголовок)

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransfersExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({ where: { isActive: true, id, assigned: { some: { id: req.user.id } } } });
      if (!object) throw new AppError(404, "object_not_found");

      const transfers = await prisma.fundTransfer.findMany({
        where: {
          isActive: true,
          AND: [{ OR: [{ toObjectId: id }, { fromObjectId: id }] }, { OR: [{ recipientUserId: req.user.id }, { createdById: req.user.id }] }],
        },
        include: {
          createdBy: true,
          fromObject: true,
          fromOrganization: true,
          recipientUser: true,
          toObject: true,
          toOrganization: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Пул ўтказмалари");

      // ==================== КОНСТАНТЫ ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.2;
      const MIN_ROW_HEIGHT = 25;

      // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const formatNumber = (num) => {
        return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
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

      const roleToUz = (role) => {
        switch (role) {
          case Role.ACCOUNTANT:
            return "Бухгалтер";
            break;
          case Role.SUPERADMIN:
            return "Раҳбар";
            break;
          case Role.ADMIN:
            return "Прораб";
            break;
          case Role.PTO:
            return "ПТО";
            break;
          case Role.WORKER:
            return "Ишчи";
            break;
          default:
            return "Фойдаланувчи";
            break;
        }
      };

      // Yuboruvchini aniqlash funksiyasi
      const getSender = (transfer) => {
        if (transfer.fromObject) {
          return `Объект: ${transfer.fromObject.name || ""}`;
        } else if (transfer.fromOrganization) {
          return `Ташкилот: ${transfer.fromOrganization.organizationName || ""}`;
        } else if (transfer.createdBy) {
          return `${roleToUz(transfer.createdBy.role)}: ${transfer.createdBy.fname || ""} ${transfer.createdBy.lname || ""}`;
        }
        return "Номаълум";
      };

      // Qabul qiluvchini aniqlash funksiyasi
      const getRecipient = (transfer) => {
        if (transfer.toObject) {
          return `Объект: ${transfer.toObject.name || ""}`;
        } else if (transfer.toOrganization) {
          return `Ташкилот: ${transfer.toOrganization.organizationName || ""}`;
        } else if (transfer.recipientUser) {
          return `${roleToUz(transfer.recipientUser.role)}: ${transfer.recipientUser.fname || ""} ${transfer.recipientUser.lname || ""}`;
        }
        return "Номаълум";
      };

      // Yo'nalishni aniqlash (kirim/chiqim)
      const getDirection = (transfer) => {
        const isIncoming = transfer.toObjectId === id;
        return isIncoming ? "Кирим" : "Чиқим";
      };

      // Yo'nalish bo'yicha stil
      const getDirectionStyle = (transfer) => {
        const isIncoming = transfer.toObjectId === id;
        if (isIncoming) {
          return { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" }; // Яшил - кирим
        } else {
          return { bgColor: "FFFFCDD2", fontColor: "FFC62828" }; // Кизил - чиқим
        }
      };

      // ==================== КОЛОНКИ ====================
      const columns = [
        { header: "№", key: "number", wrapText: false, width: 8 },
        { header: "Йўналиш", key: "direction", wrapText: false, width: 15 },
        { header: "Юборилган манба", key: "sender", wrapText: true, width: 35 },
        { header: "Сумма (сўм)", key: "amount", wrapText: false, width: 18 },
        { header: "Қабул қилувчи", key: "recipient", wrapText: true, width: 35 },
        { header: "Ўтказма санаси", key: "date", wrapText: false, width: 20 },
        { header: "Ўтказма тавсифи", key: "description", wrapText: true, width: 40 },
        { header: "Яратувчи", key: "createdBy", wrapText: true, width: 25 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width,
      }));

      // ==================== ПОДГОТОВКА ДАННЫХ ====================
      let totalIncoming = 0;
      let totalOutgoing = 0;

      const rowsData = transfers.map((transfer, index) => {
        const direction = getDirection(transfer);
        const amount = Number(transfer.amount) / 100;

        // Jami summalarni hisoblash
        if (direction === "Кирим") {
          totalIncoming += amount;
        } else {
          totalOutgoing += amount;
        }

        const createdByName = transfer.createdBy ? `${transfer.createdBy.fname || ""} ${transfer.createdBy.lname || ""}`.trim() : "";

        return {
          number: String(index + 1),
          direction: direction,
          sender: getSender(transfer),
          amount: formatAmount(transfer.amount),
          recipient: getRecipient(transfer),
          date: formatDate(transfer.createdAt),
          description: transfer.description || "",
          createdBy: createdByName,
          _direction: direction,
          _amount: amount,
          _transfer: transfer, // Original transfer uchun
        };
      });

      const netBalance = totalIncoming - totalOutgoing;

      // ==================== ОБЪЕКТ НОМИНИ ХИСОБГА ОЛИШ ====================
      const titleRowNumber = 1;
      sheet.mergeCells(`A${titleRowNumber}:H${titleRowNumber}`);
      const titleRow = sheet.getRow(titleRowNumber);
      titleRow.height = 30;
      titleRow.getCell(1).value = `Объект: ${object.name || ""}`;
      titleRow.getCell(1).font = { bold: true, size: 14, name: FONT_NAME };
      titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      titleRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };

      // ==================== HEADER ROW ====================
      const headerRow = sheet.addRow(columns.map((col) => col.header));
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

      // ==================== ДОБАВЛЕНИЕ ДАННЫХ ====================
      rowsData.forEach((data) => {
        const directionStyle = getDirectionStyle(data._transfer);
        const { _direction, _amount, _transfer, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row heightni hisoblash (wrap text uchun)
        let maxHeight = MIN_ROW_HEIGHT;
        const wrapTextColumns = [2, 4, 7, 8]; // sender, recipient, description, createdBy column indekslari (0-based emas)

        wrapTextColumns.forEach((colIdx) => {
          const colWidth = sheet.getColumn(colIdx).width || 15;
          const cellValue = cleanData[columns[colIdx - 1].key];
          const height = calculateRowHeight(cellValue, colWidth);
          if (height > maxHeight) maxHeight = height;
        });

        row.height = maxHeight;

        // Barcha celllarga asosiy stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: directionStyle.bgColor },
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
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Йўналиш
        row.getCell(2).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: directionStyle.fontColor },
        };
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Юборилган манба
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" }; // Сумма
        row.getCell(4).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: directionStyle.fontColor },
        };
        row.getCell(5).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Қабул қилувчи
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // Ўтказма санаси
        row.getCell(7).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Ўтказма тавсифи
        row.getCell(8).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Яратувчи
      });

      // ==================== ВСЕГО СТРОКА ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Жами ўтказмалар сони
      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами ўтказмалар: ${transfers.length} та`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Кирим суммаси
      const incomeRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:C${summaryRowNumber + 1}`);
      incomeRow.getCell(1).value = "Жами кирим:";
      incomeRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      incomeRow.getCell(4).value = formatNumber(totalIncoming);
      incomeRow.getCell(4).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FF2E7D32" },
      };
      incomeRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

      // Чиқим суммаси
      const expenseRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:C${summaryRowNumber + 2}`);
      expenseRow.getCell(1).value = "Жами чиқим:";
      expenseRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      expenseRow.getCell(4).value = formatNumber(totalOutgoing);
      expenseRow.getCell(4).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FFC62828" },
      };
      expenseRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

      // Заголовок сатрини музлатиш
      sheet.views = [{ state: "frozen", ySplit: 2 }]; // 2 сатр (объект номи ва заголовок)

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deletedObjects(req, res, next) {
    try {
      let { page, limit, key, reverse, sort, direction } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "name";

      const findWhere = {
        isActive: false,
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }] }),
        ...(Object.values(WorkType).includes(direction) && { workType: direction }),
        ...(direction === "COMPLETED" && { status: "COMPLETED" }),
      };

      const count = await prisma.object.count({
        where: findWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [objects, groubByRes] = await Promise.all([
        prisma.object.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            name: true,
            description: true,
            totalExpense: true,
            totalIncome: true,
            workType: true,
            address: {
              select: {
                lat: true,
                lon: true,
              },
            },
            status: true,
            budget: true,
            assigned: {
              where: { isActive: true },
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
            tasks: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            deletedBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
              },
            },
          },
        }),
        prisma.object.groupBy({ by: ["status"], _count: true, where: { isActive: false } }),
      ]);

      const nowMs = Date.now();

      const result = objects.map((o) => {
        let progress = 0;
        const startDate = new Date(o.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(o.endDate);
        endDate.setHours(23, 59, 59, 999);

        if (endDate.getTime() < nowMs) {
          progress = 100;
        } else if (startDate.getTime() < nowMs && nowMs < endDate.getTime()) {
          progress = Math.floor((nowMs - startDate.getTime()) * 100) / (endDate.getTime() - startDate.getTime());
        }

        const result = {
          ...o,
          totalExpense: fromMinorUnits(o.totalExpense),
          totalIncome: fromMinorUnits(o.totalIncome),
          address: {
            lat: Number(o.address.lat),
            lon: Number(o.address.lon),
            url: `https://yandex.uz/maps/?pt=${o.address.lon},${o.address.lat}&z=16`,
          },
          budget: fromMinorUnits(o.budget),
          spent: fromMinorUnits(o.totalExpense),
          remaining: fromMinorUnits(o.budget - o.totalExpense),
          progress,
        };
        return result;
      });

      const statusesCount = { TOTAL: 0, ACTIVE: 0, PAUSED: 0, COMPLETED: 0, LATE: 0 };
      for (const g of groubByRes) statusesCount[g.status] = g._count;
      statusesCount["TOTAL"] = Object.values(statusesCount).reduce((sum, c) => sum + c, 0);

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: result,
        statusesCount,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreDeleted(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({
        where: { isActive: false, id },
      });
      if (!object) throw new AppError(404, "object_not_found");

      await prisma.object.update({
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

  async absoluteDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const object = await prisma.object.findFirst({
        where: { id, isActive: false },
        include: { attachments: true },
      });
      if (!object) throw new AppError(404, "object_not_found");

      await prisma.object.delete({
        where: { id },
      });
      if (object.attachments.length) {
        await storage.deleteMany(object.attachments.map((f) => f.filename));
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getObjectNames(req, res, next) {
    try {
      const objects = await prisma.object.findMany({
        where: { isActive: true, status: { not: "COMPLETED" } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      res.status(200).json({
        status: "success",
        data: objects,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchObjectNames(req, res, next) {
    try {
      let { key } = req.query;
      key = typeof key === "string" ? key.trim() || "" : "";

      const objects = await prisma.object.findMany({
        where: {
          isActive: true,
          // status: { not: "COMPLETED" },
          ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }] }),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      res.status(200).json({
        status: "success",
        data: objects,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async removeOneAssigned(req, res, next) {
    try {
      const objectId = idChecker(req.params.objectId);
      const userId = idChecker(req.params.userId);

      const object = await prisma.object.findFirst({
        where: { id: objectId, isActive: true },
        select: { id: true, assigned: { select: { id: true } } },
      });
      if (!object) throw new AppError(404, "object_not_found");

      const isExists = object.assigned.some((a) => a.id === userId);
      if (isExists) {
        const newAssignments = object.assigned.filter((a) => a.id !== userId);
        await prisma.object.update({ where: { id: objectId }, data: { assigned: { set: newAssignments.map((a) => ({ id: a.id })) } } });
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async addOneToAssignment(req, rse, next) {
    try {
      const objectId = idChecker(req.params.objectId);
      const userId = idChecker(req.params.userId);

      const object = await prisma.object.findFirst({
        where: { id: objectId, isActive: true },
        select: { id: true, assigned: { select: { id: true } } },
      });
      if (!object) throw new AppError(404, "object_not_found");

      const isExists = object.assigned.some((a) => a.id === userId);
      if (!isExists) {
        const user = await prisma.user.findFirst({ where: { isActive: true, id: userId }, select: { id: true, role: true } });
        if (!user) throw new AppError(404, "user_not_found");
        if (user.role === "SUPERADMIN") throw new AppError(400, "bad_request");

        const newAssignments = object.assigned;
        newAssignments.push({ id: userId });

        await prisma.object.update({ where: { id: objectId }, data: { assigned: { set: newAssignments.map((a) => ({ id: a.id })) } } });
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getObjectsWithNameAndBudget(_req, res, next) {
    try {
      const objects = await prisma.object.findMany({
        where: { isActive: true },
        select: { id: true, name: true, budget: true },
        orderBy: { name: "asc" },
      });

      res.status(200).json({
        status: "success",
        data: objects.map((o) => ({
          ...o,
          budget: Number(o.budget) > 0 ? Number(o.budget) / 100 : 0,
        })),
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchUserObjectNames(req, res, next) {
    try {
      let key = req.query.key;

      key = typeof key === "string" ? key.trim() || "" : "";

      const objects = await prisma.object.findMany({
        where: {
          isActive: true,
          // status: { not: "COMPLETED" },
          assigned: { some: { id: req.user.id } },
          ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }] }),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      res.status(200).json({
        status: "success",
        data: objects,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = objectController;
