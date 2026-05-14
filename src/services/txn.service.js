const { Role } = require("../generated/prisma");
const balanceService = require("./balance.service");
const prisma = require("../lib/prisma");
const { TransactionType, OrganizationStatus } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const sleep = require("../utils/sleep");
const inventoryService = require("./inventory.service");

class txnService {
  async create({ objectId, amount, createdById, executedById, organizationId, branchId, isFromOrganizationBalance, purpose, date, notes, items, role, maxRetries = 3 } = {}) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt++;
      try {
        const result = await prisma.$transaction(async (tx) => {
          let object = null;
          if (objectId) {
            object = await tx.object.findUnique({ where: { id: objectId } });
            if (!object) throw new AppError(404, "object_not_found");
            if (!object.isActive) throw new AppError(400, "object_is_deleted");
          }

          const createdBy = await tx.user.findUnique({ where: { id: createdById } });
          if (!createdBy) throw new AppError(404, "user_not_found");
          if (!createdBy.isActive) throw new AppError(404, "user_is_deleted");

          let organization = null;
          if (organizationId) {
            organization = await tx.organization.findUnique({
              where: { id: organizationId },
              include: { parent: true },
            });
            if (!organization) throw new AppError(404, "organization_not_found");
            if (!organization.isActive) throw new AppError(404, "organization_is_deleted");
            if (organization.parent && !organization.parent.isActive) throw new AppError(404, "main_organization_is_deleted");
          }

          let branch = null;
          if (branchId) {
            branch = await tx.branch.findUnique({
              where: { id: branchId },
            });
            if (!branch?.isActive) throw new AppError(404, "branch_not_found");
            if (executedById) {
              const executedBy = await tx.user.findUnique({
                where: { id: executedById },
                select: { isActive: true },
              });
              if (!executedBy?.isActive) throw new AppError(404, "executed_by_not_found");
            }
          }

          const txn = await tx.transaction.create({
            data: {
              objectId,
              amount,
              type: TransactionType.EXPENSE,
              organizationId,
              branchId,
              createdById,
              executedById,
              purpose,
              date,
              notes,
              isReviewed: role === Role.SUPERADMIN,
              ...(organization && isFromOrganizationBalance && { usedFromOrganizationBalance: true }),
            },
            select: { id: true },
          });

          if (Array.isArray(items) && items.length > 0) {
            if (branch) {
              const preparedItems = [];

              for (const i of items) {
                const inventoryId = i.inventoryId;

                if (inventoryId) {
                  const inventory = await tx.inventory.findFirst({
                    where: { id: inventoryId },
                  });
                  if (!inventory) throw new AppError(404, "inventory_not_found");

                  preparedItems.push({
                    inventoryId,
                    name: inventory.name,
                    unit: inventory.unit,
                    parameter: inventory.parameter,
                    quantity: i.quantity,
                    pricePerUnit: i.pricePerUnit,
                    totalPrice: BigInt(Math.floor(i.quantity * Number(i.pricePerUnit))),
                    _inventoryVersion: inventory.version,
                  });
                } else {
                  const nameCondidat = await tx.inventory.findFirst({
                    where: { name: i.name, isActive: true },
                  });
                  if (nameCondidat) {
                    throw new AppError(400, "inventory_already_exists_with_this_name");
                  }
                  const newInventory = await tx.inventory.create({
                    data: {
                      name: i.name,
                      unit: i.unit,
                      pricePerUnit: i.pricePerUnit,
                      parameter: i.parameter,
                      createdById,
                    },
                  });

                  preparedItems.push({
                    inventoryId: newInventory.id,
                    name: i.name,
                    unit: i.unit,
                    parameter: i.parameter,
                    quantity: i.quantity,
                    pricePerUnit: i.pricePerUnit,
                    totalPrice: BigInt(Math.floor(i.quantity * Number(i.pricePerUnit))),
                    _inventoryVersion: newInventory.version,
                  });
                }
              }

              const itemsForInventoryHistoryAudit = [];
              for (const i of preparedItems) {
                const newTransactionItem = await tx.transactionItem.create({
                  data: {
                    name: i.name,
                    parameter: i.parameter,
                    unit: i.unit,
                    quantity: i.quantity,
                    pricePerUnit: i.pricePerUnit,
                    totalPrice: i.totalPrice,
                    transactionId: txn.id,
                  },
                });

                itemsForInventoryHistoryAudit.push({ ...i, transactionItemId: newTransactionItem.id });
              }

              await tx.inventoryHistory.createMany({
                data: itemsForInventoryHistoryAudit.map((i) => ({
                  transactionItemId: i.transactionItemId,
                  inventoryId: i.inventoryId,
                  quantity: i.quantity,
                  pricePerUnit: i.pricePerUnit,
                  totalPrice: i.totalPrice,
                  branchId,
                  type: "INPUT",
                  createdById,
                  organizationId,
                  executedById,
                })),
              });

              for (const i of preparedItems) {
                try {
                  await inventoryService._recalcInventory(tx, i.inventoryId);
                } catch (error) {
                  if (error instanceof AppError) {
                    throw new Error("VERSION_MISMATCH");
                  }
                  throw error;
                }
              }
            } else {
              const preparedItems = [];

              for (const i of items) {
                const preparedItem = {};
                const inventoryId = i.inventoryId;

                if (inventoryId) {
                  const inventory = await tx.inventory.findFirst({
                    where: { id: inventoryId, isActive: true },
                  });
                  if (!inventory) throw new AppError(404, "inventory_not_found");

                  preparedItem.name = inventory.name;
                  preparedItem.unit = inventory.unit;
                  preparedItem.parameter = inventory.parameter;
                } else {
                  preparedItem.name = i.name;
                  preparedItem.unit = i.unit;
                  preparedItem.parameter = i.parameter;
                }

                preparedItem.pricePerUnit = i.pricePerUnit;
                preparedItem.quantity = i.quantity;
                preparedItem.totalPrice = BigInt(Math.floor(i.quantity * Number(i.pricePerUnit)));
                preparedItem.transactionId = txn.id;

                preparedItems.push(preparedItem);
              }

              await tx.transactionItem.createMany({
                data: preparedItems,
              });
            }
          }

          if (!isFromOrganizationBalance) await balanceService.recalculateUserBalance(tx, createdById);
          if (object) await balanceService.recalculateObjectBalance(tx, objectId);
          if (organization && isFromOrganizationBalance) await balanceService.recalculateOrgBalance(tx, organizationId);
          if (organization && organization?.status === OrganizationStatus.NOT_ACTIVE) {
            await tx.organization.update({
              where: { id: organizationId },
              data: { status: OrganizationStatus.ACTIVE },
            });
          }

          return txn;
        });

        return result;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }

    throw new AppError(400, "failed_to_create_transaction");
  }

  async createIncomeToObject({ amount, notes, date, purpose, objectId, createdById, role, maxRetries = 3 } = {}) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt++;
      try {
        const result = await prisma.$transaction(async (tx) => {
          const object = await tx.object.findFirst({ where: { id: objectId, isActive: true } });
          if (!object) throw new AppError(404, "object_not_found");

          const txn = await tx.transaction.create({
            data: { amount: amount, type: TransactionType.INCOME, objectId, createdById, purpose, date, notes, isReviewed: role === Role.SUPERADMIN },
            select: { id: true },
          });

          await balanceService.recalculateObjectBalance(tx, objectId);

          return txn;
        });

        return result;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_create_transaction");
  }

  async createIncomeToUser({ amount, notes, purpose, createdById, role, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const createdBy = await tx.user.findUnique({
            where: { id: createdById },
          });
          if (!createdBy) throw new AppError(404, "user_not_found");

          const txn = await tx.transaction.create({
            data: {
              amount: amount,
              type: TransactionType.INCOME,
              createdById,
              purpose,
              notes,
              isReviewed: role === Role.SUPERADMIN,
            },
            select: { id: true },
          });

          await balanceService.recalculateUserBalance(tx, createdById);

          return txn;
        });

        return result;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_create_transaction");
  }

  async update({ id, purpose, date, notes, amount, branchId, executedById, objectId, organizationId, usedFromOrganizationBalance, maxRetries = 4 } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const txn = await tx.transaction.findUnique({
            where: { id },
          });
          if (!txn) throw new AppError(404, "transaction_not_found");
          if (!txn.isActive) throw new AppError(400, "transaction_is_deleted");
          if (txn.isSalary) throw new AppError(400, "cannot_update_is_is_salary");

          if (branchId) {
            const branch = await tx.branch.findFirst({
              where: { id: branchId },
            });
            if (!branch) throw new AppError(404, "branch_not_found");
            if (executedById) {
              const executedBy = await tx.user.findUnique({
                where: { id: executedById },
                select: { isActive: true },
              });
              if (!executedBy?.isActive) throw new AppError(404, "executed_by_not_found");
            }
          }

          await tx.transaction.update({
            where: { id },
            data: {
              purpose,
              date,
              notes,
              amount,
              objectId,
              branchId,
              executedById,
              organizationId,
              usedFromOrganizationBalance,
            },
          });

          if (branchId && txn.branchId && branchId !== txn.branchId) {
            await tx.inventoryHistory.updateMany({
              where: { transactionItem: { transactionId: id }, branchId: txn.branchId },
              data: { branchId },
            });
          }

          if (executedById && branchId && txn.branchId && executedById !== txn.executedById) {
            await tx.inventoryHistory.updateMany({
              where: { transactionItem: { transactionId: id }, branchId: txn.branchId },
              data: { executedById },
            });
          }

          if (objectId !== txn.objectId) {
            if (txn.objectId) await balanceService.recalculateObjectBalance(tx, txn.objectId);
            if (objectId) await balanceService.recalculateObjectBalance(tx, objectId);
          }

          if (organizationId !== txn.organizationId) {
            if (txn.organizationId) await balanceService.recalculateOrgBalance(tx, txn.organizationId);
            if (organizationId) await balanceService.recalculateOrgBalance(tx, organizationId);
          }

          if (txn.createdById) await balanceService.recalculateUserBalance(tx, txn.createdById);

          return;
        });

        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_update_transaction");
  }

  async updateItem({ itemId, name, parameter, quantity, pricePerUnit, unit, inventoryId, userId, maxRetries = 4 } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const item = await tx.transactionItem.findFirst({
            where: { isActive: true, id: itemId },
            include: { inventoryHistory: true, transaction: true },
          });
          if (!item) throw new AppError(404, "item_not_found");

          let inventory = null;
          let itemData = {
            quantity,
            pricePerUnit,
            totalPrice: BigInt(Math.floor(Number(pricePerUnit) * quantity)),
          };

          if (item.transaction.branchId) {
            if (inventoryId) {
              inventory = await tx.inventory.findFirst({
                where: { id: inventoryId, isActive: true },
              });
              if (!inventory) throw new AppError(404, "inventory_not_found");
            } else {
              inventory = await tx.inventory.create({
                data: {
                  name,
                  unit,
                  parameter,
                  pricePerUnit,
                  createdById: userId,
                },
              });
            }

            itemData.name = inventory.name;
            itemData.parameter = inventory.parameter;
            itemData.unit = inventory.unit;
          } else {
            itemData.name = name;
            itemData.parameter = parameter;
            itemData.unit = unit;
          }

          await tx.transactionItem.update({
            where: { id: itemId },
            data: itemData,
          });

          if (item.inventoryHistory && item.inventoryHistory.inventoryId) {
            await tx.inventoryHistory.delete({
              where: { id: item.inventoryHistory.id },
            });

            await tx.inventoryHistory.create({
              data: {
                quantity,
                pricePerUnit,
                totalPrice: itemData.totalPrice,
                type: "INPUT",
                inventoryId: inventory.id,
                branchId: item.transaction.branchId,
                transactionItemId: itemId,
                createdById: userId,
              },
            });

            try {
              await inventoryService._recalcInventory(tx, item.inventoryHistory.inventoryId);
              await inventoryService._recalcInventory(tx, inventory.id);
            } catch (error) {
              if (error instanceof AppError) {
                throw new Error("VERSION_MISMATCH");
              }
              throw error;
            }
          }

          await this._recalcTxnAmount(tx, item.transactionId);

          return;
        });

        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt >= maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_update_transaction");
  }

  async deleteItem({ itemId, deletedById, maxRetries = 4 } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const item = await tx.transactionItem.findFirst({
            where: { isActive: true, id: itemId },
            include: { inventoryHistory: true },
          });
          if (!item) throw new AppError(404, "item_not_found");

          await tx.transactionItem.update({
            where: { id: itemId },
            data: {
              isActive: false,
              deletedAt: new Date(),
              deletedById,
            },
          });

          if (item.inventoryHistory) {
            await tx.inventoryHistory.update({
              where: { id: item.inventoryHistory.id },
              data: {
                isActive: false,
                deletedById,
              },
            });

            await inventoryService._recalcInventory(tx, item.inventoryHistory.inventoryId);
          }

          await this._recalcTxnAmount(tx, item.transactionId);

          return;
        });

        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt >= maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_update_transaction");
  }

  async addItem({ transactionId, inventoryId, name, parameter, quantity, pricePerUnit, unit, createdById, maxRetries = 4 } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const txn = await tx.transaction.findFirst({
            where: { id: transactionId, isActive: true },
          });
          if (!txn) throw new AppError(404, "transaction_not_found");

          const preparedData = {
            transactionId,
            createdById,
            quantity,
            pricePerUnit,
            totalPrice: BigInt(Math.floor(Number(pricePerUnit) * quantity)),
          };

          let inventory = null;

          if (txn.branchId) {
            if (inventoryId) {
              inventory = await tx.inventory.findFirst({
                where: { id: inventoryId, isActive: true },
              });
              if (!inventory) throw new AppError(404, "inventory_not_found");
            } else {
              inventory = await tx.inventory.create({
                data: {
                  name,
                  unit,
                  parameter,
                  pricePerUnit,
                  createdById,
                },
              });
            }

            preparedData.name = inventory.name;
            preparedData.parameter = inventory.parameter;
            preparedData.unit = inventory.unit;
          } else {
            preparedData.name = name;
            preparedData.parameter = parameter;
            preparedData.unit = unit;
          }

          const newTxnItem = await tx.transactionItem.create({
            data: preparedData,
          });

          await tx.inventoryHistory.create({
            data: {
              quantity,
              pricePerUnit,
              totalPrice: preparedData.totalPrice,
              type: "INPUT",
              branchId: txn.branchId,
              inventoryId: inventory.id,
              transactionItemId: newTxnItem.id,
            },
          });

          await inventoryService._recalcInventory(tx, inventory.id);

          await this._recalcTxnAmount(tx, item.transactionId);

          return;
        });

        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt >= maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_update_transaction");
  }

  async _recalcTxnAmount(tx, id) {
    try {
      const [txn, itemsAgg] = await Promise.all([
        tx.transaction.findUnique({
          where: { id },
        }),
        tx.transactionItem.aggregate({
          where: { isActive: true, transactionId: id },
          _sum: { totalPrice: true },
        }),
      ]);
      if (!txn) throw new AppError(404, "transaction_not_found");

      await tx.transaction.update({
        where: { id },
        data: { amount: itemsAgg?._sum?.totalPrice || 0n },
      });

      if (txn.usedFromOrganizationBalance && txn.organizationId) {
        await balanceService.recalculateOrgBalance(tx, txn.organizationId);
      }
      if (!txn.usedFromOrganizationBalance && txn.createdById) {
        await balanceService.recalculateUserBalance(tx, txn.createdById);
      }
      if (txn.objectId) {
        await balanceService.recalculateObjectBalance(tx, txn.objectId);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async delete({ id, deletedById, role, maxRetries = 4 } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const txn = await tx.transaction.findUnique({
            where: { id },
            include: {
              salaryPayment: true,
              items: {
                include: {
                  inventoryHistory: true,
                },
              },
            },
          });
          if (!txn) throw new AppError(404, "transaction_not_found");
          if (!txn.isActive) throw new AppError(400, "transaction_is_deleted");

          if (role !== Role.SUPERADMIN && txn.createdById !== deletedById) throw new AppError(400, "no_access");
          if (role !== Role.SUPERADMIN && new Date(txn.createdAt).getTime() + 10 * 60 * 1000 < Date.now()) throw new AppError(400, "allowed_time_for_delete_is_expired");

          await tx.transaction.update({
            where: { id },
            data: {
              isActive: false,
              deletedById,
              deletedAt: new Date(),
            },
          });

          if (!txn.usedFromOrganizationBalance && txn.createdById) await balanceService.recalculateUserBalance(tx, txn.createdById);
          if (txn.usedFromOrganizationBalance && txn.organizationId) await balanceService.recalculateOrgBalance(tx, txn.organizationId);
          if (txn.objectId) await balanceService.recalculateObjectBalance(tx, txn.objectId);

          if (txn.salaryPayment && txn.isSalary) {
            const payment = await tx.salaryPayment.findUnique({
              where: { id: txn.salaryPayment.id },
              include: { appliedMonths: true },
            });
            if (!payment) throw new AppError(404, "salary_payment_not_found");

            for (const sm of payment.appliedMonths) {
              const salaryMonth = await tx.salaryMonth.findUnique({ where: { id: sm.salaryMonthId } });
              if (salaryMonth) {
                const version = salaryMonth.version;
                const amountApplied = sm.amountApplied;
                let status = salaryMonth.status;

                const newTotalPaid = salaryMonth.totalPaid - amountApplied;
                const newPaidPercent = newTotalPaid !== 0n ? Math.floor((Number(newTotalPaid) * 100) / Number(salaryMonth.baseSalary)) : 0;

                const startDate = new Date(salaryMonth.startDate);
                const endDate = salaryMonth.endDate ? new Date(salaryMonth.endDate) : null;

                if (salaryMonth.type === "COMMISSION") {
                  if (newPaidPercent >= 100) status = "PAID";
                  else if (newPaidPercent < 100 && newPaidPercent > 0) status = "PARTIALLY_PAID";
                  else status = "UNPAID";
                } else {
                  if (startDate.getTime() > Date.now()) {
                    if (newPaidPercent >= 100) status = "PAID";
                    else if (newPaidPercent < 100 && newPaidPercent > 0) status = "PARTIALLY_PAID";
                    else status = "UNPAID";
                  } else if (startDate.getTime() < Date.now() && Date.now() < endDate.getTime()) {
                    if (newPaidPercent >= 100) status = "PAID";
                    else if (newPaidPercent < 100 && newPaidPercent > 0) status = "PARTIALLY_PAID";
                    else status = "UNPAID";
                  } else {
                    if (newPaidPercent >= 100) status = "PAID";
                    else status = "LATE";
                  }
                }

                const resUpdate = await tx.salaryMonth.updateMany({
                  where: { id: sm.salaryMonthId, version },
                  data: {
                    totalPaid: newTotalPaid,
                    version: { increment: 1 },
                    paidPercent: newPaidPercent,
                    status,
                  },
                });
                if (resUpdate.count === 0) throw new Error("VERSION_MISMATCH");

                await tx.salaryAppliedPayment.update({
                  where: { id: sm.id },
                  data: { isActive: false },
                });
              }
            }

            await tx.salaryPayment.update({
              where: { id: payment.id },
              data: { isActive: false },
            });
          }

          if (txn.branchId) {
            for (const i of txn.items) {
              if (i.inventoryHistory?.inventoryId) {
                await inventoryService.recalcInventoryQuantity(tx, i.inventoryHistory.inventoryId);
              }
            }
          }

          return;
        });

        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_delete_transaction");
  }

  async restore({ maxRetries = 4, txn } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const transaction = await tx.transaction.findUnique({
            where: { id: txn.id, isActive: false },
            include: {
              salaryPayment: {
                include: {
                  appliedMonths: true,
                },
              },
              items: {
                include: {
                  inventoryHistory: true,
                },
              },
            },
          });
          if (!transaction) throw new AppError(404, "transaction_not_found");
          if (transaction.isActive) throw new AppError(400, "transaction_already_active");

          if (!transaction.usedFromOrganizationBalance) await balanceService.recalculateUserBalance(tx, transaction.createdById);
          if (transaction.usedFromOrganizationBalance && transaction.organizationId) await balanceService.recalculateOrgBalance(tx, transaction.organizationId);
          if (transaction.objectId) await balanceService.recalculateObjectBalance(tx, transaction.objectId);

          if (transaction.salaryPayment && transaction.isSalary) {
            const payment = await tx.salaryPayment.findUnique({
              where: { id: salaryPayment.id },
              include: {
                appliedMonths: {
                  where: { isActive: false }, // O'chirilgan appliedMonths ni topish
                },
                transaction: { include: { object: true } },
              },
            });

            if (payment) {
              for (const sm of payment.appliedMonths) {
                const salaryMonth = await tx.salaryMonth.findUnique({
                  where: { id: sm.salaryMonthId },
                });

                if (salaryMonth) {
                  const version = salaryMonth.version;
                  const amountApplied = sm.amountApplied;
                  let status = salaryMonth.status;
                  const newTotalPaid = salaryMonth.totalPaid + amountApplied;
                  const newPaidPercent = newTotalPaid !== 0n ? Math.floor((Number(newTotalPaid) * 100) / Number(salaryMonth.baseSalary)) : 0;

                  const startDate = new Date(salaryMonth.startDate);
                  const endDate = salaryMonth.endDate ? new Date(salaryMonth.endDate) : null;

                  if (salaryMonth.type === "COMMISSION") {
                    if (newPaidPercent >= 100) status = "PAID";
                    else if (newPaidPercent < 100 && newPaidPercent > 0) status = "PARTIALLY_PAID";
                    else status = "UNPAID";
                  } else {
                    if (startDate.getTime() > Date.now()) {
                      if (newPaidPercent >= 100) status = "PAID";
                      else if (newPaidPercent < 100 && newPaidPercent > 0) status = "PARTIALLY_PAID";
                      else status = "UNPAID";
                    } else if (startDate.getTime() < Date.now() && endDate && Date.now() < endDate.getTime()) {
                      if (newPaidPercent >= 100) status = "PAID";
                      else if (newPaidPercent < 100 && newPaidPercent > 0) status = "PARTIALLY_PAID";
                      else status = "UNPAID";
                    } else {
                      if (newPaidPercent >= 100) status = "PAID";
                      else status = "LATE";
                    }
                  }

                  const resUpdate = await tx.salaryMonth.updateMany({
                    where: { id: sm.salaryMonthId, version },
                    data: {
                      totalPaid: newTotalPaid,
                      version: { increment: 1 },
                      paidPercent: newPaidPercent,
                      status,
                    },
                  });
                  if (!resUpdate.count) throw new Error("VERSION_MISMATCH");

                  await tx.salaryAppliedPayment.update({
                    where: { id: sm.id },
                    data: { isActive: true },
                  });
                }
              }

              await tx.salaryPayment.update({
                where: { id: payment.id },
                data: { isActive: true },
              });
            }
          }

          await tx.transaction.update({
            where: { id: txn.id },
            data: {
              isActive: true,
              deletedById: null,
              deletedAt: null,
            },
          });

          if (transaction.branchId) {
            for (const i of transaction.items) {
              await inventoryService.recalcInventoryQuantity(tx, i.inventoryHistory.inventoryId);
            }
          }

          return;
        });

        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt >= maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "failed_to_restore_transaction");
  }
}

module.exports = new txnService();
