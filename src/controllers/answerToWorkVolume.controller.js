const prisma = require("../lib/prisma");
const { fromMinorUnits } = require("../utils/amount");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const sleep = require("../utils/sleep");

async function createAnswerToWorkVolumeOptimistic({ workVolumeId, unitPrice, quantity, createdById, notes, maxRetries = 4 }) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const workVolume = await tx.workVolume.findFirst({ where: { isActive: true, id: workVolumeId } });
        if (!workVolume) throw new AppError(404, "work_volume_not_found");

        const oldVersion = workVolume.version;
        const totalAmount = BigInt(Math.floor(Number(unitPrice) * quantity));
        await tx.answerToWorkVolume.create({
          data: {
            workVolumeId,
            quantity,
            unit: workVolume.unit,
            unitPrice: unitPrice,
            totalAmount: totalAmount,
            notes,
            createdById,
          },
        });
        const oldSpentAmount = workVolume.spentAmount;
        const newSpentAmount = oldSpentAmount + totalAmount;
        const updateRes = await tx.workVolume.updateMany({
          where: { id: workVolumeId, version: oldVersion },
          data: {
            spentAmount: newSpentAmount,
            version: { increment: 1 },
          },
        });
        if (updateRes.count === 0) throw new Error("VERSION_MISMATCH");

        // May be send SMS.....

        return;
      });

      return;
    } catch (err) {
      if (String(err.message).includes("VERSION_MISMATCH")) {
        if (attempt > maxRetries) throw new AppError(400, "work_volume_conflict_retry_failed");
        const backoff = 50 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 50);
        await sleep(backoff + jitter);
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new AppError(400, "failed_to_create_answer_to_work_volume");
}

const answerToWorkVolumeController = {
  async createOne(req, res, next) {
    try {
      const {
        body: { workVolumeId, unitPrice, quantity, notes },
        user: { id: createdById },
      } = req;

      await createAnswerToWorkVolumeOptimistic({
        workVolumeId,
        unitPrice,
        quantity,
        notes,
        createdById,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(_req, res, next) {
    try {
      const answersToWorkVolume = await prisma.answerToWorkVolume.findMany({
        where: { isActive: true },
        select: {
          id: true,
          unitPrice: true,
          totalAmount: true,
          quantity: true,
          unit: true,
          notes: true,
          workVolume: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalAmount: true,
              spentAmount: true,
              createdAt: true,
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      const result = answersToWorkVolume.map((answer) => ({
        ...answer,
        unitPrice: fromMinorUnits(answer.unitPrice),
        totalAmount: fromMinorUnits(answer.totalAmount),
        workVolume: {
          ...answer.workVolume,
          unitPrice: fromMinorUnits(answer.workVolume.unitPrice),
          totalAmount: fromMinorUnits(answer.workVolume.totalAmount),
          spentAmount: fromMinorUnits(answer.workVolume.spentAmount),
        },
      }));

      res.status(201).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const answer = await prisma.answerToWorkVolume.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          unitPrice: true,
          totalAmount: true,
          quantity: true,
          unit: true,
          note: true,
          workVolume: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalAmount: true,
              spentAmount: true,
              createdAt: true,
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!answer) throw new AppError(404, "answer_to_work_volume_not_found");

      res.status(200).json({
        status: "success",
        data: {
          ...answer,
          unitPrice: fromMinorUnits(answer.unitPrice),
          totalAmount: Number(answer.totalAmount),
          workVolume: {
            ...answer.workVolume,
            unitPrice: fromMinorUnits(answer.workVolume.unitPrice),
            totalAmount: fromMinorUnits(answer.workVolume.totalAmount),
            spentAmount: fromMinorUnits(answer.workVolume.spentAmount),
          },
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

      const answer = await prisma.answerToWorkVolume.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          unitPrice: true,
          totalAmount: true,
          quantity: true,
          unit: true,
          note: true,
          workVolume: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalAmount: true,
              spentAmount: true,
              createdAt: true,
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!answer) throw new AppError(404, "answer_to_work_volume_not_found");

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

      const answer = await prisma.answerToWorkVolume.findFirst({
        where: { isActive: true, id },
        select: {
          id: true,
          unitPrice: true,
          totalAmount: true,
          quantity: true,
          unit: true,
          note: true,
          workVolume: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalAmount: true,
              spentAmount: true,
              createdAt: true,
            },
          },
          createdBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!answer) throw new AppError(404, "answer_to_work_volume_not_found");

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = answerToWorkVolumeController;
