const { CounterPartyType } = require("../generated/prisma");
const prisma = require("../lib/prisma");
const debtService = require("../services/debt.service");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const allowedColumnKeys = ["counterpartyName", "counterpartyPhone", "counterPartyType", "amount", "paidAmount", "remainingAmount", "issuedAt", "dueAt", "status", "type", "createdAt", "updatedAt"];

const debtController = {
  async createOne(req, res, next) {
    try {
      await debtService.create(req.body, req.user.id);
      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let { page, limit, sort, counterPartyType, reverse, key } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "counterpartyName";

      const findWhere = {
        isActive: true,
        ...(key && {
          OR: [{ counterpartyName: { contains: key, mode: "insensitive" } }, { counterpartyPhone: { contains: key, mode: "insensitive" } }],
        }),
        ...([CounterPartyType.INDIVIDUAL, CounterPartyType.COMPANY].includes(counterPartyType) && { counterPartyType }),
      };

      const count = await prisma.debt.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [debts, statusStats] = await Promise.all([
        prisma.debt.findMany({
          orderBy: { [sort === "amount" ? "totalAmount" : sort]: reverse ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          include: {
            organization: {
              where: { isActive: true },
              select: {
                id: true,
                ownerName: true,
                organizationName: true,
                ownerPhone: true,
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
              },
            },
            _count: {
              select: {
                items: { where: { isActive: true } },
                transactions: { where: { isActive: true } },
              },
            },
          },
        }),
        prisma.debt.groupBy({
          by: ["status"],
          where: { isActive: true },
          _count: { _all: true },
        }),
      ]);

      const result = debts.map((debt) => ({
        id: debt.id,
        counterpartyName: debt.counterpartyName,
        counterpartyPhone: debt.counterpartyPhone,
        amount: debt.totalAmount,
        paidAmount: debt.paidAmount,
        remainingAmount: debt.remainingAmount,
        issuedAt: debt.issuedAt,
        dueAt: debt.dueAt,
        type: debt.type,
        status: debt.status,
        note: debt.note,
        counterPartyType: debt.counterPartyType,
        smsBefore: debt.smsBefore,
        smsLate: debt.smsLate,
        callBefore: debt.callBefore,
        callLate: debt.callLate,
        organization: debt.organization,
        isDollar: debt.isDollar,
        createdAt: debt.createdAt,
        updatedAt: debt.updatedAt,
        numberOfItems: debt._count.items,
        numberOfTransactions: debt._count.transactions,
        _count: undefined,
        createdBy: debt.createdBy ? { ...debt.createdBy } : null,
      }));

      const statusCount = { OPEN: 0, PARTIAL: 0, CLOSED: 0, OVERDUE: 0, OVERPAID: 0, TOTAL: 0 };
      for (const s of statusStats) {
        if (s.status) statusCount[s.status] = s._count._all;
      }
      statusCount.OPEN += statusCount.PARTIAL;
      delete statusCount.PARTIAL;
      statusCount.TOTAL = Object.values(statusCount).reduce((sum, v) => sum + v, 0);
      statusCount.OPEN += statusCount.OVERDUE;

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: result,
        totals: statusCount,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const debt = await debtService.getOne(id);
      res.status(200).json({ status: "success", data: debt });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await debtService.update(id, req.body, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await debtService.delete(id, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { page, limit, sort, reverse, counterPartyType } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";
      counterPartyType = Object.values(CounterPartyType).includes(counterPartyType) ? counterPartyType : null;

      const findWhere = { isActive: false, ...(counterPartyType && { counterPartyType }) };

      const count = await prisma.debt.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const debts = await prisma.debt.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          counterpartyName: true,
          counterpartyPhone: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
          issuedAt: true,
          dueAt: true,
          type: true,
          status: true,
          counterPartyType: true,
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
        totalCount: count,
        totalPage,
        data: debts,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await debtService.restore(id, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDeleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const debt = await prisma.debt.findFirst({ where: { id, isActive: false } });
      if (!debt) throw new AppError(404, "debt_not_found");

      await prisma.debt.delete({ where: { id } });

      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  // ==================== JISMONIY: TRANSACTIONS ====================

  async addTransaction(req, res, next) {
    try {
      const debtId = idChecker(req.params.id);
      if (!debtId) throw new AppError(400, "bad_request");

      await debtService.addTransaction(debtId, req.body, req.user.id);
      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateTransaction(req, res, next) {
    try {
      const transactionId = idChecker(req.params.transactionId);
      if (!transactionId) throw new AppError(400, "bad_request");

      await debtService.updateTransaction(transactionId, req.body, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteTransaction(req, res, next) {
    try {
      const transactionId = idChecker(req.params.transactionId);
      if (!transactionId) throw new AppError(400, "bad_request");

      await debtService.deleteTransaction(transactionId, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  // ==================== YURIDIK: ITEMS ====================

  async addItem(req, res, next) {
    try {
      const debtId = idChecker(req.params.id);
      if (!debtId) throw new AppError(400, "bad_request");

      await debtService.addItem(debtId, req.body, req.user.id);
      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateItem(req, res, next) {
    try {
      const itemId = idChecker(req.params.itemId);
      if (!itemId) throw new AppError(400, "bad_request");

      await debtService.updateItem(itemId, req.body, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteItem(req, res, next) {
    try {
      const itemId = idChecker(req.params.itemId);
      if (!itemId) throw new AppError(400, "bad_request");

      await debtService.deleteItem(itemId, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  // ==================== YURIDIK: PAYMENTS ====================

  async addPayment(req, res, next) {
    try {
      const debtId = idChecker(req.params.id);
      if (!debtId) throw new AppError(400, "bad_request");

      await debtService.addPayment(debtId, req.body, req.user.id);
      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updatePayment(req, res, next) {
    try {
      const paymentId = idChecker(req.params.paymentId);
      if (!paymentId) throw new AppError(400, "bad_request");

      await debtService.updatePayment(paymentId, req.body, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deletePayment(req, res, next) {
    try {
      const paymentId = idChecker(req.params.paymentId);
      if (!paymentId) throw new AppError(400, "bad_request");

      await debtService.deletePayment(paymentId, req.user.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  // ==================== AUDIT LOGS ====================

  async getAuditLogs(req, res, next) {
    try {
      const debtId = idChecker(req.params.id);
      if (!debtId) throw new AppError(400, "bad_request");

      const { page, limit } = req.query;
      const result = await debtService.getAuditLogs(debtId, {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });

      res.status(200).json({ status: "success", ...result });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  // ==================== EXCEL DOCS ====================

  async getDebtsExcel(_req, res, next) {
    try {
      const buffer = await debtService.getDebtsExcel();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDebtItemsExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const buffer = await debtService.getDebtItemsExcel(id);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDebtHistoryExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const buffer = await debtService.getDebtHistoryExcel(id);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = debtController;
