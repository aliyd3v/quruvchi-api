const { SalaryStatus, TransactionType, SalaryMonthType, PaymentMethod } = require("../generated/prisma");
const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const { toMinor, fromMinorUnits } = require("../utils/amount");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { Role } = require("../generated/prisma");
const { formatZodError } = require("../utils/formatZodError");
const balanceService = require("../services/balance.service");
const sleep = require("../utils/sleep");

const allowedColumnKeys = ["fname", "role", "currentBaseSalary", "currentSalaryMonthEndDate", "lastPaidDate"];

async function createSalaryMonths(input) {
  try {
    let { ownerId, baseSalary, startDate, quantityMonth, createdById, objectId, duties, type } = input;

    const salaryMonthsData = [];
    let prevEnd = null;
    let currentStart = new Date(startDate);

    while (quantityMonth > 0) {
      quantityMonth--;

      if (prevEnd) {
        currentStart = new Date(prevEnd);
        currentStart.setDate(currentStart.getDate() + 1);
      }

      if (type === SalaryMonthType.DAILY) {
        const newStartDate = new Date(currentStart);
        const newEndDate = new Date(newStartDate);
        const month = newStartDate.getMonth();
        const year = newStartDate.getFullYear();
        salaryMonthsData.push({
          ownerId,
          baseSalary,
          startDate: newStartDate,
          endDate: newEndDate,
          objectId,
          month,
          year,
          createdById,
          duties,
          type,
        });
        prevEnd = newEndDate;
      } else {
        const newStartDate = new Date(currentStart);
        const newEndDate = new Date(newStartDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        newEndDate.setDate(newEndDate.getDate() - 1);
        const month = newStartDate.getMonth();
        const year = newStartDate.getFullYear();
        salaryMonthsData.push({
          ownerId,
          baseSalary,
          startDate: newStartDate,
          endDate: newEndDate,
          objectId,
          month,
          year,
          createdById,
          duties,
          type,
        });
        prevEnd = newEndDate;
      }
    }

    if (salaryMonthsData.length === 0) return;

    const earliest = new Date(Math.min(...salaryMonthsData.map((s) => s.startDate.getTime())));
    const latest = new Date(Math.max(...salaryMonthsData.map((s) => s.endDate.getTime())));

    const existing = await prisma.salaryMonth.findFirst({
      where: {
        ownerId,
        isActive: true,
        AND: [{ startDate: { lte: latest } }, { endDate: { gte: earliest } }],
      },
    });
    if (existing) throw new AppError(400, "salary_dates_overlap_with_existing_periods");

    await prisma.salaryMonth.createMany({ data: salaryMonthsData });

    let currentSalaryMonthEndDate = null;
    let currentBaseSalary = 0;
    const nowMs = Date.now();

    for (const sm of salaryMonthsData) {
      const s = new Date(sm.startDate).getTime();
      const e = new Date(sm.endDate).getTime();
      if (nowMs >= s && nowMs <= e) {
        currentSalaryMonthEndDate = sm.endDate;
        currentBaseSalary = sm.baseSalary;
        break;
      }
    }

    if (currentSalaryMonthEndDate) {
      await prisma.user.update({
        where: { id: ownerId },
        data: {
          currentBaseSalary: currentBaseSalary,
          currentSalaryMonthEndDate,
        },
      });
    }
  } catch (error) {
    throw error;
  }
}

async function writeSalaryToMonth({ salaryMonthId, objectId, amount, ownerId, type, paymentMethod, description, createdById, role, maxRetries = 4 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      await prisma.$transaction(async (tx) => {
        let currentSalryMonth = null;
        if (salaryMonthId) {
          currentSalryMonth = await tx.salaryMonth.findFirst({
            where: { id: salaryMonthId, isActive: true },
          });
          if (!currentSalryMonth) currentSalryMonth = null;
        }

        const owner = await tx.user.findFirst({ where: { id: ownerId, isActive: true } });
        if (!owner) throw new AppError(404, "user_not_found");

        let txnId = null;

        if (type !== "PENALTY") {
          let object = null;

          if (objectId) {
            object = await tx.object.findFirst({ where: { id: objectId, isActive: true } });
            if (!object) throw new AppError(404, "object_not_found");
          }

          const createdBy = await tx.user.findUnique({ where: { id: createdById } });
          if (!createdBy) throw new AppError(404, "user_not_found");

          const txn = await tx.transaction.create({
            data: {
              objectId,
              amount,
              type: TransactionType.EXPENSE,
              date: new Date(),
              createdById,
              isSalary: true,
              purpose: "",
              notes: description,
              isReviewed: role === Role.SUPERADMIN,
            },
            select: { id: true },
          });
          txnId = txn.id;

          if (!object) await balanceService.recalculateUserBalance(tx, createdById);
          else await balanceService.recalculateObjectBalance(tx, objectId);
        }

        const salaryPayment = await tx.salaryPayment.create({
          data: {
            ownerId,
            amount,
            remaining: 0n,
            isClosed: true,
            type,
            description,
            paymentMethod,
            createdById,
            transactionId: txnId,
          },
        });

        if (currentSalryMonth !== null && currentSalryMonth.type === "COMMISSION") {
          let userSalaryMonth = currentSalryMonth;
          const newTotalPaid = userSalaryMonth.totalPaid + amount;
          if (newTotalPaid < userSalaryMonth.baseSalary) {
            await tx.salaryMonth.update({
              where: { id: userSalaryMonth.id },
              data: {
                totalPaid: newTotalPaid,
                status: "PARTIALLY_PAID",
                paidPercent: Math.floor((Number(newTotalPaid) * 100) / Number(userSalaryMonth.baseSalary)),
                remainingPercent: 100 - Math.floor((Number(newTotalPaid) * 100) / Number(userSalaryMonth.baseSalary)),
              },
            });
            await tx.salaryAppliedPayment.create({
              data: {
                salaryMonthId: userSalaryMonth.id,
                salaryPaymentId: salaryPayment.id,
                amountApplied: amount,
              },
            });
          } else {
            await tx.salaryMonth.update({
              where: { id: userSalaryMonth.id },
              data: {
                totalPaid: newTotalPaid,
                status: SalaryStatus.PAID,
                paidPercent: Math.floor((Number(newTotalPaid) * 100) / Number(userSalaryMonth.baseSalary)),
                remainingPercent: 100 - Math.floor((Number(newTotalPaid) * 100) / Number(userSalaryMonth.baseSalary)),
              },
            });
            await tx.salaryAppliedPayment.create({
              data: {
                salaryMonthId: userSalaryMonth.id,
                salaryPaymentId: salaryPayment.id,
                amountApplied: amount,
              },
            });
          }
        } else {
          async function writeSalaryPaymentToMonthsOptimistic(salaryPaymentInput) {
            const { salaryPaymentId, ownerId, remaining, type, createdById } = salaryPaymentInput;
            const remainingAmount = BigInt(remaining);
            let userSalaryMonth = await tx.salaryMonth.findFirst({
              where: { isActive: true, ownerId, status: { not: "PAID" }, type: { not: "COMMISSION" } },
              orderBy: { startDate: "asc" },
            });
            if (!userSalaryMonth) {
              const lastSalaryMonth = await tx.salaryMonth.findFirst({
                where: { isActive: true, ownerId, type: { not: "COMMISSION" } },
                orderBy: { startDate: "desc" },
              });
              if (!lastSalaryMonth) throw new AppError(404, "no_have_any_salary_month_in_this_user");

              if (lastSalaryMonth.type === "MONTHLY") {
                let newStartDate = new Date(lastSalaryMonth.endDate);
                newStartDate.setDate(newStartDate.getDate() + 1);
                let newEndDate = new Date(newStartDate);
                newEndDate.setMonth(newEndDate.getMonth() + 1);
                newEndDate.setDate(newEndDate.getDate() - 1);
                userSalaryMonth = await tx.salaryMonth.create({
                  data: {
                    baseSalary: lastSalaryMonth.baseSalary,
                    startDate: newStartDate,
                    endDate: newEndDate,
                    year: newStartDate.getFullYear(),
                    month: newStartDate.getMonth(),
                    type: lastSalaryMonth.type,
                    createdById,
                    ownerId,
                    duties: lastSalaryMonth.duties,
                  },
                });
              } else {
                let newStartDate = new Date(lastSalaryMonth.endDate);
                newStartDate.setDate(newStartDate.getDate() + 1);
                userSalaryMonth = await tx.salaryMonth.create({
                  data: {
                    baseSalary: lastSalaryMonth.baseSalary,
                    startDate: newStartDate,
                    endDate: newStartDate,
                    year: newStartDate.getFullYear(),
                    month: newStartDate.getMonth(),
                    type: lastSalaryMonth.type,
                    createdById,
                    ownerId,
                    duties: lastSalaryMonth.duties,
                  },
                });
              }
            }

            const newTotalPaid = userSalaryMonth.totalPaid + remainingAmount;
            const amountNeeded = userSalaryMonth.baseSalary - userSalaryMonth.totalPaid;
            if (newTotalPaid < userSalaryMonth.baseSalary) {
              await tx.salaryMonth.update({
                where: { id: userSalaryMonth.id },
                data: {
                  totalPaid: newTotalPaid,
                  status: new Date(userSalaryMonth.endDate).getTime() < Date.now() ? SalaryStatus.LATE : SalaryStatus.PARTIALLY_PAID,
                  paidPercent: Math.floor((Number(newTotalPaid) * 100) / Number(userSalaryMonth.baseSalary)),
                  remainingPercent: 100 - Math.floor((Number(newTotalPaid) * 100) / Number(userSalaryMonth.baseSalary)),
                },
              });
              await tx.salaryAppliedPayment.create({
                data: {
                  salaryMonthId: userSalaryMonth.id,
                  salaryPaymentId,
                  amountApplied: remainingAmount,
                },
              });
            } else if (newTotalPaid === userSalaryMonth.baseSalary) {
              await tx.salaryMonth.update({
                where: { id: userSalaryMonth.id },
                data: {
                  totalPaid: userSalaryMonth.baseSalary,
                  status: SalaryStatus.PAID,
                  paidPercent: 100,
                  remainingPercent: 0,
                },
              });
              await tx.salaryAppliedPayment.create({
                data: {
                  salaryMonthId: userSalaryMonth.id,
                  salaryPaymentId,
                  amountApplied: remainingAmount,
                },
              });
            } else {
              const overflow = newTotalPaid - userSalaryMonth.baseSalary;
              await tx.salaryMonth.update({
                where: { id: userSalaryMonth.id },
                data: {
                  totalPaid: userSalaryMonth.baseSalary,
                  status: SalaryStatus.PAID,
                  paidPercent: 100,
                  remainingPercent: 0,
                },
              });
              await tx.salaryAppliedPayment.create({
                data: {
                  salaryMonthId: userSalaryMonth.id,
                  salaryPaymentId,
                  amountApplied: amountNeeded,
                },
              });
              await writeSalaryPaymentToMonthsOptimistic({
                salaryPaymentId,
                ownerId,
                remaining: overflow,
                type,
                createdById,
              });
            }
          }
          const salaryPaymentInput = {
            salaryPaymentId: salaryPayment.id,
            ownerId,
            remaining: amount,
            type,
            createdById,
          };
          await writeSalaryPaymentToMonthsOptimistic(salaryPaymentInput);
        }

        await tx.user.update({ where: { id: ownerId }, data: { lastPaidDate: new Date() } });

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
  throw new AppError(400, "failed_to_create_transaction");
}

async function updateSalaryMonth({ id, baseSalary, startDate, duties, negotiation, maxRetries = 3 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      await prisma.$transaction(async (tx) => {
        const salaryMonth = await tx.salaryMonth.findFirst({
          where: { id, isActive: true },
          include: {
            appliedPayments: { where: { isActive: true } },
            owner: true,
          },
        });
        if (!salaryMonth) throw new AppError(404, "salary_month_not_found");
        const hasPayments = salaryMonth.appliedPayments.length > 0;
        if (hasPayments) throw new AppError(400, "cannot_update_critical_fields_when_payments_exist");

        const updateData = { baseSalary };
        let newStartDate = startDate;
        let newEndDate = null;
        updateData.startDate = newStartDate;
        updateData.year = newStartDate.getFullYear();

        if (salaryMonth.type === "COMMISSION") {
          updateData.month = newStartDate.getMonth();
        } else {
          if (salaryMonth.type === "DAILY") {
            newEndDate = new Date(newStartDate);
          } else if (salaryMonth.type === "MONTHLY") {
            newEndDate = new Date(newStartDate);
            newEndDate.setMonth(newEndDate.getMonth() + 1);
            newEndDate.setDate(newEndDate.getDate() - 1);
          }

          updateData.endDate = newEndDate;
          const finalStartDate = new Date(newStartDate);
          finalStartDate.setHours(0, 0, 0, 0);
          const finalEndDate = new Date(newEndDate);
          finalEndDate.setHours(23, 59, 59, 999);
          const overlap = await tx.salaryMonth.findFirst({
            where: {
              id: { not: id },
              ownerId: salaryMonth.ownerId,
              isActive: true,
              AND: [{ startDate: { lte: finalEndDate } }, { endDate: { gte: finalStartDate } }],
            },
          });
          if (overlap) throw new AppError(400, "salary_dates_overlap_with_existing_periods");
        }
        if (duties) updateData.duties = duties;
        if (negotiation) updateData.negotiation = negotiation;

        const currentVersion = salaryMonth.version;
        updateData.version = { increment: 1 };
        const updateRes = await tx.salaryMonth.updateMany({
          where: { id, version: currentVersion },
          data: updateData,
        });
        if (updateRes.count === 0) throw new Error("VERSION_MISMATCH");

        if (salaryMonth.type !== "COMMISSION") {
          const nowMs = Date.now();
          const finalStartDate = new Date(newStartDate);
          finalStartDate.setHours(0, 0, 0, 0);
          const smStart = finalStartDate.getTime();
          const finalEndDate = new Date(newEndDate);
          finalEndDate.setHours(23, 59, 59, 999);
          const smEnd = finalEndDate.getTime();
          if (nowMs >= smStart && nowMs < smEnd) {
            await tx.user.update({
              where: { id: salaryMonth.ownerId },
              data: { currentSalaryMonthEndDate: newEndDate },
            });
          }
        }
        return;
      });
      return;
    } catch (err) {
      if (String(err.message).includes("VERSION_MISMATCH")) {
        if (attempt >= maxRetries) throw new AppError(400, "conflict_retry_failed");
        const backoff = 50 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 50);
        await sleep(backoff + jitter);
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new AppError(400, "failed_to_update_salary_month");
}

async function deleteOneSalaryPaymentOptimistic({ id, deletedById, maxRetries = 4 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      await prisma.$transaction(async (tx) => {
        const payment = await tx.salaryPayment.findFirst({
          where: { id, isActive: true },
          include: {
            appliedMonths: true,
            transaction: true,
          },
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

        if (payment.transactionId) {
          await tx.transaction.update({
            where: { id: payment.transactionId },
            data: { isActive: false, deletedById },
          });
        }

        if (payment.type !== "PENALTY") {
          if (payment.transaction?.objectId) await balanceService.recalculateObjectBalance(tx, payment.transaction.objectId);
          if (payment.createdById && !payment.transaction?.objectId) await balanceService.recalculateUserBalance(tx, payment.createdById);
        }

        await tx.salaryPayment.update({
          where: { id: payment.id },
          data: { isActive: false },
        });

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

  throw new AppError(400, "failed_to_create_transaction");
}

async function deleteOneSalaryMonthOptimistic({ id, maxRetries = 4 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      await prisma.$transaction(async (tx) => {
        const salaryMonth = await tx.salaryMonth.findFirst({
          where: { id, isActive: true },
          include: {
            appliedPayments: {
              where: { isActive: true },
              take: 1,
            },
          },
        });
        if (!salaryMonth) throw new AppError(404, "salary_month_not_found");
        if (salaryMonth.appliedPayments.length > 0) throw new AppError(400, "cannot_delete_salary_month_with_payments");

        await tx.salaryMonth.update({
          where: { id },
          data: { isActive: false },
        });

        const nowMs = Date.now();
        const smStart = new Date(salaryMonth.startDate).getTime();
        const smEnd = new Date(salaryMonth.endDate).getTime();

        if (nowMs >= smStart && nowMs <= smEnd) {
          const nextSalaryMonth = await tx.salaryMonth.findFirst({
            where: {
              ownerId: salaryMonth.ownerId,
              isActive: true,
              startDate: { gt: salaryMonth.endDate },
            },
            orderBy: { startDate: "asc" },
          });

          if (nextSalaryMonth) {
            await tx.user.update({
              where: { id: salaryMonth.ownerId },
              data: {
                currentBaseSalary: nextSalaryMonth.baseSalary,
                currentSalaryMonthEndDate: nextSalaryMonth.endDate,
              },
            });
          } else {
            const prevSalaryMonth = await tx.salaryMonth.findFirst({
              where: {
                ownerId: salaryMonth.ownerId,
                isActive: true,
                startDate: { lt: salaryMonth.startDate },
              },
              orderBy: { startDate: "desc" },
            });

            if (prevSalaryMonth) {
              await tx.user.update({
                where: { id: salaryMonth.ownerId },
                data: {
                  currentBaseSalary: prevSalaryMonth.baseSalary,
                  currentSalaryMonthEndDate: prevSalaryMonth.endDate,
                },
              });
            } else {
              await tx.user.update({
                where: { id: salaryMonth.ownerId },
                data: {
                  currentBaseSalary: 0,
                  currentSalaryMonthEndDate: null,
                },
              });
            }
          }
        }

        return;
      });

      return;
    } catch (err) {
      if (String(err.message).includes("VERSION_MISMATCH")) {
        if (attempt >= maxRetries) throw new AppError(400, "conflict_retry_failed");
        const backoff = 50 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 50);
        await sleep(backoff + jitter);
        continue;
      } else {
        throw err;
      }
    }
  }

  throw new AppError(400, "failed_to_delete_salary_month");
}

const salaryController = {
  async createSalaryMonth(req, res, next) {
    try {
      const ownerId = req.body.ownerId;
      const baseSalary = req.body.baseSalary;
      const startDate = new Date(req.body.startDate);
      const quantityMonth = req.body.quantityMonth;
      const duties = req.body.duties;
      const objectId = req.body.objectId;
      const negotiation = req.body.negotiation;
      const type = req.body.type;
      const isExistObject = req.body.isExistObject;
      const nameObject = typeof req.body.nameObject === "string" ? req.body.nameObject.trim() || null : null;
      const budgetObject =
        typeof req.body.budgetObject === "number" ? (Number.isNaN(req.body.budgetObject) && Number(req.body.budgetObject) > 0 ? toMinor(Number(req.body.budgetObject)) : null) : null;

      if (type === SalaryMonthType.COMMISSION) {
        if (!negotiation) throw new AppError(400, "negotiation_cannot_be_empty_if_salary_month_type_equel_to_commisstion");

        const user = await prisma.user.findFirst({ where: { isActive: true, id: ownerId } });
        if (!user) throw new AppError(404, "user_not_found");

        if (isExistObject) {
          if (objectId) {
            const object = await prisma.object.findFirst({ where: { id: objectId, isActive: true } });
            if (!object) throw new AppError(404, "object_not_found");
          } else {
            throw new AppError(400, "object_is_required");
          }
        } else {
          if (!nameObject && !budgetObject) throw new AppError(400, "object_is_required");
        }
        const year = startDate.getFullYear();

        await prisma.salaryMonth.create({
          data: {
            year,
            ownerId,
            baseSalary: baseSalary,
            startDate,
            duties,
            objectId: objectId ?? null,
            negotiation,
            nameObject,
            budgetObject,
            type,
            year,
          },
        });
      } else {
        if (Number.isNaN(Number(quantityMonth)) || Number(quantityMonth) <= 0) {
          throw new AppError(400, "validation_error", formatZodError([{ path: ["quantityMonth"], message: "invalid_quantity_month" }]));
        }

        await createSalaryMonths({
          ownerId,
          baseSalary,
          startDate,
          quantityMonth,
          objectId: objectId ?? null,
          createdById: req.user.id,
          duties,
          type,
        });
      }

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAllSalaryMonths(_req, res, next) {
    try {
      const salaryMonths = await prisma.salaryMonth.findMany({
        where: { isActive: true },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          duties: true,
          owner: {
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
            },
          },
        },
      });

      res.status(200).json({
        status: "success",
        data: salaryMonths,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserSalaryMonths(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      let { year } = req.query;
      year = !Number.isNaN(Number(year)) && Number(year) >= 2000 && Number.isInteger(Number(year)) ? Number(year) : new Date().getFullYear();

      const user = await prisma.user.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          fname: true,
          lname: true,
          email: true,
          phone: true,
          role: true,
          avatar: true,
          createdAt: true,
          currentBaseSalary: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      const yearsList = await prisma.salaryMonth
        .groupBy({
          by: ["year"],
          where: { isActive: true, ownerId: id },
          orderBy: { year: "desc" },
        })
        .then((res) => res.map((r) => r.year));

      const totalsResult = {
        SALARY: 0,
        AVANS: 0,
        PENALTY: 0,
      };

      const [totalsRes, totalPayments, userSalaryMonths] = await Promise.all([
        prisma.salaryPayment.groupBy({ by: ["type"], _sum: { amount: true }, where: { ownerId: id, isActive: true, owner: { isActive: true } } }),
        prisma.salaryPayment.count({ where: { ownerId: id, isActive: true, owner: { isActive: true } } }),
        prisma.salaryMonth.findMany({
          where: {
            ownerId: id,
            owner: { isActive: true },
            isActive: true,
            year,
          },
          select: {
            id: true,
            day: true,
            month: true,
            year: true,
            startDate: true,
            endDate: true,
            duties: true,
            baseSalary: true,
            totalPaid: true,
            paidPercent: true,
            remainingPercent: true,
            status: true,
            type: true,
            budgetObject: true,
            nameObject: true,
            appliedPayments: {
              where: { isActive: true },
              select: {
                id: true,
                amountApplied: true,
                salaryPayment: {
                  select: {
                    id: true,
                    amount: true,
                    createdAt: true,
                    createdBy: {
                      where: { isActive: true },
                      select: {
                        id: true,
                        fname: true,
                        lname: true,
                        role: true,
                        avatar: true,
                      },
                    },
                    paymentMethod: true,
                    type: true,
                    description: true,
                  },
                },
              },
            },
            object: {
              select: {
                id: true,
                name: true,
                budget: true,
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
                avatar: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { startDate: "asc" },
        }),
      ]);

      for (g of totalsRes) totalsResult[g.type] = fromMinorUnits(g._sum.amount);

      const totals = {
        totalPaid: totalsResult.AVANS + totalsResult.SALARY,
        totalPayments,
        totalPenalties: totalsResult.PENALTY,
      };

      const nowMs = Date.now();
      totals.currentBaseSalary = fromMinorUnits(Number(user.currentBaseSalary));
      res.status(200).json({
        status: "success",
        user: { ...user, currentBaseSalary: fromMinorUnits(Number(user.currentBaseSalary)) },
        totals,
        selectedYear: year,
        yearsList: yearsList.filter((year) => !!year),
        data: userSalaryMonths.map((sm) => {
          let currentMonth = false;
          let currentDay = false;
          if (sm.type === SalaryMonthType.DAILY) {
            const now = new Date();
            const nowMonth = new Date(now).getMonth();
            const nowYear = new Date(now).getFullYear();
            const nowDate = new Date(now).getDate();
            if (sm.startDate.getFullYear() === nowYear && sm.startDate.getMonth() === nowMonth && sm.startDate.getDate() === nowDate) currentDay = true;
          }
          if (new Date(sm.startDate).getTime() < nowMs && nowMs < new Date(sm.endDate).getTime()) {
            currentMonth = true;
            totals.currentMonthSalary = fromMinorUnits(sm.baseSalary);
          }

          const baseSalary = fromMinorUnits(sm.baseSalary);
          const totalPaid = fromMinorUnits(sm.totalPaid);
          const remainingAmount = baseSalary - totalPaid;
          const budgetObject = fromMinorUnits(sm.budgetObject);

          return {
            ...sm,
            object: sm.object
              ? {
                  id: sm.object.id,
                  name: sm.object.name,
                  budget: fromMinorUnits(sm.object.budget),
                }
              : null,
            appliedPayments: sm.appliedPayments.map((ap) => ({
              ...ap,
              salaryPayment: { ...ap.salaryPayment, amount: fromMinorUnits(ap.salaryPayment.amount) },
              amountApplied: fromMinorUnits(ap.amountApplied),
            })),
            budgetObject,
            baseSalary,
            totalPaid,
            remainingAmount,
            currentMonth,
            currentDay,
          };
        }),
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserSalaryMonthsExcelDoc(req, res, next) {
    try {
      let {
        query: { year = "ALL" },
      } = req;
      let selectedYear = new Date().getFullYear();
      if (year !== "ALL") {
        if (!Number.isNaN(Number(year)) && Number(year) >= 2000) {
          selectedYear = Number(year);
        }
      }

      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const user = await prisma.user.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          fname: true,
          lname: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      const findWhere = {
        ownerId: id,
        owner: { isActive: true },
        isActive: true,
      };

      if (year !== "ALL") findWhere.year = selectedYear;

      const userSalaryMonths = await prisma.salaryMonth.findMany({
        where: findWhere,
        select: {
          id: true,
          month: true,
          year: true,
          startDate: true,
          endDate: true,
          duties: true,
          baseSalary: true,
          totalPaid: true,
          status: true,
          type: true,
          nameObject: true,
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
            },
          },
          appliedPayments: {
            where: { isActive: true },
            orderBy: { salaryPayment: { createdAt: "desc" } },
            take: 1,
            select: {
              salaryPayment: {
                select: {
                  paymentMethod: true,
                },
              },
            },
          },
        },
        orderBy: { startDate: "asc" },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const fullName = `${user.fname || ""} ${user.lname || ""}`.trim();
      const sheet = workbook.addWorksheet(fullName || "Маошлар");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 35;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getMonthName = (month) => {
        const months = {
          0: "Январ",
          1: "Феврал",
          2: "Март",
          3: "Апрел",
          4: "Май",
          5: "Июн",
          6: "Июл",
          7: "Август",
          8: "Сентабр",
          9: "Октабр",
          10: "Ноябр",
          11: "Декабр",
        };
        return months[month] || "";
      };

      const getSalaryTypeUz = (type) => {
        const types = {
          [SalaryMonthType.DAILY]: "Кунлик",
          [SalaryMonthType.MONTHLY]: "Ойлик",
          [SalaryMonthType.COMMISSION]: "Комиссия",
        };
        return types[type] || "-";
      };

      const getStatusUz = (status) => {
        const statuses = {
          [SalaryStatus.PAID]: "Тўланган",
          [SalaryStatus.PARTIALLY_PAID]: "Қисман тўланган",
          [SalaryStatus.UNPAID]: "Тўланмаган",
          [SalaryStatus.LATE]: "Кечиккан",
        };
        return statuses[status] || "-";
      };

      const getStatusStyle = (status) => {
        const styles = {
          [SalaryStatus.PAID]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [SalaryStatus.PARTIALLY_PAID]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [SalaryStatus.UNPAID]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
          [SalaryStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getPaymentMethodUz = (method) => {
        const methods = {
          [PaymentMethod.CASH]: "Нақд",
          [PaymentMethod.BANK_TRANSFER]: "Банк ўтказмаси",
        };
        return methods[method] || "-";
      };

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return /* "0.00" */ 0;
        return Number(num) /* .toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Ой / Тендер ҳажми", key: "monthOrDuties", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Сана", key: "dateRange", minWidth: 22 },
        { header: "Маош", key: "baseSalary", minWidth: 18 },
        { header: "Тўланган", key: "totalPaid", minWidth: 18 },
        { header: "Қолдиқ", key: "remaining", minWidth: 18 },
        { header: "Тўлов усули", key: "paymentMethod", minWidth: 16 },
        { header: "Ҳолат", key: "status", minWidth: 16 },
        { header: "Маош тури", key: "salaryType", minWidth: 14 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = userSalaryMonths.map((sm, index) => {
        const baseSalary = Number(sm.baseSalary) / 100;
        const totalPaid = Number(sm.totalPaid) / 100;
        const remaining = baseSalary - totalPaid;

        // Oy yoki Tender hajmi
        let monthOrDuties = "";
        if (sm.type === SalaryMonthType.MONTHLY && sm.month && sm.year) {
          monthOrDuties = `${getMonthName(sm.month)} ${sm.year}`;
        } else if (sm.duties) {
          monthOrDuties = `Тендер ҳажми: ${sm.duties}`; // <-- Shu yerda o'zgardi
        } else if (sm.month && sm.year) {
          monthOrDuties = `${getMonthName(sm.month)} ${sm.year}`;
        } else {
          monthOrDuties = formatDate(sm.startDate);
        }

        // Obyekt
        const objectName = sm.object?.name || sm.nameObject || "-";

        // So'ngi to'lov usuli
        const lastPaymentMethod = sm.appliedPayments[0]?.salaryPayment?.paymentMethod || null;

        const data = {
          number: String(index + 1),
          monthOrDuties,
          object: objectName,
          dateRange: `${formatDate(sm.startDate)} - ${formatDate(sm.endDate)}`,
          baseSalary: formatNumber(baseSalary),
          totalPaid: formatNumber(totalPaid),
          remaining: formatNumber(remaining),
          paymentMethod: getPaymentMethodUz(lastPaymentMethod),
          status: getStatusUz(sm.status),
          salaryType: getSalaryTypeUz(sm.type),
          _status: sm.status,
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

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const { _status, _remaining, ...cleanData } = data;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Oy / Tender hajmi
        row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Sana

        // Maosh
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

        // To'langan - yashil
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

        // Qoldiq - musbat qizil, 0 yashil
        row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(7).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _remaining > 0 ? "FFC62828" : "FF2E7D32" },
        };

        row.getCell(8).alignment = { horizontal: "center", vertical: "middle" }; // To'lov usuli

        // Holat - rangli fon
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(9).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Maosh turi
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
      const totalBaseSalary = userSalaryMonths.reduce((sum, sm) => sum + Number(sm.baseSalary), 0) / 100;
      const totalPaidSum = userSalaryMonths.reduce((sum, sm) => sum + Number(sm.totalPaid), 0) / 100;
      const totalRemaining = totalBaseSalary - totalPaidSum;

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами: ${userSalaryMonths.length} та`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(5).value = formatNumber(totalBaseSalary);
      summaryRow.getCell(5).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      summaryRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(6).value = formatNumber(totalPaidSum);
      summaryRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      summaryRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(7).value = formatNumber(totalRemaining);
      summaryRow.getCell(7).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: totalRemaining > 0 ? "FFC62828" : "FF2E7D32" },
      };
      summaryRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createOneSalaryPayment(req, res, next) {
    try {
      const salaryMonthId = req.body.salaryMonthId;
      const objectId = req.body.objectId ?? null;
      const amount = req.body.amount;
      const ownerId = req.body.ownerId;
      const type = req.body.type;
      const paymentMethod = req.body.paymentMethod;
      const description = req.body.description ?? null;
      const createdById = req.user.id;

      const input = { objectId, amount, ownerId, type, paymentMethod, description, createdById, role: req.user.role };
      if (!Number.isNaN(Number(salaryMonthId)) && Number(salaryMonthId) > 0) input.salaryMonthId = salaryMonthId;

      await writeSalaryToMonth(input);

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(error);
    }
  },

  async getUsers(req, res, next) {
    try {
      let { page, limit, sort, reverse, key, role } = req.query;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";
      role = [Role.ACCOUNTANT, Role.ADMIN, Role.PTO, Role.WORKER].includes(role) ? role : null;

      const findWhere = {
        isActive: true,
        ...(key && {
          OR: [
            { fname: { contains: key, mode: "insensitive" } },
            { lname: { contains: key, mode: "insensitive" } },
            { email: { contains: key, mode: "insensitive" } },
            { phone: { contains: key, mode: "insensitive" } },
          ],
        }),
        ...(role ? { role } : { role: { notIn: [Role.SUPERADMIN] } }),
      };

      const count = await prisma.user.count({ where: findWhere });

      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const [users, totalEmployeesWithSalary, currentMonthSalaryCount, currentMonthPaidSalaryCount, delayedSalaryCount] = await Promise.all([
        prisma.user.findMany({
          orderBy: { [sort]: reverse === "true" ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          include: {
            avatar: true,
            salaryMonths: {
              where: { isActive: true, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
              orderBy: { startDate: "desc" },
              take: 1,
            },
            salaryPayments: {
              where: { isActive: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        }),
        prisma.user.count({
          where: {
            isActive: true,
            salaryMonths: {
              some: {
                OR: [{ startDate: { gte: startOfMonth, lte: endOfMonth } }, { endDate: { gte: startOfMonth, lte: endOfMonth } }],
              },
            },
          },
        }),
        prisma.salaryMonth.count({ where: { isActive: true, startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
        prisma.salaryMonth.count({ where: { isActive: true, status: "PAID", startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
        prisma.salaryMonth.count({ where: { isActive: true, status: "LATE", startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
      ]);

      const totals = {
        totalEmployeesWithSalary,
        currentMonthSalaryCount,
        currentMonthPaidSalaryCount,
        delayedSalaryCount,
      };

      const result = users.map((user) => {
        let dayUntilPaid = null;
        let lastPaymentDate = null;
        let salaryAmount = null;
        let dayUntilPaidStatus = null;
        let paidAmount = null;
        let remainingAmount = null;

        if (user.salaryMonths.length) {
          const current = user.salaryMonths[0];
          salaryAmount = fromMinorUnits(current.baseSalary);
          dayUntilPaid = new Date(current.endDate);
          dayUntilPaidStatus = current.status;
          paidAmount = fromMinorUnits(current.totalPaid);
          remainingAmount = salaryAmount - paidAmount;
        }

        if (user.salaryPayments.length) {
          lastPaymentDate = new Date(user.salaryPayments[0].createdAt);
        }

        return {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar ? { url: user.avatar.url } : null,
          currentBaseSalary: fromMinorUnits(user.currentBaseSalary),
          currentSalaryMonthEndDate: user.currentSalaryMonthEndDate,
          lastPaidDate: user.lastPaidDate,
          dayUntilPaid,
          lastPaymentDate,
          salaryAmount,
          dayUntilPaidStatus,
          paidAmount,
          remainingAmount,
        };
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        totals,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getWorkers(req, res, next) {
    try {
      let {
        query: { page, limit, sort, reverse, key },
      } = req;

      key = typeof key === "string" ? key.trim() : "";
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";

      const findWhere = {
        isActive: true,
        role: Role.WORKER,
        ...(key && {
          OR: [
            { fname: { contains: key, mode: "insensitive" } },
            { lname: { contains: key, mode: "insensitive" } },
            { email: { contains: key, mode: "insensitive" } },
            { phone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.user.count({ where: findWhere });

      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const [users, totalEmployeesWithSalary, currentMonthSalaryCount, currentMonthPaidSalaryCount, delayedSalaryCount] = await Promise.all([
        prisma.user.findMany({
          orderBy: { [sort]: reverse === "true" ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          include: {
            avatar: true,
            salaryMonths: {
              where: { isActive: true, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
              orderBy: { startDate: "desc" },
              take: 1,
            },
            salaryPayments: {
              where: { isActive: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        }),
        prisma.user.count({
          where: {
            isActive: true,
            salaryMonths: {
              some: {
                OR: [{ startDate: { gte: startOfMonth, lte: endOfMonth } }, { endDate: { gte: startOfMonth, lte: endOfMonth } }],
              },
            },
          },
        }),
        prisma.salaryMonth.count({ where: { isActive: true, startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
        prisma.salaryMonth.count({ where: { isActive: true, status: "PAID", startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
        prisma.salaryMonth.count({ where: { isActive: true, status: "LATE", startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
      ]);

      const totals = {
        totalEmployeesWithSalary,
        currentMonthSalaryCount,
        currentMonthPaidSalaryCount,
        delayedSalaryCount,
      };

      const result = users.map((user) => {
        let dayUntilPaid = null;
        let lastPaymentDate = null;
        let salaryAmount = null;
        let dayUntilPaidStatus = null;
        let paidAmount = null;
        let remainingAmount = null;

        if (user.salaryMonths.length) {
          const current = user.salaryMonths[0];
          salaryAmount = fromMinorUnits(current.baseSalary);
          dayUntilPaid = new Date(current.endDate);
          dayUntilPaidStatus = current.status;
          paidAmount = fromMinorUnits(current.totalPaid);
          remainingAmount = salaryAmount - paidAmount;
        }

        if (user.salaryPayments.length) {
          lastPaymentDate = new Date(user.salaryPayments[0].createdAt);
        }

        return {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar ? { url: user.avatar.url } : null,
          currentBaseSalary: fromMinorUnits(user.currentBaseSalary),
          currentSalaryMonthEndDate: user.currentSalaryMonthEndDate,
          lastPaidDate: user.lastPaidDate,
          dayUntilPaid,
          lastPaymentDate,
          salaryAmount,
          dayUntilPaidStatus,
          paidAmount,
          remainingAmount,
        };
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        totals,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOneSalaryMonth(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await deleteOneSalaryMonthOptimistic({ id, deletedById: req.user.id });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOneSalaryMonth(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await updateSalaryMonth({
        id,
        baseSalary: req.body.baseSalary,
        startDate: new Date(req.body.startDate),
        duties: req.body.duties,
        negotiation: req.body.negotiation,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneSalaryMonth(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const salaryMonth = await prisma.salaryMonth.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          day: true,
          month: true,
          year: true,
          startDate: true,
          endDate: true,
          duties: true,
          baseSalary: true,
          totalPaid: true,
          paidPercent: true,
          remainingPercent: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          nameObject: true,
          budgetObject: true,
          object: true,
          owner: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
            },
          },
          appliedPayments: {
            where: { isActive: true },
            select: {
              id: true,
              amountApplied: true,
              salaryPayment: {
                select: {
                  id: true,
                  amount: true,
                  type: true,
                  description: true,
                  paymentMethod: true,
                  createdBy: {
                    where: { isActive: true },
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      email: true,
                      phone: true,
                      role: true,
                      avatar: true,
                    },
                  },
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
            },
          },
        },
      });
      if (!salaryMonth) throw new AppError(404, "salary_month_not_found");

      const result = {
        ...salaryMonth,
        baseSalary: fromMinorUnits(salaryMonth.baseSalary),
        totalPaid: fromMinorUnits(salaryMonth.totalPaid),
        budgetObject: fromMinorUnits(salaryMonth.budgetObject),
        object: salaryMonth.object
          ? {
              id: salaryMonth.object.id,
              name: salaryMonth.object.name,
              budget: fromMinorUnits(salaryMonth.object.budget),
            }
          : null,
        appliedPayments: salaryMonth.appliedPayments?.map((ap) => ({
          ...ap,
          amountApplied: fromMinorUnits(ap.amountApplied),
          salaryPayment: { ...ap.salaryPayment, amount: fromMinorUnits(ap.salaryPayment.amount) },
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

  async deleteOneSalaryPayment(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await deleteOneSalaryPaymentOptimistic({ id, deletedById: req.user.id });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchUser(req, res, next) {
    try {
      let { page, limit, sort, reverse, key } = req.query;

      key = typeof key === "string" ? key.trim() : null;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "true";

      sort = allowedColumnKeys.includes(sort) ? sort : "fname";

      const findWhere = {
        role: { not: Role.SUPERADMIN },
        isActive: true,
        ...(key && {
          OR: [
            { fname: { contains: key, mode: "insensitive" } },
            { lname: { contains: key, mode: "insensitive" } },
            { email: { contains: key, mode: "insensitive" } },
            { phone: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.user.count({ where: findWhere });
      let totalPage = count !== 0 ? Math.ceil(count / limit) : 0;
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const [users, totalEmployeesWithSalary, currentMonthSalaryCount, currentMonthPaidSalaryCount, delayedSalaryCount] = await Promise.all([
        prisma.user.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            avatar: true,
            salaryMonths: {
              where: { isActive: true, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
              orderBy: { startDate: "desc" },
              take: 1,
            },
            salaryPayments: {
              where: { isActive: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        }),
        prisma.user.count({
          where: {
            isActive: true,
            salaryMonths: {
              some: {
                OR: [{ startDate: { gte: startOfMonth, lte: endOfMonth } }, { endDate: { gte: startOfMonth, lte: endOfMonth } }],
              },
            },
          },
        }),
        prisma.salaryMonth.count({ where: { isActive: true, startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
        prisma.salaryMonth.count({ where: { isActive: true, status: "PAID", startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
        prisma.salaryMonth.count({ where: { isActive: true, status: "LATE", startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } } }),
      ]);

      const totals = {
        totalEmployeesWithSalary,
        currentMonthSalaryCount,
        currentMonthPaidSalaryCount,
        delayedSalaryCount,
      };

      const result = users.map((user) => {
        let dayUntilPaid = null;
        let lastPaymentDate = null;
        let salaryAmount = null;
        let dayUntilPaidStatus = null;
        let paidAmount = null;
        let remainingAmount = null;

        if (user.salaryMonths.length !== 0) {
          const current = user.salaryMonths[0];
          salaryAmount = fromMinorUnits(current.baseSalary);
          dayUntilPaid = new Date(current.endDate);
          dayUntilPaidStatus = current.status;
          paidAmount = fromMinorUnits(current.totalPaid);
          remainingAmount = salaryAmount - paidAmount;
        }

        if (user.salaryPayments.length !== 0) {
          lastPaymentDate = new Date(user.salaryPayments[0].createdAt);
        }

        return {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar ? { url: user.avatar.url } : null,
          currentBaseSalary: fromMinorUnits(user.currentBaseSalary),
          currentSalaryMonthEndDate: user.currentSalaryMonthEndDate,
          lastPaidDate: user.lastPaidDate,
          dayUntilPaid,
          lastPaymentDate,
          salaryAmount,
          dayUntilPaidStatus,
          paidAmount,
          remainingAmount,
        };
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        totals,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      let { sort, reverse } = req.query;

      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "fname";

      const users = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        where: { role: { not: Role.SUPERADMIN }, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          role: true,
          salaryMonths: {
            where: { isActive: true, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
            orderBy: { startDate: "desc" },
            take: 1,
            select: {
              baseSalary: true,
              endDate: true,
              status: true,
            },
          },
          salaryPayments: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Xodimlar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getRoleUz = (role) => {
        const Role = {
          [Role.ADMIN]: "Админ",
          [Role.ACCOUNTANT]: "Ҳисобчи",
          [Role.PTO]: "ПТО",
          [Role.WORKER]: "Ишчи",
        };
        return Role[role] || role || "-";
      };

      const getSalaryStatusStyle = (status) => {
        const styles = {
          [SalaryStatus.PAID]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [SalaryStatus.PARTIALLY_PAID]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [SalaryStatus.UNPAID]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
          [SalaryStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
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

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "-";
        return Number(num).toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const formatAmount = (amount) => {
        if (!amount) return "-";
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Исми фамилияси", key: "fullName", minWidth: 25 },
        { header: "Лавозим", key: "role", minWidth: 15 },
        { header: "Маош санаси", key: "salaryEndDate", minWidth: 15 },
        { header: "Маош", key: "salaryAmount", minWidth: 18 },
        { header: "Сўнги тўлов санаси", key: "lastPaymentDate", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = users.map((u, index) => {
        const currentSalary = u.salaryMonths[0] || null;
        const lastPayment = u.salaryPayments[0] || null;

        const data = {
          number: String(index + 1),
          fullName: `${u.fname || ""} ${u.lname || ""}`.trim() || "-",
          role: getRoleUz(u.role),
          salaryEndDate: currentSalary ? formatDate(currentSalary.endDate) : "-",
          salaryAmount: currentSalary ? formatAmount(currentSalary.baseSalary) : "-",
          lastPaymentDate: lastPayment ? formatDate(lastPayment.createdAt) : "-",
          _status: currentSalary?.status || null,
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
        const statusStyle = getSalaryStatusStyle(data._status);
        const { _status, ...cleanData } = data;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Ismi familiyasi
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // Lavozim

        // Maosh sanasi - status bo'yicha rangli
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        if (_status) {
          row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
          row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };
        }

        // Maosh
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" }; // So'ngi to'lov sanasi
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

      // Umumiy maosh
      const totalSalary =
        users.reduce((sum, u) => {
          const salary = u.salaryMonths[0]?.baseSalary || 0n;
          return sum + Number(salary);
        }, 0) / 100;

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами ходимлар: ${users.length}`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      summaryRow.getCell(5).value = formatNumber(totalSalary);
      summaryRow.getCell(5).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async selfSalaryMonths(req, res, next) {
    try {
      let { year } = req.query;
      year = !Number.isNaN(Number(year)) && Number(year) >= 2000 && Number.isInteger(Number(year)) ? Number(year) : new Date().getFullYear();

      const user = await prisma.user.findFirst({
        where: { isActive: true, id: req.user.id },
        select: {
          id: true,
          fname: true,
          lname: true,
          email: true,
          phone: true,
          role: true,
          avatar: true,
          createdAt: true,
          currentBaseSalary: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      const yearsList = await prisma.salaryMonth
        .groupBy({
          by: ["year"],
          where: { isActive: true, ownerId: req.user.id },
          orderBy: { year: "desc" },
        })
        .then((res) => res.map((r) => r.year));

      const totalsResult = {
        SALARY: 0,
        AVANS: 0,
        PENALTY: 0,
      };

      const totalsRes = await prisma.salaryPayment.groupBy({
        by: ["type"],
        _sum: { amount: true },
        where: {
          ownerId: req.user.id,
          isActive: true,
          owner: { isActive: true },
        },
      });

      for (g of totalsRes) totalsResult[g.type] = fromMinorUnits(g._sum.amount);
      const totalPayments = await prisma.salaryPayment.count({ where: { ownerId: req.user.id, isActive: true, owner: { isActive: true } } });

      const totals = {
        totalPaid: totalsResult.AVANS + totalsResult.SALARY,
        totalPayments,
        totalPenalties: totalsResult.PENALTY,
      };

      const userSalaryMonths = await prisma.salaryMonth.findMany({
        where: {
          ownerId: req.user.id,
          owner: { isActive: true },
          isActive: true,
          year,
        },
        select: {
          id: true,
          day: true,
          month: true,
          year: true,
          startDate: true,
          endDate: true,
          duties: true,
          baseSalary: true,
          totalPaid: true,
          paidPercent: true,
          remainingPercent: true,
          status: true,
          type: true,
          budgetObject: true,
          nameObject: true,
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              budget: true,
            },
          },
          appliedPayments: {
            where: { isActive: true },
            select: {
              id: true,
              amountApplied: true,
              salaryPayment: {
                select: {
                  id: true,
                  amount: true,
                  createdAt: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      role: true,
                      avatar: true,
                    },
                  },
                  paymentMethod: true,
                  type: true,
                  description: true,
                },
              },
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
              createdAt: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { startDate: "asc" },
      });
      const nowMs = Date.now();
      totals.currentBaseSalary = fromMinorUnits(Number(user.currentBaseSalary));
      res.status(200).json({
        status: "success",
        user: { ...user, currentBaseSalary: fromMinorUnits(Number(user.currentBaseSalary)) },
        totals,
        selectedYear: year,
        yearsList,
        data: userSalaryMonths.map((sm) => {
          let currentMonth = false;
          let currentDay = false;
          if (sm.type === SalaryMonthType.DAILY) {
            const now = new Date();
            const nowMonth = new Date(now).getMonth();
            const nowYear = new Date(now).getFullYear();
            const nowDate = new Date(now).getDate();
            if (sm.startDate.getFullYear() === nowYear && sm.startDate.getMonth() === nowMonth && sm.startDate.getDate() === nowDate) {
              currentDay = true;
            }
          }
          if (new Date(sm.startDate).getTime() < nowMs && nowMs < new Date(sm.endDate).getTime()) {
            currentMonth = true;
            totals.currentMonthSalary = fromMinorUnits(sm.baseSalary);
          }

          const baseSalary = fromMinorUnits(sm.baseSalary);
          const totalPaid = fromMinorUnits(sm.totalPaid);
          const remainingAmount = baseSalary - totalPaid;
          const budgetObject = fromMinorUnits(sm.budgetObject);

          return {
            ...sm,
            object: sm.object
              ? ["ACCOUNTANT", "ADMIN"].includes(req.user.role)
                ? { id: sm.object.id, name: sm.object.name, budget: fromMinorUnits(sm.object.budget) }
                : { id: sm.object.id, name: sm.object.name }
              : null,
            appliedPayments: sm.appliedPayments.map((ap) => ({
              ...ap,
              salaryPayment: { ...ap.salaryPayment, amount: fromMinorUnits(ap.salaryPayment.amount) },
              amountApplied: fromMinorUnits(ap.amountApplied),
            })),
            budgetObject,
            baseSalary,
            totalPaid,
            remainingAmount,
            currentMonth,
            currentDay,
          };
        }),
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async selfSalaryMonthsExcelDoc(req, res, next) {
    try {
      let { year } = req.query;
      year = !Number.isNaN(Number(year)) && Number(year) >= 2000 && Number.isInteger(Number(year)) ? Number(year) : new Date().getFullYear();

      const user = await prisma.user.findFirst({
        where: { isActive: true, id: req.user.id },
        select: { id: true, fname: true, lname: true },
      });
      if (!user) throw new AppError(404, "user_not_found");

      const userSalaryMonths = await prisma.salaryMonth.findMany({
        where: {
          ownerId: req.user.id,
          owner: { isActive: true },
          isActive: true,
          year,
        },
        select: {
          id: true,
          month: true,
          year: true,
          startDate: true,
          endDate: true,
          duties: true,
          baseSalary: true,
          totalPaid: true,
          status: true,
          type: true,
          nameObject: true,
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          appliedPayments: {
            where: { isActive: true },
            orderBy: { salaryPayment: { createdAt: "desc" } },
            take: 1,
            select: {
              salaryPayment: {
                select: { paymentMethod: true },
              },
            },
          },
        },
        orderBy: { startDate: "asc" },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const fullName = `${user.fname || ""} ${user.lname || ""}`.trim();
      const sheet = workbook.addWorksheet("Mening maoshlarim");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 35;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getMonthName = (month) => {
        const months = { 0: "Январ", 1: "Феврал", 2: "Март", 3: "Апрел", 4: "Май", 5: "Июн", 6: "Июл", 7: "Август", 8: "Сентабр", 9: "Октабр", 10: "Ноябр", 11: "Декабр" };
        return months[month] || "";
      };

      const getSalaryTypeUz = (type) => {
        const types = { [SalaryMonthType.DAILY]: "Кунлик", [SalaryMonthType.MONTHLY]: "Ойлик", [SalaryMonthType.COMMISSION]: "Комиссия" };
        return types[type] || "-";
      };

      const getStatusUz = (status) => {
        const statuses = { [SalaryStatus.PAID]: "Тўланган", [SalaryStatus.PARTIALLY_PAID]: "Қисман тўланган", [SalaryStatus.UNPAID]: "Тўланмаган", [SalaryStatus.LATE]: "Кечиккан" };
        return statuses[status] || "-";
      };

      const getStatusStyle = (status) => {
        const styles = {
          [SalaryStatus.PAID]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [SalaryStatus.PARTIALLY_PAID]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [SalaryStatus.UNPAID]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
          [SalaryStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getPaymentMethodUz = (method) => {
        const methods = { [PaymentMethod.CASH]: "Нақд", [PaymentMethod.BANK_TRANSFER]: "Банк ўтказмаси" };
        return methods[method] || "-";
      };

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "0.00";
        return Number(num).toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Ой / Тендер ҳажми", key: "monthOrDuties", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Сана", key: "dateRange", minWidth: 22 },
        { header: "Маош", key: "baseSalary", minWidth: 18 },
        { header: "Тўланган", key: "totalPaid", minWidth: 18 },
        { header: "Қолдиқ", key: "remaining", minWidth: 18 },
        { header: "Тўлов усули", key: "paymentMethod", minWidth: 16 },
        { header: "Ҳолат", key: "status", minWidth: 16 },
        { header: "Маош тури", key: "salaryType", minWidth: 14 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = userSalaryMonths.map((sm, index) => {
        const baseSalary = Number(sm.baseSalary) / 100;
        const totalPaid = Number(sm.totalPaid) / 100;
        const remaining = baseSalary - totalPaid;

        // Oy yoki Tender hajmi
        let monthOrDuties = "";
        if (sm.type === SalaryMonthType.MONTHLY && sm.month && sm.year) {
          monthOrDuties = `${getMonthName(sm.month)} ${sm.year}`;
        } else if (sm.duties) {
          monthOrDuties = `Тендер ҳажми: ${sm.duties}`;
        } else if (sm.month && sm.year) {
          monthOrDuties = `${getMonthName(sm.month)} ${sm.year}`;
        } else {
          monthOrDuties = formatDate(sm.startDate);
        }

        // Obyekt
        const objectName = sm.object?.name || sm.nameObject || "-";

        // So'ngi to'lov usuli
        const lastPaymentMethod = sm.appliedPayments[0]?.salaryPayment?.paymentMethod || null;

        const data = {
          number: String(index + 1),
          monthOrDuties,
          object: objectName,
          dateRange: `${formatDate(sm.startDate)} - ${formatDate(sm.endDate)}`,
          baseSalary: formatNumber(baseSalary),
          totalPaid: formatNumber(totalPaid),
          remaining: formatNumber(remaining),
          paymentMethod: getPaymentMethodUz(lastPaymentMethod),
          status: getStatusUz(sm.status),
          salaryType: getSalaryTypeUz(sm.type),
          _status: sm.status,
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

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const { _status, _remaining, ...cleanData } = data;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Oy / Tender hajmi
        row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; // Sana

        // Maosh
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

        // To'langan - yashil
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

        // Qoldiq - musbat qizil, 0 yashil
        row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(7).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _remaining > 0 ? "FFC62828" : "FF2E7D32" },
        };

        row.getCell(8).alignment = { horizontal: "center", vertical: "middle" }; // To'lov usuli

        // Holat - rangli fon
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(9).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Maosh turi
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
      const totalBaseSalary = userSalaryMonths.reduce((sum, sm) => sum + Number(sm.baseSalary), 0) / 100;
      const totalPaidSum = userSalaryMonths.reduce((sum, sm) => sum + Number(sm.totalPaid), 0) / 100;
      const totalRemaining = totalBaseSalary - totalPaidSum;

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами: ${userSalaryMonths.length} та`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(5).value = formatNumber(totalBaseSalary);
      summaryRow.getCell(5).font = { bold: true, size: FONT_SIZE, name: FONT_NAME };
      summaryRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(6).value = formatNumber(totalPaidSum);
      summaryRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      summaryRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(7).value = formatNumber(totalRemaining);
      summaryRow.getCell(7).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: totalRemaining > 0 ? "FFC62828" : "FF2E7D32" },
      };
      summaryRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async selfSalaryMonth(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const salaryMonth = await prisma.salaryMonth.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          owner: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
            },
          },
          day: true,
          month: true,
          year: true,
          startDate: true,
          endDate: true,
          duties: true,
          baseSalary: true,
          totalPaid: true,
          paidPercent: true,
          remainingPercent: true,
          status: true,
          budgetObject: true,
          nameObject: true,
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              budget: true,
            },
          },
          appliedPayments: {
            where: { isActive: true },
            select: {
              id: true,
              amountApplied: true,
              salaryPayment: {
                select: {
                  id: true,
                  amount: true,
                  type: true,
                  description: true,
                  paymentMethod: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      email: true,
                      phone: true,
                      role: true,
                      avatar: true,
                    },
                  },
                  createdAt: true,
                  updatedAt: true,
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
              avatar: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!salaryMonth) throw new AppError(404, "salary_month_not_found");
      if (salaryMonth.owner.id !== req.user.id) throw new AppError(400, "no_access");

      const baseSalary = fromMinorUnits(salaryMonth.baseSalary);
      const totalPaid = fromMinorUnits(salaryMonth.totalPaid);
      const remainingAmount = baseSalary - totalPaid;
      const budgetObject = fromMinorUnits(salaryMonth.budgetObject);

      const result = {
        ...salaryMonth,
        baseSalary,
        totalPaid,
        remainingAmount,
        budgetObject,
        object: salaryMonth.object ? (["ACCOUNTANT", "ADMIN"].includes(req.user.role) ? { id: true, name: true, budget: fromMinorUnits(salaryMonth.object.budget) } : { id: true, name: true }) : null,
        appliedPayments: salaryMonth.appliedPayments?.map((ap) => ({
          ...ap,
          amountApplied: fromMinorUnits(ap.amountApplied),
          salaryPayment: { ...ap.salaryPayment, amount: fromMinorUnits(ap.salaryPayment.amount) },
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
};

module.exports = salaryController;
