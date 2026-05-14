const { InvoiceStatus, EntryType, EntryColor } = require("../generated/prisma");
const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { idChecker } = require("../utils/idChecker");
const { fromMinorUnits } = require("../utils/amount");
const fileService = require("../services/file.service");
const getWeekRange = require("../utils/getWeekRange");
const { deleteFilesFromS3 } = require("../utils/s3");
const callService = require("../services/call.service");
const translations = require("../constants/translation");

const allowedColumnKeys = ["date", "amount", "contractAmount", "createdAt", "updatedAt", "deletedAt"];

function selectOrg(stir) {
  if (!stir) return;
  switch (stir) {
    case "300446084":
      return "BUILDER_PROJECTS_HOUSE_REMIND_FACTURE"; // BUILDER PROJECTS HOUSE MCHJ
    case "307905616":
      return "BUYUK_ASR_BOSHI_REMIND_FACTURE"; // BUYUK ASR BOSHI MCHJ
    case "306467799":
      return "DEVELOPMENT_FORWARD_PACE_REMIND_FACTURE"; // DEVELOPMENT FORWARD PACE MCHJ
    case "306878951":
      return "RSQ_REMIND_FACTURE"; // RIVOJLANISH SARI QADAM MCHJ
    case "308198340":
      return "SHAXRAMBEK_AKROMBEK_REMIND_FACTURE"; // SHAXRAMBEK AKROMBEK MCHJ
    case "309466884":
      return "WOODEN_MASTER_EXPERT_REMIND_FACTURE"; // WOODEN MASTER EXPERT MCHJ
    case "311561910":
      return "GULOBOD_SITI_REMIND_FACTURE"; // GULOBOD SITI MCHJ
    case "307816022":
      return "SHOXRUZBEK_MAXSULOTLARI_REMIND_FACTURE"; // SHOXRUZBEK MAXSULOTLARI MCHJ
    case "310242793":
      return "UNIERSE_PRODUCTION_AND_BUILDER_REMIND_FACTURE"; // UNIERSE PRODUCTION AND BUILDER MCHJ
  }
}

const entryController = {
  async createOne(req, res, next) {
    try {
      let {
        branchId,
        type,
        organizationId,
        contractNumber,
        innStir,
        date,
        contractDate,
        lot,
        purpose,
        amount,
        contractAmount,
        poaNumber,
        color,
        invoiceStatus,
        description,
        isCardPayout,
        ownerPhone,
      } = req.body;

      organizationId = !Number.isNaN(Number(organizationId)) && Number(organizationId) > 0 && Number.isInteger(Number(organizationId)) ? Number(organizationId) : null;
      contractNumber = typeof contractNumber === "string" ? contractNumber.trim() || null : null;
      innStir = typeof innStir === "string" ? innStir.trim() || null : null;
      lot = typeof lot === "string" ? lot.trim() || null : null;
      poaNumber = typeof poaNumber === "string" ? poaNumber.trim() || null : null;
      description = typeof description === "string" ? description.trim() || null : null;
      isCardPayout = isCardPayout === "true";

      if (type === "INCOME" && contractNumber) {
        const hasContranctNumberExist = await prisma.entry.findFirst({
          where: { contractNumber },
        });
        if (hasContranctNumberExist) throw new AppError(400, "contract_number_already_exists", [{ path: "contractNumber", message: translations["contract_number_already_exists"] }]);
      }

      const branch = await prisma.branch.findFirst({
        where: { isActive: true, id: branchId },
      });
      if (!branch) {
        if (req.files) {
          if (req.files.invoiceFiles?.length) await fileService.unlinkFiles(req.files.invoiceFiles);
          if (req.files.bankAcceptanceFiles?.length) await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
        }
        throw new AppError(404, "branch_not_found");
      }

      if (invoiceStatus === InvoiceStatus.NOT_CLOSED) {
        const nowMs = Date.now();
        const currentDate = new Date(date);
        const deadLine = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 10);
        if (deadLine.getTime() < nowMs) {
          invoiceStatus = InvoiceStatus.LATE;
        }
      }

      const newEntry = await prisma.entry.create({
        data: {
          branchId,
          type,
          organizationId,
          contractNumber,
          innStir,
          date,
          contractDate,
          lot,
          purpose,
          amount,
          contractAmount,
          poaNumber,
          color,
          invoiceStatus,
          description,
          isCardPayout,
          createdById: req.user.id,
          ownerPhone,
        },
        select: { id: true },
      });

      if (req.files && (req.files.invoiceFiles?.length > 0 || req.files.bankAcceptanceFiles?.length > 0)) {
        req.entryId = newEntry.id;
        next();
      } else {
        res.status(201).json({ status: "success" });
      }
    } catch (error) {
      if (req.files) {
        if (req.files.invoiceFiles?.length) {
          await fileService.unlinkFiles(req.files.invoiceFiles);
        }
        if (req.files.bankAcceptanceFiles?.length) {
          await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
        }
      }
      next(localErrorHandler(error));
    }
  },

  async uploadInvoiceAttachments(req, res, next) {
    try {
      const { uploadedInvoiceFiles, uploadedBankAcceptanceFiles, entryId } = req;
      const newAttachmentsData = [];
      if (uploadedInvoiceFiles?.length > 0) {
        uploadedInvoiceFiles.forEach((u) => {
          newAttachmentsData.push({
            invoiceEntryId: entryId,
            url: u.url,
            originalname: u.originalname,
            filename: u.filename,
            mimeType: u.mimeType,
            filesize: u.size,
            createdById: req.user.id,
          });
        });
      }
      if (uploadedBankAcceptanceFiles?.length > 0) {
        uploadedBankAcceptanceFiles.forEach((u) => {
          newAttachmentsData.push({
            bankAcceptanceEntryId: entryId,
            url: u.url,
            originalname: u.originalname,
            filename: u.filename,
            mimeType: u.mimeType,
            filesize: u.size,
            createdById: req.user.id,
          });
        });
      }

      if (newAttachmentsData.length) {
        await prisma.attachment.createMany({
          data: newAttachmentsData,
        });
      }

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let { page, limit, sort, date, start, end, reverse, organization, isCardPayout, type, invoiceStatus, color } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      sort = allowedColumnKeys.includes(sort) ? sort : "date";
      start = typeof start === "string" && !isNaN(Date.parse(start)) ? new Date(start) : null;
      end = typeof end === "string" && !isNaN(new Date(end).getTime()) ? new Date(end) : null;
      reverse = reverse === "false" ? false : true;
      organization = !isNaN(Number(organization)) && Number(organization) > 0 && Number.isInteger(Number(organization)) ? Number(organization) : null;
      isCardPayout = isCardPayout === "true";
      type = Object.values(EntryType).includes(type) ? type : null;
      invoiceStatus = Object.values(InvoiceStatus).includes(invoiceStatus) ? invoiceStatus : null;
      color = Object.values(EntryColor).includes(color) ? color : null;

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

      const findWhere = {
        isActive: true,
        ...(type && { type }),
        ...(organization && { organizationId: organization }),
        ...(isCardPayout && { isCardPayout }),
        ...(invoiceStatus && { invoiceStatus }),
        ...(color && { color }),
        ...((start || end) && { date: { ...(start && { gte: start }), ...(end && { gte: end }) } }),
      };

      const count = await prisma.entry.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [entries, grouped, aggCardPayouts, invoicesGrouped] = await Promise.all([
        prisma.entry.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: { createdBy: { omit: { password: true } }, invoiceFiles: true, organization: true },
        }),
        prisma.entry.groupBy({ by: ["type"], _sum: { amount: true }, _count: true, where: { isActive: true } }),
        prisma.entry.aggregate({ where: { isActive: true, isCardPayout: true }, _count: true, _sum: { amount: true } }),
        prisma.entry.groupBy({ by: ["invoiceStatus"], _count: true, where: { isActive: true, invoiceStatus: { not: "NO_INVOICE" } } }),
      ]);

      const amountIncomes = grouped.find((g) => g.type === "INCOME")?._sum.amount || 0;
      const amountExpenses = grouped.find((g) => g.type === "EXPENSE")?._sum.amount || 0;

      const totals = {
        countIncomes: grouped.find((g) => g.type === "INCOME")?._count || 0,
        countExpenses: grouped.find((g) => g.type === "EXPENSE")?._count || 0,
        amountIncomes: fromMinorUnits(amountIncomes),
        amountExpenses: fromMinorUnits(amountExpenses),
        countCardPayouts: aggCardPayouts?._count || 0,
        amountCardPayouts: fromMinorUnits(aggCardPayouts?._sum?.amount),
        countInvoices: invoicesGrouped.reduce((sum, g) => sum + g._count, 0),
        countNotClosedInvoices: invoicesGrouped.reduce((sum, g) => sum + (g.invoiceStatus !== "CLOSED" ? g._count : 0), 0),
      };

      const result = entries.map((e) => ({
        id: e.id,
        contractNumber: e.contractNumber,
        innStir: e.innStir,
        date: e.date,
        contractDate: e.contractDate,
        lot: e.lot,
        purpose: e.purpose,
        poaNumber: e.poaNumber,
        color: e.color,
        type: e.type,
        isCardPayout: e.isCardPayout,
        invoiceStatus: e.invoiceStatus,
        description: e.description,
        amount: fromMinorUnits(e.amount),
        contractAmount: fromMinorUnits(e.contractAmount),
        createdBy: e.createdBy
          ? {
              id: e.createdBy.id,
              fname: e.createdBy.fname,
              lname: e.createdBy.lname,
              role: e.createdBy.role,
            }
          : null,
        organization: e.organization
          ? {
              id: e.organization.id,
              organizationName: e.organization.organizationName,
            }
          : null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));

      res.status(200).json({
        status: "success",
        data: result,
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

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const entry = await prisma.entry.findFirst({
        where: { id, isActive: true },
        include: {
          createdBy: {
            omit: { password: true },
          },
          bankAcceptanceFiles: true,
          invoiceFiles: true,
          organization: true,
          branch: true,
        },
      });
      if (!entry) throw new AppError(404, "entry_not_found");

      const result = {
        id: entry.id,
        contractNumber: entry.contractNumber,
        innStir: entry.innStir,
        date: entry.date,
        contractDate: entry.contractDate,
        lot: entry.lot,
        purpose: entry.purpose,
        amount: fromMinorUnits(entry.amount),
        contractAmount: fromMinorUnits(entry.contractAmount),
        poaNumber: entry.poaNumber,
        color: entry.color,
        type: entry.type,
        isCardPayout: entry.isCardPayout,
        invoiceStatus: entry.invoiceStatus,
        description: entry.description,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        ownerPhone: entry.ownerPhone,
        branch: entry.branch
          ? {
              id: entry.branch.id,
              name: entry.branch.name,
              stir: entry.branch.stir,
            }
          : null,
        invoiceFiles: entry.invoiceFiles.map((f) => ({
          id: f.id,
          originalname: f.originalname,
          mimeType: f.mimeType,
          filesize: f.filesize,
          url: f.url,
        })),
        bankAcceptanceFiles: entry.bankAcceptanceFiles.map((f) => ({
          id: f.id,
          originalname: f.originalname,
          mimeType: f.mimeType,
          filesize: f.filesize,
          url: f.url,
        })),
        organization: entry.organization
          ? {
              id: entry.organization.id,
              organizationName: entry.organization.organizationName,
            }
          : null,
        createdBy: entry.createdBy
          ? {
              id: entry.createdBy.id,
              fname: entry.createdBy.fname,
              lname: entry.createdBy.lname,
              role: entry.createdBy.role,
            }
          : null,
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

      const entry = await prisma.entry.findFirst({
        where: { id, isActive: true },
        include: {
          createdBy: {
            omit: { password: true },
          },
          bankAcceptanceFiles: true,
          invoiceFiles: true,
          organization: true,
        },
      });
      if (!entry) throw new AppError(404, "entry_not_found");

      let { contractNumber, innStir, date, contractDate, lot, purpose, amount, contractAmount, poaNumber, color, type, isCardPayout, invoiceStatus, description, organizationId, ownerPhone } =
        req.body;

      if (invoiceStatus === InvoiceStatus.NOT_CLOSED) {
        const nowMs = Date.now();
        const currentDate = new Date(date);
        const deadLine = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 10);
        if (deadLine.getTime() < nowMs) {
          invoiceStatus = InvoiceStatus.LATE;
        }
      }

      await prisma.entry.update({
        where: { id },
        data: {
          type,
          organizationId,
          contractNumber,
          innStir,
          date,
          contractDate,
          lot,
          purpose,
          amount,
          contractAmount,
          poaNumber,
          color,
          invoiceStatus,
          description,
          isCardPayout,
          ownerPhone,
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

      const entry = await prisma.entry.findFirst({
        where: { id, isActive: true },
      });
      if (!entry) throw new AppError(404, "entry_not_found");

      await prisma.entry.update({
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

  async closeTheInvoice(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) {
        if (req.files.invoiceFiles?.length) await fileService.unlinkFiles(req.files.invoiceFiles);
        if (req.files.bankAcceptanceFiles?.length) await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
        throw new AppError(400, "bad_request");
      }

      const entry = await prisma.entry.findFirst({
        where: { id, isActive: true },
      });
      if (!entry) {
        if (req.files.invoiceFiles?.length) await fileService.unlinkFiles(req.files.invoiceFiles);
        if (req.files.bankAcceptanceFiles?.length) await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
        throw new AppError(404, "entry_not_found");
      }

      const { description } = req.body;
      await prisma.entry.update({
        where: { id },
        data: {
          description,
          invoiceStatus: "CLOSED",
        },
      });

      if (req.files && (req.files.invoiceFiles?.length > 0 || req.files.bankAcceptanceFiles?.length > 0)) {
        req.entryId = id;
        next();
      } else {
        res.status(201).json({ status: "success" });
      }
    } catch (error) {
      if (req.files.invoiceFiles?.length) await fileService.unlinkFiles(req.files.invoiceFiles);
      if (req.files.bankAcceptanceFiles?.length) await fileService.unlinkFiles(req.files.bankAcceptanceFiles);
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { page, limit, sort, reverse, organization, isCardPayout, type, invoiceStatus, color } = req.query;

      page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      sort = allowedColumnKeys.includes(sort) ? sort : "deletedAt";
      reverse = reverse !== "false";
      organization = !isNaN(Number(organization)) && Number(organization) > 0 && Number.isInteger(Number(organization)) ? Number(organization) : null;
      isCardPayout = isCardPayout === "true";
      type = Object.values(EntryType).includes(type) ? type : null;
      color = Object.values(EntryColor).includes(color) ? color : null;

      const findWhere = {
        isActive: false,
        ...(type && { type }),
        ...(organization && { organizationId: organization }),
        ...(isCardPayout && { isCardPayout }),
        ...(color && { color }),
      };

      const count = await prisma.entry.count({
        where: findWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [entries] = await Promise.all([
        prisma.entry.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            deletedBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
              },
            },
            organization: {
              where: { isActive: true },
              select: {
                id: true,
                organizationName: true,
              },
            },
          },
        }),
      ]);

      const result = entries.map((e) => ({
        id: e.id,
        contractNumber: e.contractNumber,
        innStir: e.innStir,
        date: e.date,
        contractDate: e.contractDate,
        lot: e.lot,
        purpose: e.purpose,
        poaNumber: e.poaNumber,
        color: e.color,
        type: e.type,
        isCardPayout: e.isCardPayout,
        invoiceStatus: e.invoiceStatus,
        description: e.description,
        amount: e.amount,
        contractAmount: e.contractAmount,
        deletedBy: e.deletedBy,
        organization: e.organization,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        deletedAt: e.deletedAt,
      }));

      res.status(200).json({
        status: "success",
        data: result,
        sort,
        reverse,
        limit,
        page,
        totalPage,
        totalCount: count,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const entry = await prisma.entry.findFirst({
        where: { isActive: false, id },
      });
      if (!entry) throw new AppError(404, "entry_not_found");

      await prisma.entry.update({
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

      const entry = await prisma.entry.findFirst({ where: { isActive: false, id }, include: { bankAcceptanceFiles: true, invoiceFiles: true } });
      if (!entry) throw new AppError(404, "entry_not_found");

      await prisma.entry.delete({ where: { id } });

      const attachments = [];

      if (entry.bankAcceptanceFiles.length) {
        for (const f of entry.bankAcceptanceFiles) {
          attachments.push(f.filename);
        }
      }

      if (entry.invoiceFiles.length) {
        for (const f of entry.invoiceFiles) {
          attachments.push(f.filename);
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

  async manuallyCall(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const entry = await prisma.entry.findFirst({
        where: { id, isActive: true },
        include: { branch: true },
      });
      if (!entry) throw new AppError(404, "entry_not_found");
      if (!entry.ownerPhone) throw new AppError(400, "no_owner_phone");

      if (entry.branch && entry.ownerPhone) {
        const key = selectOrg(entry.branch.stir);
        if (key) {
          const hasCall = await callService.call(entry.ownerPhone, key);
          if (!hasCall) throw new AppError(400, "retry_later");
        }
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = entryController;
