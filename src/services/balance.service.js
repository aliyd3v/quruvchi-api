const { TransactionType } = require("../lib/prisma");
const AppError = require("../utils/AppError");

class balanceService {
  async recalculateUserBalance(tx, id) {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new AppError(404, "user_not_found");

    const [incomeTransfersRes, expenseTransfersRes, incomeTxnsRes, expenseTxnsRes] = await Promise.all([
      tx.fundTransfer.aggregate({
        where: { isActive: true, recipientUserId: id },
        _sum: { amount: true },
      }),
      tx.fundTransfer.aggregate({
        where: { isActive: true, senderUserId: id },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: {
          createdById: id,
          isActive: true,
          type: TransactionType.INCOME,
          objectId: null,
        },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: {
          createdById: id,
          isActive: true,
          type: TransactionType.EXPENSE,
          usedFromOrganizationBalance: false,
        },
        _sum: { amount: true },
      }),
    ]);

    const incomeTransfersAmount = incomeTransfersRes?._sum.amount || 0n;
    const expenseTransfersAmount = expenseTransfersRes?._sum.amount || 0n;
    const incomeTxnsAmount = incomeTxnsRes?._sum.amount || 0n;
    const expenseTxnsAmount = expenseTxnsRes?._sum.amount || 0n;

    const totalIncome = incomeTransfersAmount + incomeTxnsAmount;
    const totalExpense = expenseTransfersAmount + expenseTxnsAmount;
    const balance = totalIncome - totalExpense;

    const updateRes = await tx.user.updateMany({
      where: { id, version: user.version },
      data: { totalExpense, totalIncome, balance, version: { increment: 1 } },
    });
    if (!updateRes.count) throw new Error("VERSION_MISMATCH");

    return;
  }

  async recalculateObjectBalance(tx, id) {
    const object = await tx.object.findUnique({ where: { id } });
    if (!object) throw new AppError(404, "object_not_found");

    const [incomeTransfersRes, expenseTransfersRes, incomeTxnsRes, expenseTxnsRes] = await Promise.all([
      tx.fundTransfer.aggregate({
        where: { isActive: true, toObjectId: id },
        _sum: { amount: true },
      }),
      tx.fundTransfer.aggregate({
        where: { isActive: true, fromObjectId: id },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: {
          objectId: id,
          isActive: true,
          type: TransactionType.INCOME,
        },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: {
          objectId: id,
          isActive: true,
          type: TransactionType.EXPENSE,
          // usedFromOrganizationBalance: false,
        },
        _sum: { amount: true },
      }),
    ]);

    const incomeTransfersAmount = incomeTransfersRes?._sum.amount || 0n;
    const expenseTransfersAmount = expenseTransfersRes?._sum.amount || 0n;
    const incomeTxnsAmount = incomeTxnsRes?._sum.amount || 0n;
    const expenseTxnsAmount = expenseTxnsRes?._sum.amount || 0n;

    const totalIncome = incomeTransfersAmount + incomeTxnsAmount;
    const totalExpense = expenseTransfersAmount + expenseTxnsAmount;
    const balance = totalIncome - totalExpense;

    const updateRes = await tx.object.updateMany({
      where: { id, version: object.version },
      data: { totalIncome: incomeTxnsAmount, totalExpense: expenseTxnsAmount, balance },
    });
    if (!updateRes.count) throw new Error("VERSION_MISMATCH");

    return;
  }

  async recalculateOrgBalance(tx, id) {
    const org = await tx.organization.findUnique({ where: { id } });
    if (!org) throw new AppError(404, "organization_not_found");

    const [incomeTransfersRes, expenseTransfersRes, expenseTxnsRes] = await Promise.all([
      tx.fundTransfer.aggregate({
        where: { isActive: true, toOrganizationId: id },
        _sum: { amount: true },
      }),
      tx.fundTransfer.aggregate({
        where: { isActive: true, fromOrganizationId: id },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: {
          organizationId: id,
          isActive: true,
          usedFromOrganizationBalance: true,
          type: TransactionType.EXPENSE,
        },
        _sum: { amount: true },
      }),
    ]);

    const incomeTransfersAmount = incomeTransfersRes?._sum.amount || 0n;
    const expenseTransfersAmount = expenseTransfersRes?._sum.amount || 0n;
    const expenseTxnsAmount = expenseTxnsRes?._sum.amount || 0n;

    const totalIncome = incomeTransfersAmount;
    const totalExpense = expenseTransfersAmount + expenseTxnsAmount;
    const balance = totalIncome - totalExpense;

    const updateRes = await tx.organization.updateMany({
      where: { id, version: org.version },
      data: { totalIncome, totalExpense, balance },
    });
    if (!updateRes.count) throw new Error("VERSION_MISMATCH");

    return;
  }
}

module.exports = new balanceService();
