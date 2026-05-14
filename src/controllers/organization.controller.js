const { OrganizationStatus } = require("../lib/prisma");
const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { fromMinorUnits } = require("../utils/amount");

const allowedColumnKeys = ["organizationName", "stirNumber", "ownerName", "ownerPhone", "sellerPhone", "status", "createdAt"];

const organizationController = {
  async createOne(req, res, next) {
    try {
      const {
        body: { organization_name: organizationName, stir_number: stirNumber, owner_name: ownerName, owner_phone: ownerPhone, seller_phone: sellerPhone, location },
        user: { id: userId },
      } = req;

      await prisma.$transaction(async (tx) => {
        let locationId = null;
        if (location && typeof location === "object") {
          const newLocation = await tx.location.create({
            data: {
              lat: location.lat,
              lon: location.lon,
            },
            select: {
              id: true,
              lat: true,
              lon: true,
            },
          });
          locationId = newLocation.id;
        }

        await tx.organization.create({
          data: {
            organizationName,
            stirNumber,
            ownerName,
            ownerPhone,
            sellerPhone,
            createdById: userId,
            locationId,
          },
        });
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
      let { page, limit, sort, reverse, status, key } = req.query;

      key = typeof key === "string" ? key.trim() : null;
      page = !Number.isNaN(page) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(limit) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      let findWhere = {
        isActive: true,
        ...(Object.values(OrganizationStatus).includes(status) && { status }),
        ...(key && {
          OR: [
            { organizationName: { contains: key, mode: "insensitive" } },
            { stirNumber: { contains: key, mode: "insensitive" } },
            { ownerName: { contains: key, mode: "insensitive" } },
            { ownerPhone: { contains: key, mode: "insensitive" } },
            { sellerPhone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };
      const count = await prisma.organization.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [organizations, grouped] = await Promise.all([
        prisma.organization.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            organizationName: true,
            stirNumber: true,
            ownerName: true,
            ownerPhone: true,
            sellerPhone: true,
            address: true,
            status: true,
            balance: true,
            totalExpense: true,
            totalIncome: true,
            parent: { where: { isActive: true }, select: { id: true, organizationName: true } },
            branches: { where: { isActive: true }, select: { id: true } },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.organization.groupBy({ by: ["status"], _count: true, where: { isActive: true } }),
      ]);

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        reverse,
        totalPage,
        totals: {
          countOfActive: grouped.find((g) => g.status === OrganizationStatus.ACTIVE)?._count || 0,
          countOfNotActive: grouped.find((g) => g.status === OrganizationStatus.NOT_ACTIVE)?._count || 0,
          totalCount: grouped.reduce((sum, g) => sum + g._count, 0),
        },
        data: organizations,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      let { sort = "createdAt", reverse = "true", status = "ALL" } = req.query;

      reverse = reverse === "false" ? false : true;
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      let findWhere = {
        isActive: true,
        ...(Object.values(OrganizationStatus).includes(status) && { status }),
      };

      const organizations = await prisma.organization.findMany({
        orderBy: { [sort]: reverse === true ? "desc" : "asc" },
        where: findWhere,
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          status: true,
          balance: true,
          totalExpense: true,
          totalIncome: true,
          parent: { where: { isActive: true }, select: { id: true, organizationName: true } },
          branches: { where: { isActive: true }, select: { id: true } },
          createdAt: true,
          updatedAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Tashkilotlar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 35;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getStatusStyle = (status) => {
        const styles = {
          [OrganizationStatus.ACTIVE]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [OrganizationStatus.NOT_ACTIVE]: { bgColor: "FFFFCDD2", fontColor: "FFC62828" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [OrganizationStatus.ACTIVE]: "Фаол",
          [OrganizationStatus.NOT_ACTIVE]: "Фаол эмас",
        };
        return statuses[status] || "";
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
        return Number(num)/* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatBalance = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Ташкилот номи", key: "organizationName", minWidth: 25, maxWidth: MAX_WIDTH },
        { header: "СТИР", key: "stirNumber", minWidth: 12 },
        { header: "Раҳбар", key: "ownerName", minWidth: 20 },
        { header: "Раҳбар тел.", key: "ownerPhone", minWidth: 15 },
        { header: "Сотувчи тел.", key: "sellerPhone", minWidth: 15 },
        { header: "Ҳолати", key: "status", minWidth: 12 },
        { header: "Баланс", key: "balance", minWidth: 18 },
        { header: "Умумий кирим", key: "totalIncome", minWidth: 18 },
        { header: "Умумий чиқим", key: "totalExpense", minWidth: 18 },
        { header: "Бош ташкилот", key: "parent", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Филиаллар сони", key: "branchesCount", minWidth: 14 },
        { header: "Яратилган", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      // Max uzunliklar
      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = organizations.map((org, index) => {
        const data = {
          number: String(index + 1),
          organizationName: org.organizationName || "",
          stirNumber: org.stirNumber || "",
          ownerName: org.ownerName || "",
          ownerPhone: org.ownerPhone || "",
          sellerPhone: org.sellerPhone || "",
          status: getStatusUz(org.status),
          balance: formatBalance(org.balance),
          totalIncome: formatBalance(org.totalIncome),
          totalExpense: formatBalance(org.totalExpense),
          parent: org.parent?.organizationName || "-",
          branchesCount: String(org.branches?.length || 0),
          createdAt: formatDate(org.createdAt),
          _status: org.status, // Stil uchun
          _balance: Number(org.balance), // Balans rangi uchun
        };

        // Max uzunliklarni yangilash
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
        const { _status, _balance, ...cleanData } = data;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Tashkilot nomi
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // STIR
        row.getCell(4).alignment = { horizontal: "left", vertical: "middle" }; // Rahbar
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" }; // Rahbar tel.
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // Sotuvchi tel.

        // Status - rangli
        row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(7).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        // Balans - rangli
        row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(8).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _balance >= 0 ? "FF2E7D32" : "FFC62828" },
        };

        // Kirim - yashil
        row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(9).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

        // Chiqim - qizil
        row.getCell(10).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(10).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };

        row.getCell(11).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Bosh tashkilot
        row.getCell(12).alignment = { horizontal: "center", vertical: "middle" }; // Filiallar soni
        row.getCell(13).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan
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

      // Jami tashkilotlar
      const totalRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:G${summaryRowNumber}`);
      totalRow.getCell(1).value = `Жами ташкилотлар: ${organizations.length}`;
      totalRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      // Umumiy balans
      const totalBalance = organizations.reduce((sum, o) => sum + Number(o.balance), 0) / 100;
      const totalIncome = organizations.reduce((sum, o) => sum + Number(o.totalIncome), 0) / 100;
      const totalExpense = organizations.reduce((sum, o) => sum + Number(o.totalExpense), 0) / 100;

      totalRow.getCell(8).value = formatNumber(totalBalance);
      totalRow.getCell(8).font = {
        bold: true,
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: totalBalance >= 0 ? "FF2E7D32" : "FFC62828" },
      };
      totalRow.getCell(8).alignment = { horizontal: "right", vertical: "middle" };

      totalRow.getCell(9).value = formatNumber(totalIncome);
      totalRow.getCell(9).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      totalRow.getCell(9).alignment = { horizontal: "right", vertical: "middle" };

      totalRow.getCell(10).value = formatNumber(totalExpense);
      totalRow.getCell(10).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      totalRow.getCell(10).alignment = { horizontal: "right", vertical: "middle" };

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

      const organization = await prisma.organization.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          address: true,
          parent: {
            where: { isActive: true },
            select: {
              id: true,
              organizationName: true,
              stirNumber: true,
              ownerName: true,
              ownerPhone: true,
              sellerPhone: true,
              address: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          branches: {
            where: { isActive: true },
            select: {
              id: true,
              organizationName: true,
              stirNumber: true,
              ownerName: true,
              ownerPhone: true,
              sellerPhone: true,
              address: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!organization) throw new AppError(404, "organization_not_found");

      res.status(200).json({
        status: "success",
        data: organization,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { location, organization_name: organizationName, stir_number: stirNumber, owner_name: ownerName, owner_phone: ownerPhone, seller_phone: sellerPhone } = req.body;

      const organization = await prisma.organization.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          organizationName: true,
          address: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          stirNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!organization) throw new AppError(404, "organization_not_found");

      await prisma.$transaction(async (tx) => {
        if (location && typeof location === "object" && (location.lat !== Number(organization.address.lat) || location.lon !== Number(organization.address.lon))) {
          await tx.location.update({
            where: { id: organization.address.id },
            data: { lat: location.lat, lon: location.lon },
          });
        }

        await tx.organization.update({
          where: { isActive: true, id },
          data: {
            organizationName,
            stirNumber,
            ownerName,
            ownerPhone,
            sellerPhone,
          },
          select: {
            id: true,
            organizationName: true,
            address: true,
            ownerName: true,
            ownerPhone: true,
            sellerPhone: true,
            stirNumber: true,
            createdAt: true,
            updatedAt: true,
          },
        });
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

      const organization = await prisma.organization.findFirst({ where: { isActive: true, id } });
      if (!organization) throw new AppError(404, "organization_not_found");

      await prisma.organization.update({
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

  async createBranch(req, res, next) {
    try {
      const { parent_id: parentId, location } = req.body;

      const parent = await prisma.organization.findFirst({ where: { isActive: true, id: parentId } });
      if (!parent) throw new AppError(404, "organization_not_found");

      await tx.$transaction(async (tx) => {
        let locationId = null;
        if (location !== undefined && location !== null && typeof location === "object") {
          const newLocation = await tx.location.create({
            data: {
              lat: location.lat,
              lon: location.lon,
            },
            select: {
              id: true,
              lat: true,
              lon: true,
            },
          });
          locationId = newLocation.id;
        }

        await prisma.organization.create({
          data: {
            organizationName: req.body.organization_name,
            stirNumber: req.body.stir_number,
            ownerName: req.body.owner_name,
            ownerPhone: req.body.owner_phone,
            sellerPhone: req.body.seller_phone,
            createdById: req.user.id,
            locationId,
            parentId,
          },
        });
        return;
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { page, limit, sort, reverse, status, key } = req.query;

      key = typeof key === "stirng" ? key.trim() : null;
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "false" ? false : true;
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      let findWhere = {
        isActive: false,
        ...(key && {
          OR: [
            { organizationName: { contains: key, mode: "insensitive" } },
            { stirNumber: { contains: key, mode: "insensitive" } },
            { ownerName: { contains: key, mode: "insensitive" } },
            { ownerPhone: { contains: key, mode: "insensitive" } },
            { sellerPhone: { contains: key, mode: "insensitive" } },
          ],
        }),
        ...(Object.values(OrganizationStatus).includes(status) && { status }),
      };

      const count = await prisma.organization.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const organizations = await prisma.organization.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        take: limit,
        skip: (page - 1) * limit,
        where: findWhere,
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          address: true,
          status: true,
          parent: { where: { isActive: true }, select: { id: true, organizationName: true } },
          branches: { where: { isActive: true }, select: { id: true } },
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
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalPage,
        totalCount: count,
        reverse,
        data: organizations,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async search(req, res, next) {
    try {
      const key = typeof req.query.key === "string" ? req.query.key.trim() : null;

      let findWhere = {
        isActive: true,
        ...(key && {
          OR: [
            { organizationName: { contains: key, mode: "insensitive" } },
            { stirNumber: { contains: key, mode: "insensitive" } },
            { ownerName: { contains: key, mode: "insensitive" } },
            { ownerPhone: { contains: key, mode: "insensitive" } },
            { sellerPhone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const organizations = await prisma.organization.findMany({
        orderBy: { organizationName: "asc" },
        where: findWhere,
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          address: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        status: "success",
        data: organizations,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteAbsolute(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const organization = await prisma.organization.findFirst({ where: { isActive: false }, id });
      if (!organization) throw new AppError(404, "organization_not_found");

      await prisma.organization.delete({ where: { id } });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const organization = await prisma.organization.findFirst({ where: { isActive: false }, id });
      if (!organization) throw new AppError(404, "organization_not_found");

      await prisma.organization.update({
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

  async getOrganizationTransfers(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const organization = await prisma.organization.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          balance: true,
          totalExpense: true,
          totalIncome: true,
          address: true,
          status: true,
          transfersFrom: {
            where: { isActive: true },
            select: {
              id: true,
              amount: true,
              note: true,
              isActive: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              createdAt: true,
            },
          },
        },
      });
      if (!organization) throw new AppError(404, "organization_not_found");

      const { transfersFrom, ...safeOrganization } = organization;
      const result = {
        ...safeOrganization,
        transfers: transfersFrom,
        address: {
          lat: organization.address.lat,
          lon: organization.address.lon,
          url: `https://yandex.uz/maps/?pt=${organization.address?.lon},${organization.address?.lat}&z=16`,
        },
      };

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneOrganizationTransfersWithPagination(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const organization = await prisma.organization.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          balance: true,
          totalExpense: true,
          totalIncome: true,
          address: true,
          status: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!organization) throw new AppError(404, "organization_not_found");

      let { page, limit, sort, reverse } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "false" ? false : true;
      sort = ["createdAt"].includes(sort) ? sort : "createdAt";

      const findWhere = {
        isActive: true,
        OR: [{ toOrganizationId: id }, { fromOrganizationId: id }],
      };
      const count = await prisma.fundTransfer.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const transfers = await prisma.fundTransfer.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          amount: true,
          note: true,
          contractNumber: true,
          createdBy: {
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
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        organization,
        data: transfers,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneOrganizationTransactionsWithPagination(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const organization = await prisma.organization.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          balance: true,
          totalExpense: true,
          totalIncome: true,
          address: true,
          status: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!organization) throw new AppError(404, "organization_not_found");

      let { page, limit, sort, reverse } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = ["createdAt"].includes(sort) ? sort : "createdAt";

      const findWhere = { isActive: true, organizationId: id };
      const count = await prisma.transaction.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const transactions = await prisma.transaction.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        take: limit,
        skip: (page - 1) * limit,
        where: findWhere,
        select: {
          id: true,
          amount: true,
          purpose: true,
          notes: true,
          date: true,
          isReviewed: true,
          usedFromOrganizationBalance: true,
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
            },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              originalname: true,
              filesize: true,
              mimeType: true,
              url: true,
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              avatar: {
                select: {
                  url: true,
                },
              },
              role: true,
            },
          },
          createdAt: true,
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
        organization,
        data: transactions,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAllWithoutBalance(req, res, next) {
    try {
      let { page, limit, sort, reverse, status, key } = req.query;

      key = typeof key === "string" ? key.trim() : null;
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      let findWhere = {
        isActive: true,
        ...(key && {
          OR: [
            { organizationName: { contains: key, mode: "insensitive" } },
            { stirNumber: { contains: key, mode: "insensitive" } },
            { ownerName: { contains: key, mode: "insensitive" } },
            { ownerPhone: { contains: key, mode: "insensitive" } },
            { sellerPhone: { contains: key, mode: "insensitive" } },
          ],
        }),
        ...(Object.values(OrganizationStatus).includes(status) && { status }),
      };

      const count = await prisma.organization.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [organizations, grouped] = await Promise.all([
        prisma.organization.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          select: {
            id: true,
            organizationName: true,
            stirNumber: true,
            ownerName: true,
            ownerPhone: true,
            sellerPhone: true,
            address: true,
            status: true,
            parent: { where: { isActive: true }, select: { id: true, organizationName: true } },
            branches: { where: { isActive: true }, select: { id: true } },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.organization.groupBy({ by: ["status"], _count: true, where: { isActive: true } }),
      ]);

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalPage,
        totals: {
          countOfActive: grouped.find((g) => g.status === OrganizationStatus.ACTIVE)?._count || 0,
          countOfNotActive: grouped.find((g) => g.status === OrganizationStatus.NOT_ACTIVE)?._count || 0,
          totalCount: grouped.reduce((sum, g) => sum + (g._count || 0), 0),
        },
        reverse,
        data: organizations,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransactionsFromOneOrganization(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const organization = await prisma.organization.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          organizationName: true,
          stirNumber: true,
          ownerName: true,
          ownerPhone: true,
          sellerPhone: true,
          address: true,
          status: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!organization) throw new AppError(404, "organization_not_found");

      let { page, limit, sort, reverse } = req.query;
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = ["createdAt"].includes(sort) ? sort : "createdAt";

      const findWhere = { isActive: true, organizationId: id, createdById: req.user.id };
      const count = await prisma.transaction.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const transactions = await prisma.transaction.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          amount: true,
          notes: true,
          date: true,
          isReviewed: true,
          usedFromOrganizationBalance: true,
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              originalname: true,
              filesize: true,
              mimeType: true,
              url: true,
            },
          },
          createdBy: {
            where: { isActive: true },
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
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        organization,
        data: transactions,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOrgNames(req, res, next) {
    try {
      const key = typeof req.query.key === "string" ? key.tirm() : null;

      const orgs = await prisma.organization.findMany({
        where: {
          isActive: true,
          ...(key && {
            OR: [{ organizationName: { contains: key, mode: "insensitive" } }, { ownerPhone: { contains: key, mode: "insensitive" } }, { sellerPhone: { contains: key, mode: "insensitive" } }],
          }),
        },
        select: {
          id: true,
          organizationName: true,
          ownerPhone: true,
          sellerPhone: true,
        },
      });

      res.status(200).json({
        status: "success",
        data: orgs,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = organizationController;
