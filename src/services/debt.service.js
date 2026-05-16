const prisma = require("../lib/prisma");
const { DebtStatus, DebtAuditAction, CounterPartyType, DebtTransactionType, Unit } = require("../generated/prisma");
const AppError = require("../utils/AppError");
const ExcelJS = require("exceljs");
const { fromMinorUnits } = require("../utils/amount");

class DebtService {
  // ==================== HELPERS ====================

  serializeForJson(obj) {
    return JSON.parse(JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  }

  calculateStatus(totalAmount, paidAmount, dueAt) {
    const now = Date.now();
    const dueTime = new Date(dueAt).getTime();

    if (totalAmount === 0n) return DebtStatus.CLOSED;
    if (paidAmount > totalAmount) return DebtStatus.OVERPAID;
    if (paidAmount === totalAmount) return DebtStatus.CLOSED;
    if (paidAmount > 0n && paidAmount < totalAmount) {
      return dueTime <= now ? DebtStatus.OVERDUE : DebtStatus.PARTIAL;
    }
    return dueTime <= now ? DebtStatus.OVERDUE : DebtStatus.OPEN;
  }

  async createAuditLog(tx, { debtId, action, entityType, entityId, previousData, newData, userId }) {
    return tx.debtAuditLog.create({
      data: {
        debtId,
        action,
        entityType,
        entityId,
        previousData: previousData ? this.serializeForJson(previousData) : null,
        newData: newData ? this.serializeForJson(newData) : null,
        performedById: userId,
      },
    });
  }

  // ==================== RECALCULATE ====================

  /**
   * JISMONIY uchun: transactions dan hisoblash
   */
  async recalculateDebtIndividual(tx, debtId) {
    const debt = await tx.debt.findUnique({
      where: { id: debtId },
      select: { dueAt: true },
    });

    const transactions = await tx.debtTransaction.findMany({
      where: { debtId, isActive: true },
    });

    let totalAmount = 0n;
    let paidAmount = 0n;

    for (const t of transactions) {
      if (t.type === DebtTransactionType.ADDED) {
        totalAmount += t.amount;
      } else if (t.type === DebtTransactionType.PAID) {
        paidAmount += t.amount;
      }
    }

    const status = this.calculateStatus(totalAmount, paidAmount, debt.dueAt);

    await tx.debt.update({
      where: { id: debtId },
      data: { totalAmount, paidAmount, remainingAmount: totalAmount - paidAmount, status },
    });

    return { totalAmount, paidAmount, status };
  }

  /**
   * YURIDIK uchun: items dan hisoblash
   */
  async recalculateDebtCompany(tx, debtId) {
    const debt = await tx.debt.findUnique({
      where: { id: debtId },
      select: { dueAt: true },
    });

    const items = await tx.debtItem.findMany({
      where: { debtId, isActive: true },
    });

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0n);
    const paidAmount = items.reduce((sum, item) => sum + item.paidAmount, 0n);
    const status = this.calculateStatus(totalAmount, paidAmount, debt.dueAt);

    await tx.debt.update({
      where: { id: debtId },
      data: { totalAmount, paidAmount, remainingAmount: totalAmount - paidAmount, status },
    });

    return { totalAmount, paidAmount, status };
  }

  /**
   * Universal recalculate
   */
  async recalculateDebt(tx, debtId) {
    const debt = await tx.debt.findUnique({
      where: { id: debtId },
      select: { counterPartyType: true },
    });

    if (debt.counterPartyType === CounterPartyType.INDIVIDUAL) {
      return this.recalculateDebtIndividual(tx, debtId);
    } else {
      return this.recalculateDebtCompany(tx, debtId);
    }
  }

  // ==================== DEBT CRUD ====================

  async create(data, userId) {
    if (data.issuedAt.getTime() > data.dueAt.getTime()) {
      throw new AppError(400, "issuedAt_cannot_be_after_dueAt");
    }

    return prisma.$transaction(async (tx) => {
      let counterpartyName = data.counterpartyName;

      if (data.counterPartyType === CounterPartyType.COMPANY) {
        if (!data.organizationId) {
          throw new AppError(400, "select_organization");
        }
        const org = await tx.organization.findFirst({
          where: { id: data.organizationId, isActive: true },
        });
        if (!org) throw new AppError(404, "organization_not_found");
        counterpartyName = org.organizationName;
      }

      // Debt yaratish
      const debt = await tx.debt.create({
        data: {
          counterpartyName,
          counterpartyPhone: data.counterpartyPhone,
          counterPartyType: data.counterPartyType,
          type: data.type,
          issuedAt: data.issuedAt,
          dueAt: data.dueAt,
          note: data.note || "",
          smsBefore: data.smsBefore,
          smsLate: data.smsLate,
          callBefore: data.callBefore,
          callLate: data.callLate,
          organizationId: data.counterPartyType === CounterPartyType.COMPANY ? data.organizationId : null,
          totalAmount: 0n,
          paidAmount: 0n,
          remainingAmount: 0n,
          isDollar: data.isDollar,
          status: DebtStatus.OPEN,
          createdById: userId,
        },
      });

      // JISMONIY: boshlang'ich summa qo'shish
      if (data.counterPartyType === CounterPartyType.INDIVIDUAL && data.amount) {
        await this._addTransactionInternal(
          tx,
          debt.id,
          {
            type: DebtTransactionType.ADDED,
            amount: data.amount,
            description: data.note || "Boshlang'ich qarz",
          },
          userId,
          false,
        );
      }

      // YURIDIK: mahsulotlar qo'shish
      if (data.counterPartyType === CounterPartyType.COMPANY && Array.isArray(data.items) && data.items.length > 0) {
        for (const itemData of data.items) {
          await this._addItemInternal(tx, debt.id, itemData, userId, false);
        }
      }

      // Audit log
      await this.createAuditLog(tx, {
        debtId: debt.id,
        action: DebtAuditAction.DEBT_CREATED,
        entityType: "DEBT",
        entityId: debt.id,
        newData: debt,
        userId,
      });

      // Recalculate
      await this.recalculateDebt(tx, debt.id);

      return debt;
    });
  }

  async getOne(id) {
    const debt = await prisma.debt.findFirst({
      where: { id, isActive: true },
      include: {
        organization: {
          select: {
            id: true,
            organizationName: true,
            stirNumber: true,
            ownerName: true,
            ownerPhone: true,
          },
        },
      },
    });

    if (!debt) throw new AppError(404, "debt_not_found");

    let result = {
      id: debt.id,
      counterpartyName: debt.counterpartyName,
      counterpartyPhone: debt.counterpartyPhone,
      counterPartyType: debt.counterPartyType,
      type: debt.type,
      status: debt.status,
      issuedAt: debt.issuedAt,
      dueAt: debt.dueAt,
      note: debt.note,
      smsBefore: debt.smsBefore,
      smsLate: debt.smsLate,
      callBefore: debt.callBefore,
      callLate: debt.callLate,
      amount: fromMinorUnits(debt.totalAmount),
      paidAmount: fromMinorUnits(debt.paidAmount),
      remainingAmount: fromMinorUnits(debt.remainingAmount),
      organization: debt.organization,
      createdAt: debt.createdAt,
      isDollar: debt.isDollar,
    };

    // JISMONIY: transactions
    if (debt.counterPartyType === CounterPartyType.INDIVIDUAL) {
      const transactions = await prisma.debtTransaction.findMany({
        where: { debtId: id, isActive: true },
        orderBy: { createdAt: "desc" },
      });

      result.transactions = transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: fromMinorUnits(t.amount),
        description: t.description,
        createdAt: t.createdAt,
      }));
    }

    // YURIDIK: items va payments
    if (debt.counterPartyType === CounterPartyType.COMPANY) {
      const items = await prisma.debtItem.findMany({
        where: { debtId: id, isActive: true },
        orderBy: { createdAt: "asc" },
      });

      const payments = await prisma.debtPayment.findMany({
        where: { debtId: id, isActive: true },
        include: {
          item: {
            select: { id: true, name: true, pricePerUnit: true, unit: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      result.items = items.map((item) => {
        const totalPrice = fromMinorUnits(item.totalPrice);
        const paidAmount = fromMinorUnits(item.paidAmount);
        const pricePerUnit = fromMinorUnits(item.pricePerUnit);
        const quantity = Number(item.quantity);

        const paidQuantity = pricePerUnit > 0 ? Math.floor(paidAmount / pricePerUnit) : 0;
        const remainingQuantity = quantity - paidQuantity;

        return {
          id: item.id,
          name: item.name,
          parameter: item.parameter,
          quantity,
          pricePerUnit,
          totalPrice,
          paidAmount,
          remainingAmount: totalPrice - paidAmount,
          paidQuantity,
          remainingQuantity,
          recipient: item.recipient,
          unit: item.unit,
          createdAt: item.createdAt,
        };
      });

      result.payments = payments.map((p) => ({
        id: p.id,
        amount: fromMinorUnits(p.amount),
        description: p.description,
        itemId: p.itemId,
        itemName: p.item?.name || null,
        createdAt: p.createdAt,
      }));

      result.history = this._buildCompanyHistory(items, payments);
    }

    return result;
  }

  /**
   * YURIDIK uchun tarix yaratish
   */
  _buildCompanyHistory(items, payments) {
    const history = [];

    // Items qo'shilganlar
    for (const item of items) {
      history.push({
        id: `item-${item.id}`,
        type: "ADDED",
        date: item.createdAt,
        amount: fromMinorUnits(item.totalPrice),
        description: `${item.name} қўшилди`,
        details: {
          itemId: item.id,
          itemName: item.name,
          recipient: item.recipient,
          parameter: item.parameter,
          quantity: Number(item.quantity),
          pricePerUnit: fromMinorUnits(item.pricePerUnit),
          unit: item.unit,
        },
      });
    }

    // To'lovlar
    for (const payment of payments) {
      history.push({
        id: `payment-${payment.id}`,
        type: "PAID",
        date: payment.createdAt,
        amount: fromMinorUnits(payment.amount),
        description: payment.description ? payment.description : payment.item ? `${payment.item.name} учун тўлов` : "Тўлов",
        details: {
          paymentId: payment.id,
          itemId: payment.itemId,
          itemName: payment.item?.name || null,
          quantity: payment.item ? Math.round(Number(payment.amount) / Number(payment.item.pricePerUnit)) : null,
        },
      });
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    return history;
  }

  async update(id, data, userId) {
    if (data.issuedAt.getTime() > data.dueAt.getTime()) {
      throw new AppError(400, "issuedAt_cannot_be_after_dueAt");
    }

    return prisma.$transaction(async (tx) => {
      const oldDebt = await tx.debt.findFirst({
        where: { id, isActive: true },
      });
      if (!oldDebt) throw new AppError(404, "debt_not_found");

      let counterpartyName = data.counterpartyName;

      if (data.counterPartyType === CounterPartyType.COMPANY) {
        if (!data.organizationId) {
          throw new AppError(400, "select_organization");
        }
        const org = await tx.organization.findFirst({
          where: { id: data.organizationId, isActive: true },
        });
        if (!org) throw new AppError(404, "organization_not_found");
        counterpartyName = org.organizationName;
      }

      const newDebt = await tx.debt.update({
        where: { id },
        data: {
          counterpartyName,
          counterpartyPhone: data.counterpartyPhone,
          issuedAt: data.issuedAt,
          dueAt: data.dueAt,
          note: data.note,
          smsBefore: data.smsBefore,
          smsLate: data.smsLate,
          callBefore: data.callBefore,
          callLate: data.callLate,
          type: data.type,
          organizationId: data.counterPartyType === CounterPartyType.COMPANY ? data.organizationId : null,
          isDollar: data.isDollar,
        },
      });

      await this.createAuditLog(tx, {
        debtId: id,
        action: DebtAuditAction.DEBT_UPDATED,
        entityType: "DEBT",
        entityId: id,
        previousData: oldDebt,
        newData: newDebt,
        userId,
      });

      await this.recalculateDebt(tx, id);

      return newDebt;
    });
  }

  async delete(id, userId) {
    return prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findFirst({
        where: { id, isActive: true },
      });
      if (!debt) throw new AppError(404, "debt_not_found");

      await tx.debt.update({
        where: { id },
        data: {
          isActive: false,
          deletedById: userId,
          deletedAt: new Date(),
        },
      });

      await this.createAuditLog(tx, {
        debtId: id,
        action: DebtAuditAction.DEBT_DELETED,
        entityType: "DEBT",
        entityId: id,
        previousData: debt,
        userId,
      });
    });
  }

  async restore(id, userId) {
    return prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findFirst({
        where: { id, isActive: false },
      });
      if (!debt) throw new AppError(404, "debt_not_found");

      await tx.debt.update({
        where: { id },
        data: {
          isActive: true,
          deletedById: null,
          deletedAt: null,
        },
      });

      await this.createAuditLog(tx, {
        debtId: id,
        action: DebtAuditAction.DEBT_RESTORED,
        entityType: "DEBT",
        entityId: id,
        newData: { ...debt, isActive: true },
        userId,
      });
    });
  }

  // ==================== JISMONIY: TRANSACTIONS ====================

  async _addTransactionInternal(tx, debtId, data, userId, shouldRecalculate = true) {
    const transaction = await tx.debtTransaction.create({
      data: {
        debtId,
        type: data.type,
        amount: BigInt(data.amount),
        description: data.description || "",
      },
    });

    await this.createAuditLog(tx, {
      debtId,
      action: DebtAuditAction.TRANSACTION_ADDED,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      newData: transaction,
      userId,
    });

    if (shouldRecalculate) {
      await this.recalculateDebtIndividual(tx, debtId);
    }

    return transaction;
  }

  async addTransaction(debtId, data, userId) {
    return prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findFirst({
        where: { id: debtId, isActive: true, counterPartyType: CounterPartyType.INDIVIDUAL },
      });
      if (!debt) throw new AppError(404, "debt_not_found_or_not_individual");

      return this._addTransactionInternal(tx, debtId, data, userId);
    });
  }

  async updateTransaction(transactionId, data, userId) {
    return prisma.$transaction(async (tx) => {
      const oldTransaction = await tx.debtTransaction.findFirst({
        where: { id: transactionId, isActive: true },
      });
      if (!oldTransaction) throw new AppError(404, "transaction_not_found");

      const newTransaction = await tx.debtTransaction.update({
        where: { id: transactionId },
        data: {
          type: data.type,
          amount: BigInt(data.amount),
          description: data.description || "",
        },
      });

      await this.createAuditLog(tx, {
        debtId: oldTransaction.debtId,
        action: DebtAuditAction.TRANSACTION_UPDATED,
        entityType: "TRANSACTION",
        entityId: transactionId,
        previousData: oldTransaction,
        newData: newTransaction,
        userId,
      });

      await this.recalculateDebtIndividual(tx, oldTransaction.debtId);

      return newTransaction;
    });
  }

  async deleteTransaction(transactionId, userId) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.debtTransaction.findFirst({
        where: { id: transactionId, isActive: true },
      });
      if (!transaction) throw new AppError(404, "transaction_not_found");

      await tx.debtTransaction.update({
        where: { id: transactionId },
        data: {
          isActive: false,
          deletedById: userId,
          deletedAt: new Date(),
        },
      });

      await this.createAuditLog(tx, {
        debtId: transaction.debtId,
        action: DebtAuditAction.TRANSACTION_DELETED,
        entityType: "TRANSACTION",
        entityId: transactionId,
        previousData: transaction,
        userId,
      });

      await this.recalculateDebtIndividual(tx, transaction.debtId);
    });
  }

  // ==================== YURIDIK: ITEMS ====================

  async _addItemInternal(tx, debtId, itemData, userId, shouldRecalculate = true) {
    const totalPrice = BigInt(Math.floor(Number(itemData.quantity) * Number(itemData.pricePerUnit)));

    const item = await tx.debtItem.create({
      data: {
        debtId,
        name: itemData.name,
        parameter: itemData.parameter || "",
        quantity: itemData.quantity,
        pricePerUnit: BigInt(itemData.pricePerUnit),
        totalPrice,
        recipient: itemData.recipient || "",
        unit: itemData.unit || null,
        paidAmount: 0n,
      },
    });

    await this.createAuditLog(tx, {
      debtId,
      action: DebtAuditAction.ITEM_ADDED,
      entityType: "ITEM",
      entityId: item.id,
      newData: item,
      userId,
    });

    if (shouldRecalculate) {
      await this.recalculateDebtCompany(tx, debtId);
    }

    return item;
  }

  async addItem(debtId, itemData, userId) {
    return prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findFirst({
        where: { id: debtId, isActive: true, counterPartyType: CounterPartyType.COMPANY },
      });
      if (!debt) throw new AppError(404, "debt_not_found_or_not_company");

      return this._addItemInternal(tx, debtId, itemData, userId);
    });
  }

  async updateItem(itemId, itemData, userId) {
    return prisma.$transaction(async (tx) => {
      const oldItem = await tx.debtItem.findFirst({
        where: { id: itemId, isActive: true },
      });
      if (!oldItem) throw new AppError(404, "item_not_found");

      const totalPrice = BigInt(Math.floor(Number(itemData.quantity) * Number(itemData.pricePerUnit)));

      const paidAmount = oldItem.paidAmount > totalPrice ? totalPrice : oldItem.paidAmount;

      const newItem = await tx.debtItem.update({
        where: { id: itemId },
        data: {
          name: itemData.name,
          parameter: itemData.parameter || "",
          quantity: itemData.quantity,
          pricePerUnit: BigInt(itemData.pricePerUnit),
          totalPrice,
          recipient: itemData.recipient || "",
          unit: itemData.unit || null,
          paidAmount,
        },
      });

      await this.createAuditLog(tx, {
        debtId: oldItem.debtId,
        action: DebtAuditAction.ITEM_UPDATED,
        entityType: "ITEM",
        entityId: itemId,
        previousData: oldItem,
        newData: newItem,
        userId,
      });

      await this.recalculateDebtCompany(tx, oldItem.debtId);

      return newItem;
    });
  }

  async deleteItem(itemId, userId) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.debtItem.findFirst({
        where: { id: itemId, isActive: true },
      });
      if (!item) throw new AppError(404, "item_not_found");

      // Soft delete
      await tx.debtItem.update({
        where: { id: itemId },
        data: {
          isActive: false,
          deletedById: userId,
          deletedAt: new Date(),
        },
      });

      await tx.debtPayment.updateMany({
        where: { itemId, isActive: true },
        data: {
          isActive: false,
          deletedById: userId,
          deletedAt: new Date(),
        },
      });

      await this.createAuditLog(tx, {
        debtId: item.debtId,
        action: DebtAuditAction.ITEM_DELETED,
        entityType: "ITEM",
        entityId: itemId,
        previousData: item,
        userId,
      });

      await this.recalculateDebtCompany(tx, item.debtId);
    });
  }

  // ==================== YURIDIK: PAYMENTS ====================

  async addPayment(debtId, paymentData, userId) {
    return prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findFirst({
        where: { id: debtId, isActive: true, counterPartyType: CounterPartyType.COMPANY },
      });
      if (!debt) throw new AppError(404, "debt_not_found_or_not_company");

      // Item tekshirish
      let item = null;
      if (paymentData.itemId) {
        item = await tx.debtItem.findFirst({
          where: { id: paymentData.itemId, debtId, isActive: true },
        });
        if (!item) throw new AppError(404, "item_not_found");
      }

      // Payment yaratish
      const payment = await tx.debtPayment.create({
        data: {
          debtId,
          amount: BigInt(paymentData.amount),
          description: paymentData.description || "",
          itemId: paymentData.itemId || null,
          createdById: userId,
        },
      });

      // Item paidAmount ni yangilash
      if (item) {
        await tx.debtItem.update({
          where: { id: item.id },
          data: { paidAmount: { increment: BigInt(paymentData.amount) } },
        });
      }

      await this.createAuditLog(tx, {
        debtId,
        action: DebtAuditAction.PAYMENT_ADDED,
        entityType: "PAYMENT",
        entityId: payment.id,
        newData: { payment, itemName: item?.name || null },
        userId,
      });

      await this.recalculateDebtCompany(tx, debtId);

      return payment;
    });
  }

  async updatePayment(paymentId, paymentData, userId) {
    return prisma.$transaction(async (tx) => {
      const oldPayment = await tx.debtPayment.findFirst({
        where: { id: paymentId, isActive: true },
      });
      if (!oldPayment) throw new AppError(404, "payment_not_found");

      // Eski item paidAmount ni qaytarish
      if (oldPayment.itemId) {
        await tx.debtItem.update({
          where: { id: oldPayment.itemId },
          data: { paidAmount: { decrement: oldPayment.amount } },
        });
      }

      // Yangi item tekshirish
      let newItem = null;
      if (paymentData.itemId) {
        newItem = await tx.debtItem.findFirst({
          where: { id: paymentData.itemId, debtId: oldPayment.debtId, isActive: true },
        });
        if (!newItem) throw new AppError(404, "item_not_found");
      }

      // Payment yangilash
      const newPayment = await tx.debtPayment.update({
        where: { id: paymentId },
        data: {
          amount: BigInt(paymentData.amount),
          description: paymentData.description || "",
          itemId: paymentData.itemId || null,
        },
      });

      // Yangi item paidAmount ni yangilash
      if (newItem) {
        await tx.debtItem.update({
          where: { id: newItem.id },
          data: { paidAmount: { increment: BigInt(paymentData.amount) } },
        });
      }

      await this.createAuditLog(tx, {
        debtId: oldPayment.debtId,
        action: DebtAuditAction.PAYMENT_UPDATED,
        entityType: "PAYMENT",
        entityId: paymentId,
        previousData: oldPayment,
        newData: newPayment,
        userId,
      });

      await this.recalculateDebtCompany(tx, oldPayment.debtId);

      return newPayment;
    });
  }

  async deletePayment(paymentId, userId) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.debtPayment.findFirst({
        where: { id: paymentId, isActive: true },
      });
      if (!payment) throw new AppError(404, "payment_not_found");

      // Item paidAmount ni qaytarish
      if (payment.itemId) {
        await tx.debtItem.update({
          where: { id: payment.itemId },
          data: { paidAmount: { decrement: payment.amount } },
        });
      }

      // Soft delete
      await tx.debtPayment.update({
        where: { id: paymentId },
        data: {
          isActive: false,
          deletedById: userId,
          deletedAt: new Date(),
        },
      });

      await this.createAuditLog(tx, {
        debtId: payment.debtId,
        action: DebtAuditAction.PAYMENT_DELETED,
        entityType: "PAYMENT",
        entityId: paymentId,
        previousData: payment,
        userId,
      });

      await this.recalculateDebtCompany(tx, payment.debtId);
    });
  }

  // ==================== AUDIT LOGS ====================

  async getAuditLogs(debtId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;

    const [logs, count] = await Promise.all([
      prisma.debtAuditLog.findMany({
        where: { debtId },
        include: {
          performedBy: {
            select: { id: true, fullName: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.debtAuditLog.count({ where: { debtId } }),
    ]);

    return {
      data: logs,
      page,
      limit,
      totalCount: count,
      totalPage: Math.ceil(count / limit),
    };
  }

  // ==================== EXCEL DOCS ====================

  async getDebtsExcel() {
    const debts = await prisma.debt.findMany({
      orderBy: { dueAt: "asc" },
      where: { isActive: true },
    });

    const preparedDebts = debts.map((d) => ({
      counterpartyName: d.counterpartyName,
      counterPartyType: d.counterPartyType,
      type: d.type,
      totalAmount: d.totalAmount,
      paidAmount: d.paidAmount,
      remainingAmount: d.remainingAmount,
      status: d.status,
      counterpartyPhone: d.counterpartyPhone,
      issuedAt: d.issuedAt,
      dueAt: d.dueAt,
    }));

    return this._buildDebtsExcel(preparedDebts);
  }

  async getDebtItemsExcel(id) {
    const debt = await prisma.debt.findFirst({
      where: { isActive: true, id },
      select: { id: true },
    });
    if (!debt) {
      throw new AppError(404, "debt_not_found");
    }

    const items = await prisma.debtItem.findMany({
      where: {
        debtId: id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        unit: true,
        pricePerUnit: true,
        totalPrice: true,
        paidAmount: true,
        parameter: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // ==================== EXCEL YARATISH ====================
    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet("Items");

    // ==================== KONSTANTALAR ====================
    const FONT_NAME = "Arial";
    const FONT_SIZE = 11;
    const MIN_ROW_HEIGHT = 25;
    const MAX_ROW_HEIGHT = 200; // Maximum row height

    // ==================== YORDAMCHI FUNKSIYALAR ====================
    const getUnitUz = (unit) => {
      const units = {
        [Unit.KG]: "кг",
        [Unit.M]: "м",
        [Unit.M2]: "м²",
        [Unit.M3]: "м³",
        [Unit.PCS]: "дона",
        [Unit.SET]: "тўплам",
        [Unit.TON]: "тонна",
        [Unit.L]: "литр",
      };
      return units[unit] || unit || "";
    };

    const formatNumber = (num) => {
      if (!num || isNaN(Number(num))) return /* "0.00" */ 0;
      return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
    };

    const formatQuantity = (num) => {
      if (!num || isNaN(Number(num))) return "0";
      const value = Number(num);
      if (Number.isInteger(value)) {
        return value.toLocaleString("uz-UZ");
      }
      return value.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
    };

    const formatQuantityWithUnit = (qty, unit) => {
      const formattedQty = formatQuantity(qty);
      const unitUz = getUnitUz(unit);
      return unitUz ? `${formattedQty} ${unitUz}` : formattedQty;
    };

    // Yangi funksiya: Matnni qatorlarga ajratish va row heightni hisoblash
    const calculateRowHeight = (text, columnWidth) => {
      if (!text || !text.trim()) return MIN_ROW_HEIGHT;

      const avgCharWidth = 0.7; // Har bir belgining o'rtacha kengligi (approximate)
      const lineHeight = 15; // Har bir qator uchun height

      // Column width characterda
      const maxCharsPerLine = Math.floor(columnWidth / avgCharWidth);

      const words = text.split(" ");
      let lines = 1;
      let currentLineLength = 0;

      words.forEach((word) => {
        const wordLength = word.length;
        if (currentLineLength + wordLength + 1 > maxCharsPerLine) {
          lines++;
          currentLineLength = wordLength;
        } else {
          currentLineLength += wordLength + 1; // +1 for space
        }
      });

      // Yangi qatorlar (\n) ni ham hisobga olish
      const newLineCount = (text.match(/\n/g) || []).length;
      lines += newLineCount;

      const calculatedHeight = MIN_ROW_HEIGHT + (lines - 1) * lineHeight;
      return Math.min(calculatedHeight, MAX_ROW_HEIGHT);
    };

    // ==================== USTUNLAR ====================
    const columns = [
      { header: "№", key: "number", minWidth: 5, maxWidth: 8 },
      { header: "Маҳсулот номи", key: "name", minWidth: 25, maxWidth: 50 },
      { header: "Маҳсулот параметри", key: "parameter", minWidth: 25, maxWidth: 80 }, // Kengroq maximum width
      { header: "Миқдор", key: "quantity", minWidth: 14, maxWidth: 20 },
      { header: "Бирлик нархи", key: "pricePerUnit", minWidth: 16, maxWidth: 20 },
      { header: "Умумий нарх", key: "totalPrice", minWidth: 16, maxWidth: 20 },
      { header: "Тўланган миқдор", key: "paidQuantity", minWidth: 16, maxWidth: 20 },
      { header: "Тўланган сумма", key: "paidAmount", minWidth: 16, maxWidth: 20 },
      { header: "Қолдиқ миқдори", key: "remainingQuantity", minWidth: 16, maxWidth: 20 },
      { header: "Қолган сумма", key: "remainingAmount", minWidth: 16, maxWidth: 20 },
    ];

    sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

    const maxLengths = columns.map((col) => col.header.length);
    const parameterColumnIndex = 2; // Parameter ustunining indexi (0-based)

    // ==================== MA'LUMOTLARNI TAYYORLASH ====================
    const rowsData = items.map((i, index) => {
      const pricePerUnit = fromMinorUnits(i.pricePerUnit);
      const totalPrice = fromMinorUnits(i.totalPrice);
      const paidAmount = fromMinorUnits(i.paidAmount);
      const remainingAmount = fromMinorUnits(i.totalPrice - i.paidAmount);

      // Miqdorlarni hisoblash
      const quantity = Number(i.quantity);
      const paidQuantity = Number(i.pricePerUnit) > 0 ? Math.round(Number(i.paidAmount) / Number(i.pricePerUnit)) : 0;
      const remainingQuantity = Number(i.pricePerUnit) > 0 ? Math.round((Number(i.totalPrice) - Number(i.paidAmount)) / Number(i.pricePerUnit)) : 0;

      const parameterText = i.parameter || "-";

      const data = {
        number: String(index + 1),
        name: i.name || "-",
        parameter: parameterText,
        quantity: formatQuantityWithUnit(quantity, i.unit),
        pricePerUnit: formatNumber(pricePerUnit),
        totalPrice: formatNumber(totalPrice),
        paidQuantity: formatQuantityWithUnit(paidQuantity, i.unit),
        paidAmount: formatNumber(paidAmount),
        remainingQuantity: formatQuantityWithUnit(remainingQuantity, i.unit),
        remainingAmount: formatNumber(remainingAmount),
        _remainingAmount: remainingAmount,
        _parameterText: parameterText, // Row height hisoblash uchun saqlab qo'yamiz
      };

      // Faqat parameter ustuni uchun emas, barcha ustunlar uchun maxLength ni hisoblash
      columns.forEach((col, idx) => {
        const cellValue = String(data[col.key]);
        const lines = cellValue.split("\n");
        let maxLineLength = 0;
        lines.forEach((line) => {
          maxLineLength = Math.max(maxLineLength, line.length);
        });
        maxLengths[idx] = Math.max(maxLengths[idx], maxLineLength);
      });

      return data;
    });

    // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
    columns.forEach((col, idx) => {
      // Parameter ustuni uchun alohida hisoblash
      if (col.key === "parameter") {
        const contentMaxLength = maxLengths[idx];
        // Parameter uzunligiga qarab width ni hisoblash
        let width = Math.min(Math.max(contentMaxLength * 1.2 + 3, col.minWidth), col.maxWidth);

        // Agar uzun matnlar ko'p bo'lsa, width ni kengaytiramiz
        const longTextCount = rowsData.filter((row) => String(row.parameter).length > 100).length;

        if (longTextCount > rowsData.length * 0.3) {
          // 30% dan ko'p bo'lsa
          width = Math.min(width * 1.5, col.maxWidth);
        }

        sheet.getColumn(idx + 1).width = width;
      } else {
        let width = Math.min(Math.max(maxLengths[idx] + 3, col.minWidth), col.maxWidth);
        sheet.getColumn(idx + 1).width = width;
      }
    });

    // ==================== MA'LUMOTLARNI QO'SHISH ====================
    const parameterColumn = sheet.getColumn(parameterColumnIndex + 1);
    const parameterWidth = parameterColumn.width;

    rowsData.forEach((data) => {
      const { _remainingAmount, _parameterText, ...cleanData } = data;

      // Row heightni hisoblash
      const rowHeight = calculateRowHeight(_parameterText, parameterWidth);

      const row = sheet.addRow(cleanData);
      row.height = rowHeight;

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
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Mahsulot nomi

      // Parameter uchun wrapText va top alignment
      row.getCell(3).alignment = {
        horizontal: "left",
        vertical: "top",
        wrapText: true,
      };

      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Miqdor

      // Birlik narxi
      row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

      // Umumiy narx
      row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

      // To'langan miqdor
      row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(7).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

      // To'langan summa - yashil
      row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(8).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

      // Qoldiq miqdori
      row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(9).font = {
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: _remainingAmount > 0 ? "FFC62828" : "FF2E7D32" },
      };

      // Qolgan summa - musbat qizil, 0 yashil
      row.getCell(10).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(10).font = {
        size: FONT_SIZE,
        name: FONT_NAME,
        bold: true,
        color: { argb: _remainingAmount > 0 ? "FFC62828" : "FF2E7D32" },
      };
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

    // Parameter ustuni header uchun wrapText yoqish
    headerRow.getCell(parameterColumnIndex + 1).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // ==================== JAMI QATOR ====================
    const summaryRowNumber = sheet.rowCount + 2;

    // Umumiy summalar
    const totalPrice = items.reduce((sum, i) => sum + Number(i.totalPrice), 0) / 100;
    const totalPaid = items.reduce((sum, i) => sum + Number(i.paidAmount), 0) / 100;
    const totalRemaining = totalPrice - totalPaid;

    const summaryRow = sheet.getRow(summaryRowNumber);
    sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
    summaryRow.getCell(1).value = `Жами маҳсулотлар: ${items.length} та`;
    summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

    summaryRow.getCell(6).value = formatNumber(totalPrice);
    summaryRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
    summaryRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

    summaryRow.getCell(8).value = formatNumber(totalPaid);
    summaryRow.getCell(8).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
    summaryRow.getCell(8).alignment = { horizontal: "right", vertical: "middle" };

    summaryRow.getCell(10).value = formatNumber(totalRemaining);
    summaryRow.getCell(10).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: totalRemaining > 0 ? "FFC62828" : "FF2E7D32" },
    };
    summaryRow.getCell(10).alignment = { horizontal: "right", vertical: "middle" };

    // Auto filter qo'shish (ixtiyoriy)
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rowCount - 3, column: columns.length },
    };

    // Header qatorini muzlatish
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Barcha row'larni autoHeight qilish (ixtiyoriy)
    sheet.properties.defaultRowHeight = MIN_ROW_HEIGHT;

    return await workbook.xlsx.writeBuffer();
  }

  async getDebtHistoryExcel(id) {
    const debt = await prisma.debt.findFirst({
      where: { isActive: true, id },
      select: { id: true, counterPartyType: true },
    });
    if (!debt) {
      throw new AppError(404, "debt_not_found");
    }

    if (debt.counterPartyType === "COMPANY") {
      const items = await prisma.debtItem.findMany({
        where: { debtId: id, isActive: true },
        orderBy: { createdAt: "asc" },
      });

      const payments = await prisma.debtPayment.findMany({
        where: { debtId: id, isActive: true },
        include: {
          item: {
            select: { id: true, name: true, pricePerUnit: true, unit: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const history = [];

      for (const item of items) {
        history.push({
          type: "ITEM_ADDED",
          createdAt: item.createdAt,
          amount: fromMinorUnits(item.totalPrice),
          name: item.name,
          quantity: Number(item.quantity),
          description: `${item.name} қўшилди`,
        });
      }

      for (const payment of payments) {
        history.push({
          type: "PAYMENT",
          createdAt: payment.createdAt,
          amount: fromMinorUnits(payment.amount),
          name: payment.item ? payment.item.name : "-",
          quantity: payment.item ? Math.round(Number(payment.amount) / Number(payment.item.pricePerUnit)) : null,
          description: payment.description ? payment.description : payment.item ? `${payment.item.name} учун тўлов` : "Тўлов",
        });
      }

      const sortedHistory = history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return this._buildCompanyHistoryExcel(sortedHistory);
    } else {
      const txns = await prisma.debtTransaction.findMany({
        where: { isActive: true, debtId: id },
      });

      return this._buildTransactionsExcel(txns);
    }
  }

  _buildDebtsExcel(debts) {
    // ==================== EXCEL YARATISH ====================
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Qarzlar ro'yxati");

    // ==================== KONSTANTALAR ====================
    const FONT_NAME = "Arial";
    const FONT_SIZE = 11;
    const MIN_ROW_HEIGHT = 25;
    const MAX_ROW_HEIGHT = 200;

    // ==================== YORDAMCHI FUNKSIYALAR ====================
    const formatNumber = (num) => {
      if (!num || isNaN(Number(num))) return /* "0.00" */ 0;
      return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
    };

    const formatDate = (date) => {
      if (!date) return "-";
      const d = new Date(date);
      return d.toLocaleDateString("uz-UZ", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    };

    const formatDateTime = (date) => {
      if (!date) return "-";
      const d = new Date(date);
      return d.toLocaleDateString("uz-UZ", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const getCounterPartyType = (type) => {
      const types = {
        INDIVIDUAL: "Жисмоний",
        COMPANY: "Юридик",
      };
      return types[type] || type;
    };

    const getDebtType = (type) => {
      const types = {
        BORROWED: "Қарз олинган",
        LENT: "Қарз берилган",
      };
      return types[type] || type;
    };

    const getDebtStatus = (status) => {
      const statuses = {
        OPEN: "Очиқ",
        PARTIAL: "Қисман тўланган",
        CLOSED: "Ёпилган",
        OVERDUE: "Муддати ўтган",
        OVERPAID: "Ортиқча тўланган",
      };
      return statuses[status] || status;
    };

    // Row heightni hisoblash funksiyasi
    const calculateRowHeight = (text, columnWidth) => {
      if (!text || !text.trim()) return MIN_ROW_HEIGHT;

      const avgCharWidth = 0.7;
      const lineHeight = 15;

      const maxCharsPerLine = Math.floor(columnWidth / avgCharWidth);

      const words = text.split(" ");
      let lines = 1;
      let currentLineLength = 0;

      words.forEach((word) => {
        const wordLength = word.length;
        if (currentLineLength + wordLength + 1 > maxCharsPerLine) {
          lines++;
          currentLineLength = wordLength;
        } else {
          currentLineLength += wordLength + 1;
        }
      });

      const newLineCount = (text.match(/\n/g) || []).length;
      lines += newLineCount;

      const calculatedHeight = MIN_ROW_HEIGHT + (lines - 1) * lineHeight;
      return Math.min(calculatedHeight, MAX_ROW_HEIGHT);
    };

    // ==================== USTUNLAR ====================
    const columns = [
      { header: "№", key: "number", minWidth: 5, maxWidth: 8 },
      { header: "Қарз олувчи исми", key: "counterpartyName", minWidth: 25, maxWidth: 50 },
      { header: "Юридик/жисмоний", key: "counterPartyType", minWidth: 15, maxWidth: 20 },
      { header: "Қарз тури", key: "debtType", minWidth: 15, maxWidth: 20 },
      { header: "Қарз миқдори (сўм)", key: "totalAmount", minWidth: 18, maxWidth: 22 },
      { header: "Тўланган сумма (сўм)", key: "paidAmount", minWidth: 18, maxWidth: 22 },
      { header: "Қолган сумма (сўм)", key: "remainingAmount", minWidth: 18, maxWidth: 22 },
      { header: "Ҳолат", key: "status", minWidth: 15, maxWidth: 25 },
      { header: "Телефон", key: "phone", minWidth: 15, maxWidth: 20 },
      { header: "Бошланган сана", key: "issuedAt", minWidth: 18, maxWidth: 22 },
      { header: "Тугаш санаси", key: "dueAt", minWidth: 18, maxWidth: 22 },
    ];

    sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

    const maxLengths = columns.map((col) => col.header.length);
    const counterpartyNameColumnIndex = 1; // Qarz oluvchi ismi ustuni (0-based)

    // ==================== MA'LUMOTLARNI TAYYORLASH ====================
    // Qarzlar ni dueAt bo'yicha tartiblaymiz (getDebtsExcel da already sorted)
    const rowsData = debts.map((debt, index) => {
      const totalAmount = fromMinorUnits(debt.totalAmount);
      const paidAmount = fromMinorUnits(debt.paidAmount);
      const remainingAmount = fromMinorUnits(debt.remainingAmount);

      const data = {
        number: String(index + 1),
        counterpartyName: debt.counterpartyName || "-",
        counterPartyType: getCounterPartyType(debt.counterPartyType),
        debtType: getDebtType(debt.type),
        totalAmount: formatNumber(totalAmount),
        paidAmount: formatNumber(paidAmount),
        remainingAmount: formatNumber(remainingAmount),
        status: getDebtStatus(debt.status),
        phone: debt.counterpartyPhone || "-",
        issuedAt: formatDate(debt.issuedAt),
        dueAt: formatDate(debt.dueAt),
        _counterpartyName: debt.counterpartyName || "-",
        _totalAmount: totalAmount,
        _paidAmount: paidAmount,
        _remainingAmount: remainingAmount,
        _status: debt.status,
        _dueAt: debt.dueAt,
      };

      // Max lengthlarni yangilash
      columns.forEach((col, idx) => {
        const cellValue = String(data[col.key]);
        const lines = cellValue.split("\n");
        let maxLineLength = 0;
        lines.forEach((line) => {
          maxLineLength = Math.max(maxLineLength, line.length);
        });
        maxLengths[idx] = Math.max(maxLengths[idx], maxLineLength);
      });

      return data;
    });

    // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
    columns.forEach((col, idx) => {
      // Qarz oluvchi ismi ustuni uchun alohida hisoblash
      if (col.key === "counterpartyName") {
        const contentMaxLength = maxLengths[idx];
        let width = Math.min(Math.max(contentMaxLength * 1.2 + 3, col.minWidth), col.maxWidth);

        // Agar uzun ismlar ko'p bo'lsa, width ni kengaytiramiz
        const longTextCount = rowsData.filter((row) => String(row.counterpartyName).length > 30).length;

        if (longTextCount > rowsData.length * 0.3) {
          width = Math.min(width * 1.5, col.maxWidth);
        }

        sheet.getColumn(idx + 1).width = width;
      } else {
        let width = Math.min(Math.max(maxLengths[idx] + 3, col.minWidth), col.maxWidth);
        sheet.getColumn(idx + 1).width = width;
      }
    });

    // ==================== MA'LUMOTLARNI QO'SHISH ====================
    const counterpartyNameColumn = sheet.getColumn(counterpartyNameColumnIndex + 1);
    const counterpartyNameWidth = counterpartyNameColumn.width;

    // Jami summalarni hisoblash
    let totalDebt = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    rowsData.forEach((data) => {
      // Jami summalarni hisoblash
      totalDebt += data._totalAmount;
      totalPaid += data._paidAmount;
      totalRemaining += data._remainingAmount;

      const { _counterpartyName, _totalAmount, _paidAmount, _remainingAmount, _status, _dueAt, ...cleanData } = data;

      // Row heightni hisoblash
      const rowHeight = calculateRowHeight(_counterpartyName, counterpartyNameWidth);

      const row = sheet.addRow(cleanData);
      row.height = rowHeight;

      // Barcha celllarga asosiy stil
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

      // Qarz oluvchi ismi uchun wrapText va top alignment
      row.getCell(2).alignment = {
        horizontal: "left",
        vertical: "top",
        wrapText: true,
      };

      row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Yuridik/jismoniy
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Qarz turi
      row.getCell(5).alignment = { horizontal: "right", vertical: "middle" }; // Qarz miqdori
      row.getCell(6).alignment = { horizontal: "right", vertical: "middle" }; // To'langan summa
      row.getCell(7).alignment = { horizontal: "right", vertical: "middle" }; // Qolgan summa
      row.getCell(8).alignment = { horizontal: "center", vertical: "middle" }; // Holat
      row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Telefon
      row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Boshlangan sana
      row.getCell(11).alignment = { horizontal: "center", vertical: "middle" }; // Tugash sanasi

      // Qarz miqdori
      row.getCell(5).font = {
        size: FONT_SIZE,
        name: FONT_NAME,
        bold: true,
      };

      // To'langan summa - yashil
      row.getCell(6).font = {
        size: FONT_SIZE,
        name: FONT_NAME,
        color: { argb: "FF2E7D32" },
      };

      // Qolgan summa - qolgan miqdor bo'yicha rang
      row.getCell(7).font = {
        size: FONT_SIZE,
        name: FONT_NAME,
        bold: true,
        color: { argb: data._remainingAmount > 0 ? "FFC62828" : "FF2E7D32" },
      };

      // Holat bo'yicha rang berish
      let statusColor = "FF000000"; // default qora
      if (data._status === "OVERDUE") {
        statusColor = "FFC62828"; // qizil
      } else if (data._status === "CLOSED") {
        statusColor = "FF2E7D32"; // yashil
      } else if (data._status === "PARTIAL") {
        statusColor = "FFEF6C00"; // to'q sariq
      } else if (data._status === "OVERPAID") {
        statusColor = "FF9C27B0"; // binafsha
      }

      row.getCell(8).font = {
        size: FONT_SIZE,
        name: FONT_NAME,
        bold: data._status === "OVERDUE" || data._status === "CLOSED",
        color: { argb: statusColor },
      };

      // Tugash sanasini tekshirish (o'tgan muddatlar uchun)
      if (data._dueAt) {
        const dueDate = new Date(data._dueAt);
        const today = new Date();
        if (dueDate < today && data._remainingAmount > 0) {
          row.getCell(11).font = {
            size: FONT_SIZE,
            name: FONT_NAME,
            bold: true,
            color: { argb: "FFC62828" },
          };
        }
      }
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

    // Qarz oluvchi ismi ustuni header uchun wrapText
    headerRow.getCell(counterpartyNameColumnIndex + 1).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // ==================== JAMI QATOR ====================
    const summaryRowNumber = sheet.rowCount + 2;

    // Umumiy summalar
    const summaryRow = sheet.getRow(summaryRowNumber);

    // Jami qarzlar soni
    sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
    summaryRow.getCell(1).value = `Жами қарзлар сони: ${debts.length} та`;
    summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

    // Jami qarz miqdori
    summaryRow.getCell(5).value = formatNumber(totalDebt);
    summaryRow.getCell(5).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
    };
    summaryRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

    // Jami to'langan summa
    summaryRow.getCell(6).value = formatNumber(totalPaid);
    summaryRow.getCell(6).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: "FF2E7D32" },
    };
    summaryRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

    // Jami qolgan summa
    summaryRow.getCell(7).value = formatNumber(totalRemaining);
    summaryRow.getCell(7).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: totalRemaining > 0 ? "FFC62828" : "FF2E7D32" },
    };
    summaryRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

    // ==================== QO'SHIMCHA SOZLAMALAR ====================
    // Auto filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rowCount - 3, column: columns.length },
    };

    // Header qatorini muzlatish
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Default row height
    sheet.properties.defaultRowHeight = MIN_ROW_HEIGHT;

    // Buffer qaytarish
    return workbook.xlsx.writeBuffer();
  }

  _buildTransactionsExcel(txns) {
    // ==================== EXCEL YARATISH ====================
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tranzaksiyalar tarixi");

    // ==================== KONSTANTALAR ====================
    const FONT_NAME = "Arial";
    const FONT_SIZE = 11;
    const MIN_ROW_HEIGHT = 25;
    const MAX_ROW_HEIGHT = 200;

    // ==================== YORDAMCHI FUNKSIYALAR ====================
    const formatNumber = (num) => {
      if (!num || isNaN(Number(num))) return /* "0.00" */ 0;
      return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
    };

    const formatDate = (date) => {
      if (!date) return "-";
      const d = new Date(date);
      return d.toLocaleDateString("uz-UZ", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const getTransactionType = (type) => {
      const types = {
        ADDED: "Қарз қўшилди",
        PAID: "Тўлов қилинди",
      };
      return types[type] || type;
    };

    // Row heightni hisoblash funksiyasi
    const calculateRowHeight = (text, columnWidth) => {
      if (!text || !text.trim()) return MIN_ROW_HEIGHT;

      const avgCharWidth = 0.7;
      const lineHeight = 15;

      const maxCharsPerLine = Math.floor(columnWidth / avgCharWidth);

      const words = text.split(" ");
      let lines = 1;
      let currentLineLength = 0;

      words.forEach((word) => {
        const wordLength = word.length;
        if (currentLineLength + wordLength + 1 > maxCharsPerLine) {
          lines++;
          currentLineLength = wordLength;
        } else {
          currentLineLength += wordLength + 1;
        }
      });

      const newLineCount = (text.match(/\n/g) || []).length;
      lines += newLineCount;

      const calculatedHeight = MIN_ROW_HEIGHT + (lines - 1) * lineHeight;
      return Math.min(calculatedHeight, MAX_ROW_HEIGHT);
    };

    // ==================== USTUNLAR ====================
    const columns = [
      { header: "№", key: "number", minWidth: 5, maxWidth: 8 },
      { header: "Амал тури", key: "type", minWidth: 15, maxWidth: 20 },
      { header: "Миқдор (сўм)", key: "amount", minWidth: 16, maxWidth: 20 },
      { header: "Сана", key: "date", minWidth: 20, maxWidth: 25 },
      { header: "Тавсиф", key: "description", minWidth: 30, maxWidth: 80 },
    ];

    sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

    const maxLengths = columns.map((col) => col.header.length);
    const descriptionColumnIndex = 4; // Tavsif ustuni (0-based: №=0, Amal turi=1, Miqdor=2, Sana=3, Tavsif=4)

    // ==================== MA'LUMOTLARNI TAYYORLASH ====================
    // Transactionlarni created_at bo'yicha tartiblaymiz
    const sortedTxns = [...txns].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const rowsData = sortedTxns.map((txn, index) => {
      const amount = Number(txn.amount) / 100;
      const description = txn.description || "-";

      const data = {
        number: String(index + 1),
        type: getTransactionType(txn.type),
        amount: formatNumber(amount),
        date: formatDate(txn.createdAt),
        description: description,
        _description: description,
        _amount: amount,
        _type: txn.type,
      };

      // Max lengthlarni yangilash
      columns.forEach((col, idx) => {
        const cellValue = String(data[col.key]);
        const lines = cellValue.split("\n");
        let maxLineLength = 0;
        lines.forEach((line) => {
          maxLineLength = Math.max(maxLineLength, line.length);
        });
        maxLengths[idx] = Math.max(maxLengths[idx], maxLineLength);
      });

      return data;
    });

    // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
    columns.forEach((col, idx) => {
      // Tavsif ustuni uchun alohida hisoblash
      if (col.key === "description") {
        const contentMaxLength = maxLengths[idx];
        let width = Math.min(Math.max(contentMaxLength * 1.2 + 3, col.minWidth), col.maxWidth);

        // Agar uzun tavsiflar ko'p bo'lsa, width ni kengaytiramiz
        const longTextCount = rowsData.filter((row) => String(row.description).length > 100).length;

        if (longTextCount > rowsData.length * 0.3) {
          width = Math.min(width * 1.5, col.maxWidth);
        }

        sheet.getColumn(idx + 1).width = width;
      } else {
        let width = Math.min(Math.max(maxLengths[idx] + 3, col.minWidth), col.maxWidth);
        sheet.getColumn(idx + 1).width = width;
      }
    });

    // ==================== MA'LUMOTLARNI QO'SHISH ====================
    const descriptionColumn = sheet.getColumn(descriptionColumnIndex + 1);
    const descriptionWidth = descriptionColumn.width;

    // Jami summalarni hisoblash
    let totalAdded = 0;
    let totalPaid = 0;

    rowsData.forEach((data) => {
      // Jami summalarni hisoblash
      if (data._type === "ADDED") {
        totalAdded += data._amount;
      } else if (data._type === "PAID") {
        totalPaid += data._amount;
      }

      const { _description, _amount, _type, ...cleanData } = data;

      // Row heightni hisoblash
      const rowHeight = calculateRowHeight(_description, descriptionWidth);

      const row = sheet.addRow(cleanData);
      row.height = rowHeight;

      // Barcha celllarga asosiy stil
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
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Amal turi
      row.getCell(3).alignment = { horizontal: "right", vertical: "middle" }; // Miqdor
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Sana

      // Tavsif uchun wrapText va top alignment
      row.getCell(5).alignment = {
        horizontal: "left",
        vertical: "top",
        wrapText: true,
      };

      // Amal turi bo'yicha rang berish
      if (data._type === "ADDED") {
        row.getCell(2).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FFC62828" }, // Qizil
        };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FFC62828" },
        };
      } else if (data._type === "PAID") {
        row.getCell(2).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FF2E7D32" }, // Yashil
        };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FF2E7D32" },
        };
      }
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

    // Tavsif ustuni header uchun wrapText
    headerRow.getCell(descriptionColumnIndex + 1).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // ==================== JAMI QATOR ====================
    const summaryRowNumber = sheet.rowCount + 2;

    // Umumiy summalar
    const summaryRow = sheet.getRow(summaryRowNumber);

    // Jami qo'shilgan
    sheet.mergeCells(`A${summaryRowNumber}:B${summaryRowNumber}`);
    summaryRow.getCell(1).value = `Жами қўшилган сумма:`;
    summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    summaryRow.getCell(3).value = formatNumber(totalAdded);
    summaryRow.getCell(3).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: "FFC62828" },
    };
    summaryRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

    // Jami to'langan
    const paidRowNumber = summaryRowNumber + 1;
    const paidRow = sheet.getRow(paidRowNumber);

    sheet.mergeCells(`A${paidRowNumber}:B${paidRowNumber}`);
    paidRow.getCell(1).value = `Жами тўланган сумма:`;
    paidRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    paidRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    paidRow.getCell(3).value = formatNumber(totalPaid);
    paidRow.getCell(3).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: "FF2E7D32" },
    };
    paidRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

    // Qolgan summa
    const remainingRowNumber = paidRowNumber + 1;
    const remainingRow = sheet.getRow(remainingRowNumber);
    const remainingAmount = totalAdded - totalPaid;

    sheet.mergeCells(`A${remainingRowNumber}:B${remainingRowNumber}`);
    remainingRow.getCell(1).value = `Қолган сумма:`;
    remainingRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    remainingRow.getCell(3).value = formatNumber(remainingAmount);
    remainingRow.getCell(3).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: remainingAmount > 0 ? "FFC62828" : "FF2E7D32" },
    };
    remainingRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

    // ==================== QO'SHIMCHA SOZLAMALAR ====================
    // Auto filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rowCount - 5, column: columns.length },
    };

    // Header qatorini muzlatish
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Default row height
    sheet.properties.defaultRowHeight = MIN_ROW_HEIGHT;

    // Buffer qaytarish
    return workbook.xlsx.writeBuffer();
  }

  _buildCompanyHistoryExcel(history) {
    // ==================== EXCEL YARATISH ====================
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kompaniya qarz tarixi");

    // ==================== KONSTANTALAR ====================
    const FONT_NAME = "Arial";
    const FONT_SIZE = 11;
    const MIN_ROW_HEIGHT = 25;
    const MAX_ROW_HEIGHT = 200;

    // ==================== YORDAMCHI FUNKSIYALAR ====================
    const formatNumber = (num) => {
      if (!num || isNaN(Number(num))) return /* "0.00" */ 0;
      return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
    };

    const formatQuantity = (num) => {
      if (!num || isNaN(Number(num))) return "0";
      const value = Number(num);
      if (Number.isInteger(value)) {
        return value.toLocaleString("uz-UZ");
      }
      return value.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
    };

    const formatDate = (date) => {
      if (!date) return "-";
      const d = new Date(date);
      return d.toLocaleDateString("uz-UZ", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const getActionType = (type) => {
      const types = {
        ITEM_ADDED: "Маҳсулот қўшилди",
        PAYMENT: "Тўлов қилинди",
      };
      return types[type] || type;
    };

    // Row heightni hisoblash funksiyasi
    const calculateRowHeight = (text, columnWidth) => {
      if (!text || !text.trim()) return MIN_ROW_HEIGHT;

      const avgCharWidth = 0.7;
      const lineHeight = 15;

      const maxCharsPerLine = Math.floor(columnWidth / avgCharWidth);

      const words = text.split(" ");
      let lines = 1;
      let currentLineLength = 0;

      words.forEach((word) => {
        const wordLength = word.length;
        if (currentLineLength + wordLength + 1 > maxCharsPerLine) {
          lines++;
          currentLineLength = wordLength;
        } else {
          currentLineLength += wordLength + 1;
        }
      });

      const newLineCount = (text.match(/\n/g) || []).length;
      lines += newLineCount;

      const calculatedHeight = MIN_ROW_HEIGHT + (lines - 1) * lineHeight;
      return Math.min(calculatedHeight, MAX_ROW_HEIGHT);
    };

    // ==================== USTUNLAR ====================
    const columns = [
      { header: "№", key: "number", minWidth: 5, maxWidth: 8 },
      { header: "Амал тури", key: "actionType", minWidth: 15, maxWidth: 20 },
      { header: "Миқдор (сўм)", key: "amount", minWidth: 16, maxWidth: 20 },
      { header: "Сана", key: "date", minWidth: 20, maxWidth: 25 },
      { header: "Маҳсулот(лар)", key: "productName", minWidth: 25, maxWidth: 40 },
      { header: "Миқдор", key: "quantity", minWidth: 12, maxWidth: 16 },
      { header: "Тавсиф", key: "description", minWidth: 30, maxWidth: 80 },
    ];

    sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

    const maxLengths = columns.map((col) => col.header.length);
    const productNameColumnIndex = 4; // Mahsulot(lar) ustuni
    const descriptionColumnIndex = 6; // Tavsif ustuni

    // ==================== MA'LUMOTLARNI TAYYORLASH ====================
    // History ni created_at bo'yicha tartiblaymiz
    const sortedHistory = [...history].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const rowsData = sortedHistory.map((item, index) => {
      const actionType = getActionType(item.type);
      const productName = item.name || "-";
      const description = item.description || "-";
      const quantity = item.quantity !== null && item.quantity !== undefined ? formatQuantity(item.quantity) : "-";

      const data = {
        number: String(index + 1),
        actionType: actionType,
        amount: formatNumber(item.amount),
        date: formatDate(item.createdAt),
        productName: productName,
        quantity: quantity,
        description: description,
        _productName: productName,
        _description: description,
        _amount: item.amount,
        _type: item.type,
        _quantity: item.quantity,
      };

      // Max lengthlarni yangilash
      columns.forEach((col, idx) => {
        const cellValue = String(data[col.key]);
        const lines = cellValue.split("\n");
        let maxLineLength = 0;
        lines.forEach((line) => {
          maxLineLength = Math.max(maxLineLength, line.length);
        });
        maxLengths[idx] = Math.max(maxLengths[idx], maxLineLength);
      });

      return data;
    });

    // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
    columns.forEach((col, idx) => {
      // Mahsulot(lar) va Tavsif ustunlari uchun alohida hisoblash
      if (col.key === "productName" || col.key === "description") {
        const contentMaxLength = maxLengths[idx];
        let width = Math.min(Math.max(contentMaxLength * 1.2 + 3, col.minWidth), col.maxWidth);

        // Agar uzun matnlar ko'p bo'lsa, width ni kengaytiramiz
        const longTextCount = rowsData.filter((row) => String(row[col.key]).length > 100).length;

        if (longTextCount > rowsData.length * 0.3) {
          width = Math.min(width * 1.5, col.maxWidth);
        }

        sheet.getColumn(idx + 1).width = width;
      } else {
        let width = Math.min(Math.max(maxLengths[idx] + 3, col.minWidth), col.maxWidth);
        sheet.getColumn(idx + 1).width = width;
      }
    });

    // ==================== MA'LUMOTLARNI QO'SHISH ====================
    const productNameColumn = sheet.getColumn(productNameColumnIndex + 1);
    const descriptionColumn = sheet.getColumn(descriptionColumnIndex + 1);
    const productNameWidth = productNameColumn.width;
    const descriptionWidth = descriptionColumn.width;

    // Jami summalarni hisoblash
    let totalAdded = 0;
    let totalPaid = 0;

    rowsData.forEach((data) => {
      // Jami summalarni hisoblash
      if (data._type === "ITEM_ADDED") {
        totalAdded += data._amount;
      } else if (data._type === "PAYMENT") {
        totalPaid += data._amount;
      }

      const { _productName, _description, _amount, _type, _quantity, ...cleanData } = data;

      // Row heightni hisoblash (ikkala uzun matn uchun)
      const productNameHeight = calculateRowHeight(_productName, productNameWidth);
      const descriptionHeight = calculateRowHeight(_description, descriptionWidth);
      const rowHeight = Math.max(productNameHeight, descriptionHeight, MIN_ROW_HEIGHT);

      const row = sheet.addRow(cleanData);
      row.height = rowHeight;

      // Barcha celllarga asosiy stil
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
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" }; // Amal turi
      row.getCell(3).alignment = { horizontal: "right", vertical: "middle" }; // Miqdor
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Sana
      row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // Miqdor (quantity)

      // Mahsulot(lar) uchun wrapText va top alignment
      row.getCell(5).alignment = {
        horizontal: "left",
        vertical: "top",
        wrapText: true,
      };

      // Tavsif uchun wrapText va top alignment
      row.getCell(7).alignment = {
        horizontal: "left",
        vertical: "top",
        wrapText: true,
      };

      // Amal turi bo'yicha rang berish
      if (data._type === "ITEM_ADDED") {
        row.getCell(2).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FFC62828" }, // Qizil - qarz qo'shildi
        };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FFC62828" },
        };
      } else if (data._type === "PAYMENT") {
        row.getCell(2).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FF2E7D32" }, // Yashil - to'lov
        };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: "FF2E7D32" },
        };
      }

      // Miqdor (quantity) uchun rang
      if (data._quantity !== null && data._quantity !== undefined) {
        if (data._type === "ITEM_ADDED") {
          row.getCell(6).font = {
            size: FONT_SIZE,
            name: FONT_NAME,
            color: { argb: "FFC62828" },
          };
        } else if (data._type === "PAYMENT") {
          row.getCell(6).font = {
            size: FONT_SIZE,
            name: FONT_NAME,
            color: { argb: "FF2E7D32" },
          };
        }
      }
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

    // Mahsulot(lar) va Tavsif ustunlari header uchun wrapText
    headerRow.getCell(productNameColumnIndex + 1).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    headerRow.getCell(descriptionColumnIndex + 1).alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    // ==================== JAMI QATOR ====================
    const summaryRowNumber = sheet.rowCount + 2;

    // Umumiy summalar
    const summaryRow = sheet.getRow(summaryRowNumber);

    // Jami qo'shilgan (mahsulotlar)
    sheet.mergeCells(`A${summaryRowNumber}:B${summaryRowNumber}`);
    summaryRow.getCell(1).value = `Жами қўшилган сумма:`;
    summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    summaryRow.getCell(3).value = formatNumber(totalAdded);
    summaryRow.getCell(3).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: "FFC62828" },
    };
    summaryRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

    // Jami to'langan
    const paidRowNumber = summaryRowNumber + 1;
    const paidRow = sheet.getRow(paidRowNumber);

    sheet.mergeCells(`A${paidRowNumber}:B${paidRowNumber}`);
    paidRow.getCell(1).value = `Жами тўланган сумма:`;
    paidRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    paidRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    paidRow.getCell(3).value = formatNumber(totalPaid);
    paidRow.getCell(3).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: "FF2E7D32" },
    };
    paidRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

    // Qolgan summa
    const remainingRowNumber = paidRowNumber + 1;
    const remainingRow = sheet.getRow(remainingRowNumber);
    const remainingAmount = totalAdded - totalPaid;

    sheet.mergeCells(`A${remainingRowNumber}:B${remainingRowNumber}`);
    remainingRow.getCell(1).value = `Қолган сумма:`;
    remainingRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
    remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    remainingRow.getCell(3).value = formatNumber(remainingAmount);
    remainingRow.getCell(3).font = {
      bold: true,
      size: 12,
      name: FONT_NAME,
      color: { argb: remainingAmount > 0 ? "FFC62828" : "FF2E7D32" },
    };
    remainingRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

    // ==================== QO'SHIMCHA SOZLAMALAR ====================
    // Auto filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rowCount - 5, column: columns.length },
    };

    // Header qatorini muzlatish
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Default row height
    sheet.properties.defaultRowHeight = MIN_ROW_HEIGHT;

    // Buffer qaytarish
    return workbook.xlsx.writeBuffer();
  }
}

module.exports = new DebtService();
