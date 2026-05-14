const { Roles } = require("../enums/RoleEnum");
const AppError = require("../utils/AppError");
const sleep = require("../utils/sleep");
const balanceService = require("./balance.service");
const prisma = require("./prisma");

class transferService {
  async createUserToUser({ recipientUserId, createdById, amount, note, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const recipientUser = await tx.user.findUnique({
            where: { id: recipientUserId },
          });
          if (!recipientUser) throw new AppError(404, "recipient_user_not_found");
          if (!recipientUser.isActive) throw new AppError(400, "recipient_user_is_deleted");

          await tx.fundTransfer.create({
            data: { amount, recipientUserId, createdById, senderUserId: createdById, note },
            select: { id: true },
          });

          await balanceService.recalculateUserBalance(tx, createdById);
          await balanceService.recalculateUserBalance(tx, recipientUserId);

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
    throw new AppError(400, "failed_to_create_transfer");
  }

  async createUserToObject({ objectId, createdById, amount, note, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const createdBy = await tx.user.findUnique({
            where: { id: createdById },
          });
          if (!createdBy) throw new AppError(404, "giver_user_not_found");

          const object = await tx.object.findUnique({
            where: { id: objectId },
          });
          if (!object) throw new AppError(404, "to_object_not_found");
          if (object.isActive === false) throw new AppError(400, "recipient_object_is_deleted");

          await tx.fundTransfer.create({
            data: { amount, createdById, senderUserId: createdById, toObjectId: objectId, note },
            select: { id: true },
          });

          await balanceService.recalculateUserBalance(tx, createdById);
          await balanceService.recalculateObjectBalance(tx, objectId);

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
    throw new AppError(400, "failed_to_create_transfer");
  }

  async createObjectToUser({ fromObjectId, recipientUserId, amount, note, createdById, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const fromObject = await tx.object.findUnique({
            where: { id: fromObjectId },
          });
          if (!fromObject) throw new AppError(404, "from_object_not_found");
          if (fromObject.isActive === false) throw new AppError(400, "giver_object_is_deleted");

          const recipientUser = await tx.user.findUnique({
            where: { id: recipientUserId },
          });
          if (!recipientUser) throw new AppError(404, "recipient_user_not_found");
          if (recipientUser.isActive === false) throw new AppError(400, "recipient_user_is_deleted");

          await tx.fundTransfer.create({
            data: { amount, createdById, fromObjectId, recipientUserId, note },
            select: { id: true },
          });

          await balanceService.recalculateObjectBalance(tx, fromObjectId);
          await balanceService.recalculateUserBalance(tx, recipientUserId);

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
    throw new AppError(400, "failed_to_create_transfer");
  }

  async createObjectToSelfUser({ fromObjectId, amount, note, createdById, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const fromObject = await tx.object.findUnique({
            where: { id: fromObjectId },
          });
          if (!fromObject) throw new AppError(404, "from_object_not_found");
          if (fromObject.isActive === false) throw new AppError(400, "giver_object_is_deleted");

          const createdBy = await tx.user.findUnique({
            where: { id: createdById },
          });
          if (!createdBy) throw new AppError(404, "giver_user_not_found");

          await tx.fundTransfer.create({
            data: { amount, createdById, recipientUserId: createdById, fromObjectId, note },
            select: { id: true },
          });

          await balanceService.recalculateObjectBalance(tx, fromObjectId);
          await balanceService.recalculateUserBalance(tx, createdById);

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
    throw new AppError(400, "failed_to_create_transfer");
  }

  async createObjectToOrg({ fromObjectId, toOrganizationId, amount, note, createdById, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const fromObject = await tx.object.findUnique({
            where: { id: fromObjectId },
          });
          if (!fromObject) throw new AppError(404, "from_object_not_found");
          if (!fromObject.isActive) throw new AppError(400, "giver_object_is_deleted");

          const toOrganization = await tx.organization.findUnique({
            where: { id: toOrganizationId },
          });
          if (!toOrganization) throw new AppError(404, "recipient_organization_not_found");
          if (!toOrganization.isActive) throw new AppError(400, "recipient_organization_is_deleted");

          await tx.fundTransfer.create({
            data: { amount, createdById, fromObjectId, toOrganizationId, note },
          });

          await balanceService.recalculateObjectBalance(tx, fromObjectId);
          await balanceService.recalculateOrgBalance(tx, toOrganizationId);

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
    throw new AppError(400, "failed_to_create_transfer");
  }

  async createUserToOrg({ toOrganizationId, createdById, amount, note, contractNumber, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const createdBy = await tx.user.findUnique({
            where: { id: createdById },
          });
          if (!createdBy) throw new AppError(404, "giver_user_not_found");

          const organization = await tx.organization.findUnique({
            where: { id: toOrganizationId },
          });
          if (!organization) throw new AppError(404, "recipient_organization_not_found");
          if (!organization.isActive) throw new AppError(400, "recipient_organization_is_deleted");

          await tx.fundTransfer.create({
            data: { amount, createdById, toOrganizationId, contractNumber, senderUserId: createdById, note },
          });

          await balanceService.recalculateUserBalance(tx, createdById);
          await balanceService.recalculateOrgBalance(tx, toOrganizationId);

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
    throw new AppError(400, "failed_to_create_transfer");
  }

  async delete({ transferId, userId, role, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const transfer = await tx.fundTransfer.findUnique({
            where: { id: transferId },
          });
          if (!transfer) throw new AppError(404, "transfer_not_found");
          if (!transfer.isActive) throw new AppError(400, "transfer_is_deleted");

          const user = await tx.user.findUnique({
            where: { id: transfer.createdById },
          });
          if (!user) throw new AppError(404, "user_not_found");

          if (role !== Roles.SUPERADMIN && userId !== transfer.createdById) throw new AppError(400, "no_access");
          if (Date.now() - transfer.createdAt.getTime() >= 10 * 60 * 1000 && role !== Roles.SUPERADMIN) throw new AppError(400, "delete_time_expired");

          await tx.fundTransfer.update({
            where: { id: transferId },
            data: {
              isActive: false,
              deletedById: userId,
              deletedAt: new Date(),
            },
          });

          const { fromObjectId, fromOrganizationId, recipientUserId, senderUserId, toObjectId, toOrganizationId } = transfer;
          if (recipientUserId) await balanceService.recalculateUserBalance(tx, recipientUserId);
          if (senderUserId) await balanceService.recalculateUserBalance(tx, senderUserId);
          if (fromObjectId) await balanceService.recalculateObjectBalance(tx, fromObjectId);
          if (toObjectId) await balanceService.recalculateObjectBalance(tx, toObjectId);
          if (fromOrganizationId) await balanceService.recalculateOrgBalance(tx, fromOrganizationId);
          if (toOrganizationId) await balanceService.recalculateOrgBalance(tx, toOrganizationId);

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
    throw new AppError(400, "failed_to_delete_transfer");
  }

  async update({ transferId, amount, note, role, userId, maxRetries = 3 } = {}) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const transfer = await tx.fundTransfer.findUnique({
            where: { id: transferId },
          });
          if (!transfer) throw new AppError(404, "transfer_not_found");
          if (!transfer.isActive) throw new AppError(400, "transfer_is_deleted");

          const user = await tx.user.findUnique({
            where: { id: transfer.createdById },
          });
          if (!user) throw new AppError(404, "user_not_found");
          if (!user.isActive) throw new AppError(400, "user_is_deleted");

          if (role !== Roles.SUPERADMIN && userId !== transfer.createdById) throw new AppError(400, "no_access");
          if (Date.now() - transfer.createdAt.getTime() >= 10 * 60 * 1000 && role !== Roles.SUPERADMIN) throw new AppError(400, "delete_time_expired");

          await tx.fundTransfer.update({
            where: { id: transferId },
            data: { amount, note },
          });

          const { fromObjectId, fromOrganizationId, recipientUserId, senderUserId, toObjectId, toOrganizationId } = transfer;
          if (recipientUserId) await balanceService.recalculateUserBalance(tx, recipientUserId);
          if (senderUserId) await balanceService.recalculateUserBalance(tx, senderUserId);
          if (fromObjectId) await balanceService.recalculateObjectBalance(tx, fromObjectId);
          if (toObjectId) await balanceService.recalculateObjectBalance(tx, toObjectId);
          if (fromOrganizationId) await balanceService.recalculateOrgBalance(tx, fromOrganizationId);
          if (toOrganizationId) await balanceService.recalculateOrgBalance(tx, toOrganizationId);

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
    throw new AppError(400, "failed_to_delete_transfer");
  }

  async restore(id) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt++;
      try {
        await prisma.$transaction(async (tx) => {
          const transfer = await tx.fundTransfer.findFirst({
            where: { id, isActive: false },
          });
          if (!transfer) throw new AppError(404, "transfer_not_found");

          await tx.fundTransfer.update({
            where: { id },
            data: {
              isActive: true,
              deletedById: null,
              deletedAt: null,
            },
          });

          const { fromObjectId, fromOrganizationId, recipientUserId, senderUserId, toObjectId, toOrganizationId } = transfer;
          if (recipientUserId) await balanceService.recalculateUserBalance(tx, recipientUserId);
          if (senderUserId) await balanceService.recalculateUserBalance(tx, senderUserId);
          if (fromObjectId) await balanceService.recalculateObjectBalance(tx, fromObjectId);
          if (toObjectId) await balanceService.recalculateObjectBalance(tx, toObjectId);
          if (fromOrganizationId) await balanceService.recalculateOrgBalance(tx, fromOrganizationId);
          if (toOrganizationId) await balanceService.recalculateOrgBalance(tx, toOrganizationId);

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
    throw new AppError(400, "failed_to_delete_transfer");
  }

  async absoluteDelete(id) {
    const transfer = await prisma.fundTransfer.findFirst({ where: { isActive: false, id } });
    if (!transfer) throw new AppError(404, "transfer_not_found");

    await prisma.fundTransfer.delete({ where: { id } });
    return;
  }
}

module.exports = new transferService();
