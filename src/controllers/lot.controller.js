const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const { fromMinorUnits } = require("../utils/amount");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { LotStatus } = require("../lib/prisma");
const fileService = require("../services/file.service");
const { deleteFilesFromS3 } = require("../utils/s3");

async function getFromTenderMcUz(id = "", page = 1, limit = 1, sortBy = "desc", orderBy = "confirmed_date") {
  try {
    const data = await fetch(`https://apisitender.mc.uz/api/tenders?per_page=${limit}&page=${page}&unique_name=${id}&sort_by=${sortBy}&order_by=${orderBy}`);
    const res = await data.json();
    let r = null;
    if (res?.result?.data?.[0]) {
      const resData = res.result.data[0];
      if (resData.id) {
        const resUrl = `https://apisitender.mc.uz/api/tenders/${resData.id}`;
        const data = await fetch(resUrl);
        r = await data.json();
      }
    }
    return r;
  } catch (error) {
    return null;
  }
}

const lotController = {
  async createOne(req, res, next) {
    try {
      let {
        body: {
          title,
          lotId,
          startingPrice,
          guaranteeAmount,
          lotEndDate,
          objectId = null,
          tenderType = null,
          lotBranch = null,
          workExecutionType = null,
          objectComplexityCategory = null,
          programCategory = null,
          fundingSource = null,
          fundingAmountCurrentYear,
          workDurationDays = null,
          proposalSubmissionDeadline = null,
          customer = null,
          objectRegion = null,
          objectCityDistrict = null,
          objectAddress = null,
          contactPerson = null,
          organizationDirector = null,
          tenderFiles = null,
          organizationPhone = null,
          organizationEmail = null,
          organizerName = null,
          assigned,
        },
        user: { id: createdById },
      } = req;

      const assignedUsersId = (await prisma.user.findMany({ where: { id: { in: assigned }, isActive: true, role: { not: "SUPERADMIN" } }, select: { id: true } })).map((u) => ({ id: u.id }));
      let status = "OPEN";

      const endDateMs = new Date(lotEndDate).getTime();
      const nowMs = Date.now();
      const nowPlus24H = nowMs + 24 * 60 * 60 * 1000;

      if (nowPlus24H < endDateMs) status = "OPEN";
      else if (nowMs < endDateMs < nowPlus24H) status = "LATE";
      else if (nowMs > endDateMs) status = "ENDED";

      const newLot = await prisma.lot.create({
        data: {
          title,
          lotId,
          startingPrice,
          guaranteeAmount,
          lotEndDate: new Date(lotEndDate.toISOString().slice(0, -1) + "+05:00"),
          objectId,
          tenderType,
          lotBranch,
          workExecutionType,
          objectComplexityCategory,
          programCategory,
          fundingSource,
          fundingAmountCurrentYear,
          workDurationDays,
          proposalSubmissionDeadline,
          customer,
          objectRegion,
          objectCityDistrict,
          objectAddress,
          contactPerson,
          organizationDirector,
          organizerName,
          organizationPhone,
          organizationEmail,
          tenderFiles,
          assigned: { connect: assignedUsersId },
          status,
          createdById,
        },
      });

      if (req.files && Array.isArray(req.files) && req.files.length) {
        req.lotId = newLot.id;
        next();
      } else {
        res.status(201).json({ status: "success" });
      }
    } catch (error) {
      if (req.files) await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },

  async uploadLotAttachment(req, res, next) {
    try {
      const uploadedFiles = req.uploadedFiles;

      const newAttachmentsData = uploadedFiles.map((u) => ({
        lotId: req.lotId,
        url: u.url,
        originalname: u.originalname,
        filename: u.filename,
        mimeType: u.mimeType,
        filesize: u.size,
        createdById: req.user.id,
      }));

      await prisma.attachment.createMany({ data: newAttachmentsData });

      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let { page, limit, key } = req.query;

      page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : "";

      const findWhere = {
        isActive: true,
        ...(key && {
          OR: [{ title: { contains: key, mode: "insensitive" } }, { lotId: { contains: key, mode: "insensitive" } }, { objectId: { contains: key, mode: "insensitive" } }],
        }),
      };

      const count = await prisma.lot.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [lots, totalCount] = await Promise.all([
        prisma.lot.findMany({
          where: findWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: { assigned: { include: { avatar: true } } },
        }),
        prisma.lot.count({
          where: { isActive: true },
        }),
      ]);

      res.status(200).json({
        status: "success",
        count,
        totalCount,
        totalPage,
        page,
        limit,
        data: lots.map((l) => ({
          id: l.id,
          title: l.title,
          lotId: l.lotId,
          startingPrice: fromMinorUnits(l.startingPrice),
          guaranteeAmount: fromMinorUnits(l.guaranteeAmount),
          lotEndDate: l.lotEndDate,
          objectId: l.objectId,
          tenderType: l.tenderType,
          lotBranch: l.lotBranch,
          workExecutionType: l.workExecutionType,
          objectComplexityCategory: l.objectComplexityCategory,
          programCategory: l.programCategory,
          fundingSource: l.fundingSource,
          fundingAmountCurrentYear: l.fundingAmountCurrentYear ? fromMinorUnits(l.fundingAmountCurrentYear) : null,
          workDurationDays: l.workDurationDays,
          proposalSubmissionDeadline: l.proposalSubmissionDeadline,
          customer: l.customer,
          objectRegion: l.objectRegion,
          objectCityDistrict: l.objectCityDistrict,
          objectAddress: l.objectAddress,
          contactPerson: l.contactPerson,
          organizationDirector: l.organizationDirector,
          organizationPhone: l.organizationPhone,
          organizerName: l.organizerName,
          organizationEmail: l.organizationEmail,
          tenderFiles: l.tenderFiles,
          status: l.status,
          assigned: l.assigned.map((u) => ({
            avatar: u.avatar ? { url: u.avatar.url } : null,
            id: u.id,
            fname: u.fname,
            lname: u.lname,
          })),
          createdAt: l.createdAt,
        })),
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(_req, res, next) {
    try {
      const lots = await prisma.lot.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          lotId: true,
          startingPrice: true,
          guaranteeAmount: true,
          lotEndDate: true,
          tenderType: true,
          customer: true,
          objectRegion: true,
          workDurationDays: true,
          status: true,
          assigned: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
            },
          },
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Lotlar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 35;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getStatusUz = (status) => {
        const statuses = {
          [LotStatus.OPEN]: "Очиқ",
          [LotStatus.LATE]: "Кечиккан",
          [LotStatus.IN_PROCESS]: "Жараёнда",
          [LotStatus.ENDED]: "Тугаган",
          [LotStatus.SUCCESS]: "Муваффақиятли",
        };
        return statuses[status] || status || "-";
      };

      const getStatusStyle = (status) => {
        const styles = {
          [LotStatus.OPEN]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [LotStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
          [LotStatus.IN_PROCESS]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [LotStatus.ENDED]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
          [LotStatus.SUCCESS]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const formatDate = (date) => {
        if (!date) return "-";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      const formatDateTime = (date) => {
        if (!date) return "-";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()} ${hours}:${minutes}`;
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "-";
        return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatAmount = (amount) => {
        if (!amount) return "-";
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      const getFullNames = (users) => {
        if (!users || users.length === 0) return "-";
        return (
          users
            .map((u) => `${u.fname || ""} ${u.lname || ""}`.trim())
            .filter(Boolean)
            .join(", ") || "-"
        );
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Сарлавҳа", key: "title", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Лот ИД", key: "lotId", minWidth: 12 },
        { header: "Бошланғич нарх", key: "startingPrice", minWidth: 18 },
        { header: "Кафолат суммаси", key: "guaranteeAmount", minWidth: 18 },
        { header: "Тугаш санаси", key: "lotEndDate", minWidth: 14 },
        { header: "Тендер тури", key: "tenderType", minWidth: 18 },
        { header: "Буюртмачи", key: "customer", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Вилоят", key: "objectRegion", minWidth: 16 },
        { header: "Иш муддати (кун)", key: "workDurationDays", minWidth: 16 },
        { header: "Ҳолат", key: "status", minWidth: 14 },
        { header: "Масъуллар", key: "assigned", minWidth: 22, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = lots.map((l, index) => {
        const data = {
          number: String(index + 1),
          title: l.title || "-",
          lotId: l.lotId || "-",
          startingPrice: formatAmount(l.startingPrice),
          guaranteeAmount: formatAmount(l.guaranteeAmount),
          lotEndDate: formatDate(l.lotEndDate),
          tenderType: l.tenderType || "-",
          customer: l.customer || "-",
          objectRegion: l.objectRegion || "-",
          workDurationDays: l.workDurationDays ? String(l.workDurationDays) : "-",
          status: getStatusUz(l.status),
          assigned: getFullNames(l.assigned),
          createdAt: formatDateTime(l.createdAt),
          _status: l.status,
          _startingPrice: Number(l.startingPrice || 0),
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
        const statusStyle = getStatusStyle(data._status);
        const { _status, _startingPrice, ...cleanData } = data;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Sarlavha
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Lot ID

        // Boshlang'ich narx
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

        // Kafolat summasi
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME };

        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // Tugash sanasi
        row.getCell(7).alignment = { horizontal: "center", vertical: "middle" }; // Tender turi
        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Buyurtmachi
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Viloyat
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Ish muddati

        // Holat - rangli fon
        row.getCell(11).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(11).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        row.getCell(12).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Mas'ullar
        row.getCell(13).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan sana
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

      // Umumiy summalar
      const totalStartingPrice = lots.reduce((sum, l) => sum + Number(l.startingPrice || 0), 0) / 100;
      const totalGuarantee = lots.reduce((sum, l) => sum + Number(l.guaranteeAmount || 0), 0) / 100;

      // Status bo'yicha hisoblash
      const statusCounts = {
        [LotStatus.OPEN]: 0,
        [LotStatus.LATE]: 0,
        [LotStatus.IN_PROCESS]: 0,
        [LotStatus.ENDED]: 0,
        [LotStatus.SUCCESS]: 0,
      };
      lots.forEach((l) => {
        if (statusCounts[l.status] !== undefined) statusCounts[l.status]++;
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами лотлар: ${lots.length} та`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      summaryRow.getCell(4).value = formatNumber(totalStartingPrice);
      summaryRow.getCell(4).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      summaryRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(5).value = formatNumber(totalGuarantee);
      summaryRow.getCell(5).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      summaryRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      // Status statistikasi
      const statsRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:M${summaryRowNumber + 1}`);
      statsRow.getCell(1).value = `Очиқ: ${statusCounts[LotStatus.OPEN]} | Жараёнда: ${statusCounts[LotStatus.IN_PROCESS]} | Кечиккан: ${statusCounts[LotStatus.LATE]} | Тугаган: ${
        statusCounts[LotStatus.ENDED]
      } | Муваффақиятли: ${statusCounts[LotStatus.SUCCESS]}`;
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

      const lot = await prisma.lot.findFirst({
        where: { id, isActive: true },
        include: {
          assigned: {
            where: { isActive: true },
            include: { avatar: true },
          },
          attachments: { where: { isActive: true } },
          tasks: {
            orderBy: { createdAt: "asc" },
            where: { isActive: true },
            include: {
              complatedFiles: { where: { isActive: true } },
              taskFiles: { where: { isActive: true } },
              completedBy: { include: { avatar: true } },
              assigned: {
                where: { isActive: true },
                include: { avatar: true },
              },
            },
          },
        },
      });
      if (!lot) throw new AppError(404, "lot_not_found");

      const tasksCount = lot.tasks.length;
      const completedTasksCount = lot.tasks.filter((t) => t.status === "COMPLETED").length;
      const progress = Math.floor((completedTasksCount * 100) / tasksCount);

      res.status(200).json({
        status: "success",
        data: {
          id: lot.id,
          title: lot.title,
          lotId: lot.lotId,
          startingPrice: fromMinorUnits(lot.startingPrice),
          guaranteeAmount: fromMinorUnits(lot.guaranteeAmount),
          lotEndDate: lot.lotEndDate,
          objectId: lot.objectId,
          tenderType: lot.tenderType,
          lotBranch: lot.lotBranch,
          workExecutionType: lot.workExecutionType,
          objectComplexityCategory: lot.objectComplexityCategory,
          programCategory: lot.programCategory,
          fundingSource: lot.fundingSource,
          fundingAmountCurrentYear: lot.fundingAmountCurrentYear ? fromMinorUnits(lot.fundingAmountCurrentYear) : null,
          workDurationDays: lot.workDurationDays,
          proposalSubmissionDeadline: lot.proposalSubmissionDeadline,
          customer: lot.customer,
          objectRegion: lot.objectRegion,
          objectCityDistrict: lot.objectCityDistrict,
          objectAddress: lot.objectAddress,
          contactPerson: lot.contactPerson,
          organizationDirector: lot.organizationDirector,
          organizationPhone: lot.organizationPhone,
          organizerName: lot.organizerName,
          organizationEmail: lot.organizationEmail,
          tenderFiles: lot.tenderFiles,
          status: lot.status,
          assigned: lot.assigned.map((u) => ({
            id: u.id,
            fname: u.fname,
            lname: u.lname,
            role: u.role,
            avatar: u.avatar ? { url: u.avatar.url } : null,
          })),
          createdAt: lot.createdAt,
          attachments: lot.attachments.map((a) => ({
            id: a.id,
            originalname: a.originalname,
            filesize: a.filesize,
            url: a.url,
          })),
          tasks: lot.tasks.map((t) => ({
            id: t.id,
            taskDescription: t.taskDescription,
            completedDescription: t.completedDescription,
            status: t.status,
            taskFiles: t.taskFiles.map((f) => ({
              id: f.id,
              originalname: f.originalname,
              filesize: f.filesize,
              url: f.url,
            })),
            completedFiles: t.complatedFiles.map((f) => ({
              id: f.id,
              originalname: f.originalname,
              filesize: f.filesize,
              url: f.url,
            })),
            assigned: t.assigned.map((u) => ({
              id: u.id,
              fname: u.fname,
              lname: u.lname,
              role: u.role,
              avatar: u.avatar ? { url: u.avatar.url } : null,
            })),
            completedBy: t.completedBy
              ? {
                  id: t.completedBy.id,
                  fname: t.completedBy.fname,
                  lname: t.completedBy.lname,
                  role: t.completedBy.role,
                  avatar: t.completedBy.avatar
                    ? {
                        url: t.completedBy.avatar.url,
                      }
                    : null,
                }
              : null,
            createdAt: t.createdAt,
            progress,
          })),
        },
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lot = await prisma.lot.findFirst({
        where: { isActive: true, id },
      });
      if (!lot) throw new AppError(404, "lot_not_found");

      let {
        title,
        lotId,
        startingPrice,
        guaranteeAmount,
        lotEndDate,
        objectId = null,
        tenderType = null,
        lotBranch = null,
        objectComplexityCategory = null,
        programCategory = null,
        fundingSource = null,
        fundingAmountCurrentYear,
        workDurationDays = null,
        proposalSubmissionDeadline = null,
        customer = null,
        objectRegion = null,
        objectCityDistrict = null,
        objectAddress = null,
        contactPerson = null,
        organizationDirector = null,
        organizationPhone = null,
        organizerName = null,
        organizationEmail = null,
        assigned,
      } = req.body;

      const assignedUsersId = (
        await prisma.user.findMany({
          where: {
            id: { in: assigned },
            isActive: true,
            role: { not: "SUPERADMIN" },
          },
          select: { id: true },
        })
      ).map((u) => u.id);

      await prisma.lot.update({
        where: { id },
        data: {
          title,
          lotId,
          startingPrice,
          guaranteeAmount,
          lotEndDate: new Date(lotEndDate.toISOString().slice(0, -1) + "+05:00"),
          objectId,
          tenderType,
          lotBranch,
          objectComplexityCategory,
          programCategory,
          fundingSource,
          fundingAmountCurrentYear,
          workDurationDays,
          proposalSubmissionDeadline,
          customer,
          objectRegion,
          objectCityDistrict,
          objectAddress,
          contactPerson,
          organizationDirector,
          organizationPhone,
          organizerName,
          organizationEmail,
          assigned: { set: assignedUsersId.map((id) => ({ id })) },
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

      const lot = await prisma.lot.findFirst({
        where: { id, isActive: true },
      });
      if (!lot) throw new AppError(404, "lot_not_found");

      await prisma.lot.update({
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

  async searchFromTenderMcUz(req, res, next) {
    try {
      const { lotId } = req.body;

      const r = await getFromTenderMcUz(lotId);

      if (r?.result?.data) {
        d = r.result.data;
        res.status(200).json({
          status: "success",
          data: {
            title: d.name,
            lotId: d.lotid,
            startingPrice: Number(d.start_price),
            guaranteeAmount: Number(d.required_percent_amount),
            lotEndDate: d.placement_term,
            objectId: d.gnk_id,
            tenderType: [1, 2].includes(d.lot_type) ? (d.lot_type === 1 ? "Qurilish-pudrat tashkilotini aniqlash uchun tender" : "Loyiha-qidiruv tashkilotini aniqlash uchun tender") : null,
            lotBranch: d.object_type.name,
            workExecutionType: d.service_type.name,
            objectComplexityCategory: d.complexity_category.name,
            programCategory: d.program?.name,
            fundingSource: d.financial_source?.name,
            fundingAmountCurrentYear: d.plan?.current_year_price ? Number(d.plan.current_year_price) : null,
            workDurationDays: d.end_term_work_days,
            proposalSubmissionDeadline: d.placement_term_days,
            customer: d.customer?.name,
            objectRegion: d.region?.name,
            objectCityDistrict: d.district.name,
            objectAddress: d.address,
            organizerName: d.consulting.name,
            contactPerson: d.consult_info.full_name,
            organizationPhone: d.consult_info.phone,
            organizationEmail: d.consult_info.email,
            organizationDirector: d.consult_info.organisation_director,
            tenderFiles: d.psd?.file ? "https://apisitender.mc.uz" + d.psd.file : d.loyiha_pdf?.file ? "https://apisitender.mc.uz" + d.loyiha_pdf.file : null,
          },
        });
      } else throw new AppError(404, "lot_not_found");
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createLotTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lot = await prisma.lot.findFirst({
        where: { id, isActive: true },
      });
      if (!lot) throw new AppError(404, "lot_not_found");

      const {
        body: { taskDescription, assigned },
        user: { id: createdById },
      } = req;

      const assignedResult = (
        await prisma.user.findMany({
          where: {
            id: { in: assigned },
            isActive: true,
            role: { not: "SUPERADMIN" },
          },
          select: { id: true },
        })
      ).map((u) => u.id);

      const newLotTask = await prisma.lotTask.create({
        data: {
          taskDescription,
          lotId: id,
          createdById,
          assigned: { connect: assignedResult.map((id) => ({ id })) },
        },
      });

      if (req.files && Array.isArray(req.files) && req.files.length) {
        req.lotTaskId = newLotTask.id;
        next();
      } else {
        res.status(201).json({ status: "success" });
      }
    } catch (error) {
      if (req.files) await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },

  async uploadLotTaskAttachment(req, res, next) {
    try {
      const uploadedFiles = req.uploadedFiles;

      const newAttachmentsData = uploadedFiles.map((u) => ({
        lotTaskId: req.lotTaskId,
        url: u.url,
        originalname: u.originalname,
        filename: u.filename,
        mimeType: u.mimeType,
        filesize: u.size,
        createdById: req.user.id,
      }));

      await prisma.attachment.createMany({
        data: newAttachmentsData,
      });

      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async changeLotTaskStatusToInProgress(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lotTask = await prisma.lotTask.findFirst({
        where: {
          isActive: true,
          id,
          lotId: { not: null },
          lot: { isActive: true },
        },
        include: {
          lot: { include: { assigned: true } },
          assigned: true,
        },
      });
      if (!lotTask) throw new AppError(404, "lot_task_not_found");

      const userId = req.user.id;

      if (!lotTask.assigned.some((a) => a.id === userId) && !lotTask.lot.assigned.some((a) => a.id === userId) && req.user.role !== "SUPERADMIN") {
        throw new AppError(400, "no_access");
      }

      await prisma.lotTask.update({
        where: { id },
        data: { status: "IN_PROCESS" },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async writeLotTaskCompleted(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lotTask = await prisma.lotTask.findFirst({
        where: {
          isActive: true,
          id,
          lotId: { not: null },
          lot: { isActive: true },
        },
      });
      if (!lotTask) throw new AppError(404, "lot_task_not_found");

      const {
        body: { completedDescription },
        user: { id: completedById, role },
      } = req;

      const status = role === "SUPERADMIN" ? "COMPLETED" : "CHECKING";

      await prisma.lotTask.update({
        where: { id },
        data: {
          completedDescription,
          status,
          completedById,
        },
      });

      if (req.files && Array.isArray(req.files) && req.files.length) {
        req.lotTaskComplatedId = id;
        next();
      } else {
        res.status(200).json({ status: "success" });
      }
    } catch (error) {
      if (req.files) await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },

  async uploadLotTaskCompletedAttachment(req, res, next) {
    try {
      const uploadedFiles = req.uploadedFiles;

      const newAttachmentsData = uploadedFiles.map((u) => ({
        lotTaskComplatedId: req.lotTaskComplatedId,
        url: u.url,
        originalname: u.originalname,
        filename: u.filename,
        mimeType: u.mimeType,
        filesize: u.size,
        createdById: req.user.id,
      }));

      await prisma.attachment.createMany({
        data: newAttachmentsData,
      });

      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async checkLotTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lotTask = await prisma.lotTask.findFirst({
        where: {
          id,
          isActive: true,
          lotId: { not: null },
          lot: { isActive: true },
        },
        include: { lot: true },
      });
      if (!lotTask) throw new AppError(404, "lot_task_not_found");

      await prisma.lotTask.update({
        where: { id },
        data: { status: "COMPLETED" },
      });

      const tasks = await prisma.lotTask.findMany({
        where: { isActive: true, lotId: lotTask.lotId },
      });

      if (tasks.every((t) => t.status === "COMPLETED") && lotTask.lot.status !== "ENDED") {
        await prisma.lot.update({
          where: { id: lotTask.lotId },
          data: { status: "SUCCESS" },
        });
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOneLotTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lotTask = await prisma.lotTask.findFirst({
        where: {
          id,
          isActive: true,
          lotId: { not: null },
          lot: { isActive: true },
        },
        include: { lot: true },
      });
      if (!lotTask) throw new AppError(404, "lot_task_not_found");

      const {
        body: { taskDescription, completedDescription = null, status, assigned },
        user: { id: completedById },
      } = req;

      const assignedResult = (
        await prisma.user.findMany({
          where: {
            id: { in: assigned },
            isActive: true,
            role: { not: "SUPERADMIN" },
          },
          select: { id: true },
        })
      ).map((u) => u.id);

      await prisma.lotTask.update({
        where: { id },
        data: {
          status,
          taskDescription,
          completedDescription,
          assigned: {
            set: assignedResult.map((id) => ({ id })),
          },
          ...(lotTask.status !== "CHECKING" && lotTask.status !== "COMPLETED" && (status === "COMPLETED" || status === "CHECKING") && { completedById }),
        },
      });

      const tasks = await prisma.lotTask.findMany({
        where: {
          isActive: true,
          lotId: lotTask.lotId,
        },
      });
      if (tasks.every((t) => t.status === "COMPLETED") && lotTask.lot.status !== "ENDED") {
        await prisma.lot.update({
          where: { id: lotTask.lotId },
          data: { status: "SUCCESS" },
        });
      }

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
          OR: [{ title: { contains: key, mode: "insensitive" } }, { lotId: { contains: key, mode: "insensitive" } }, { objectId: { contains: key, mode: "insensitive" } }],
        }),
      };

      const count = await prisma.lot.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [lots, totalCount] = await Promise.all([
        prisma.lot.findMany({
          where: findWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
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
        prisma.lot.count({
          where: { isActive: false },
        }),
      ]);

      res.status(200).json({
        status: "success",
        count,
        totalCount,
        totalPage,
        page,
        limit,
        data: lots.map((l) => ({
          id: l.id,
          title: l.title,
          lotId: l.lotId,
          startingPrice: fromMinorUnits(l.startingPrice),
          guaranteeAmount: fromMinorUnits(l.guaranteeAmount),
          lotEndDate: l.lotEndDate,
          objectId: l.objectId,
          tenderType: l.tenderType,
          lotBranch: l.lotBranch,
          workExecutionType: l.workExecutionType,
          objectComplexityCategory: l.objectComplexityCategory,
          programCategory: l.programCategory,
          fundingSource: l.fundingSource,
          fundingAmountCurrentYear: l.fundingAmountCurrentYear ? fromMinorUnits(l.fundingAmountCurrentYear) : null,
          workDurationDays: l.workDurationDays,
          proposalSubmissionDeadline: l.proposalSubmissionDeadline,
          customer: l.customer,
          objectRegion: l.objectRegion,
          objectCityDistrict: l.objectCityDistrict,
          objectAddress: l.objectAddress,
          contactPerson: l.contactPerson,
          organizationDirector: l.organizationDirector,
          organizationPhone: l.organizationPhone,
          organizerName: l.organizerName,
          organizationEmail: l.organizationEmail,
          tenderFiles: l.tenderFiles,
          status: l.status,
          createdAt: l.createdAt,
          deletedAt: l.deletedAt,
          createdBy: l.createdBy
            ? {
                id: l.createdBy.id,
                fname: l.createdBy.fname,
                lname: l.createdBy.lname,
                role: l.createdBy.role,
              }
            : null,
          deletedBy: l.deletedBy
            ? {
                id: l.deletedBy.id,
                fname: l.deletedBy.fname,
                lname: l.deletedBy.lname,
                role: l.deletedBy.role,
              }
            : null,
        })),
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const lot = await prisma.lot.findFirst({
        where: { id, isActive: false },
      });
      if (!lot) throw new AppError(404, "lot_not_found");

      await prisma.lot.update({
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

      const lot = await prisma.lot.findFirst({
        where: { id, isActive: false },
        include: {
          attachments: true,
          tasks: {
            include: {
              complatedFiles: true,
              taskFiles: true,
            },
          },
        },
      });
      if (!lot) throw new AppError(404, "lot_not_found");

      await prisma.lot.delete({
        where: { id },
      });

      const attachments = [];

      if (lot.attachments.length) {
        for (const a of lot.attachments) {
          attachments.push(a.filename);
        }
      }

      if (lot.tasks.length) {
        for (const t of lot.tasks) {
          if (t.complatedFiles.length) {
            for (const a of t.complatedFiles) {
              attachments.push(a.filename);
            }
          }

          if (t.taskFiles.length) {
            for (const a of t.taskFiles) {
              attachments.push(a.filename);
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
};

module.exports = lotController;
