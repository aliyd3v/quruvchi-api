const prisma = require("./prisma");
const { backupDatabase } = require("../utils/dbBackup");
const { sendFileToTg } = require("../utils/sendFileToTg");
const SMS = require("../utils/sms");
const callService = require("./call.service");
const fs = require("fs");

function selectOrg(stir) {
  if (!stir) return;
  switch (stir) {
    case "300446084":
      return "BUILDER_PROJECTS_HOUSE_REMIND_FACTURE";
    case "307905616":
      return "BUYUK_ASR_BOSHI_REMIND_FACTURE";
    case "306467799":
      return "DEVELOPMENT_FORWARD_PACE_REMIND_FACTURE";
    case "306878951":
      return "RSQ_REMIND_FACTURE";
    case "308198340":
      return "SHAXRAMBEK_AKROMBEK_REMIND_FACTURE";
    case "309466884":
      return "WOODEN_MASTER_EXPERT_REMIND_FACTURE";
    case "311561910":
      return "GULOBOD_SITI_REMIND_FACTURE";
    case "308816022":
      return "SHOXRUZBEK_MAXSULOTLARI_REMIND_FACTURE";
    case "310242793":
      return "UNIERSE_PRODUCTION_AND_BUILDER_REMIND_FACTURE";
  }
}

function selectHoliday(day) {
  switch (day) {
    case "11-31":
      return "HAPPY_NEW_YEAR";
    case "2-21":
      return "HAPPY_NAVRUZ";
    case "8-1":
      return "HAPPY_MUSTAQILLIK";
    default:
      return null;
  }
}

class cronService {
  async checkUserCurrentSalaryMonth() {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        isActive: true,
        currentBaseSalary: true,
        currentSalaryMonthEndDate: true,
        salaryMonths: {
          where: { isActive: true },
          select: {
            id: true,
            baseSalary: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });
    const nowMs = Date.now();
    for (const u of users) {
      for (const sm of u.salaryMonths) {
        if (new Date(sm.startDate).getTime() < nowMs && nowMs < new Date(sm.endDate).getTime()) {
          if (u.currentSalaryMonthEndDate !== sm.endDate) {
            await prisma.user.update({
              where: { id: u.id },
              data: {
                currentSalaryMonthEndDate: sm.endDate,
                currentBaseSalary: sm.baseSalary,
              },
            });
          }
        }
      }
    }
  }

  async checkTasksStatus() {
    await prisma.task.updateMany({
      where: {
        isActive: true,
        parentId: null,
        endDate: { lte: new Date() },
        status: { notIn: ["COMPLETED", "CHECKING", "LATE"] },
      },
      data: { status: "LATE" },
    });
  }

  async callLateTaskAssigneds() {
    const tasks = await prisma.task.findMany({
      where: {
        isActive: true,
        parentId: null,
        status: "LATE",
      },
      include: {
        assigned: {
          include: {
            user: {
              where: { isActive: true },
              select: {
                phone: true,
              },
            },
          },
        },
      },
    });

    const phones = [];
    for (const t of tasks) {
      for (const a of t.assigned) {
        if (!phones.includes(a.user.phone)) {
          phones.push(a.user.phone);
        }
      }
    }
    if (phones.length) {
      await Promise.all(phones.map(async (phone) => await callService.call(phone, "LATE_TASK_TO_STAFF")));
    }
  }

  async clearLastWeekResetAuthAttempts() {
    await prisma.resetAuthAttempts.deleteMany({
      where: { createdAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
  }

  async changeStatusObjects() {
    await prisma.object.updateMany({
      where: {
        isActive: true,
        endDate: { lte: new Date() },
        status: { notIn: ["COMPLETED", "LATE"] },
      },
      data: { status: "LATE" },
    });
  }

  async changeStatusDebts() {
    await prisma.debt.updateMany({
      where: {
        isActive: true,
        dueAt: { lte: new Date() },
        status: { notIn: ["CLOSED", "OVERPAID", "OVERDUE"] },
      },
      data: { status: "OVERDUE" },
    });
  }

  async checkInvoicesStatus() {
    const now = new Date();
    const lastDateOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 25);
    lastDateOfPreviousMonth.setHours(23, 59, 59, 999);

    await prisma.entry.updateMany({
      where: {
        isActive: true,
        invoiceStatus: "NOT_CLOSED",
        date: { lte: lastDateOfPreviousMonth },
      },
      data: { invoiceStatus: "LATE" },
    });
  }

  async sendBackupDBToTgChannel() {
    const backup = await backupDatabase();
    if (backup) await sendFileToTg(backup.filePath);
    try {
      await fs.promises.unlink(backup.filePath);
    } catch (error) {
      console.log(error);
    }
  }

  async changeStatusLots() {
    const now = new Date();
    const twentyFourHoursLater = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.lot.updateMany({
      where: {
        isActive: true,
        status: { notIn: ["LATE", "ENDED", "SUCCESS"] },
        lotEndDate: { gte: now, lte: twentyFourHoursLater },
      },
      data: { status: "LATE" },
    });

    await prisma.lot.updateMany({
      where: {
        isActive: true,
        status: { notIn: ["ENDED", "SUCCESS"] },
        lotEndDate: { lte: now },
      },
      data: { status: "ENDED" },
    });
  }

  async sendDebtReminderOneDayBefore() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const debts = await prisma.debt.findMany({
      where: {
        isActive: true,
        dueAt: {
          gte: today,
          lte: tomorrow,
        },
        type: "LENT",
        smsBefore: true,
        status: { in: ["OPEN", "PARTIAL"] },
      },
    });

    const debterPhones = debts.map((d) => d.counterpartyPhone).filter((p) => !!p);
    // await Promise.all(debterPhones.map(async phone => await SMS.send(phone, ``)))
  }

  async sendOverdueDebtReminderSms() {
    const debts = await prisma.debt.findMany({
      where: {
        isActive: true,
        smsLate: true,
        status: { in: ["OVERDUE"] },
      },
    });

    const debterPhones = debts.map((d) => d.counterpartyPhone).filter((p) => !!p);
    // await Promise.all(debterPhones.map(async phone => await SMS.send(phone, ``)))
  }

  async callDebtorOneDayBeforeDueDate() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const debts = await prisma.debt.findMany({
      where: {
        isActive: true,
        dueAt: {
          gte: today,
          lte: tomorrow,
        },
        callBefore: true,
        type: "LENT",
        status: { in: ["OPEN", "PARTIAL"] },
      },
    });

    const debterPhones = debts.map((d) => d.counterpartyPhone).filter((phone) => !!phone);
    await Promise.all(debterPhones.map(async (phone) => await callService.call(phone, "RSQ_DEBT_REMIND")));
  }

  async callOverdueDebtors() {
    const debts = await prisma.debt.findMany({
      where: {
        isActive: true,
        callLate: true,
        status: { in: ["OVERDUE"] },
        type: "LENT",
      },
    });

    const debterPhones = debts.map((d) => d.counterpartyPhone).filter((p) => !!p);
    await Promise.all(debterPhones.map(async (phone) => await callService.call(phone, "RSQ_LATE_DEBT_REMIND")));
  }

  async callLateInvoiceCounterparty() {
    const invoices = await prisma.entry.findMany({
      where: {
        isActive: true,
        type: "EXPENSE",
        invoiceStatus: "LATE",
        ownerPhone: { not: null },
        branch: { isActive: true },
      },
      include: {
        branch: {
          select: {
            stir: true,
          },
        },
      },
    });

    const phonesWithBranchStir = [];
    for (const i of invoices) {
      if (i.ownerPhone) {
        const callType = selectOrg(i.branch.stir);
        const data = { phone: i.ownerPhone, type: callType };
        if (callType && !phonesWithBranchStir.includes(data)) {
          phonesWithBranchStir.push(data);
        }
      }
    }

    const resultForCall = phonesWithBranchStir.filter((d) => !!d && !!d.type);
    await Promise.all(resultForCall.map(async (i) => await callService.call(i.phone, i.type)));
  }

  async callForHappyBirthday() {
    const phones = [];
    const now = new Date();
    const currentBirthday = `${now.getMonth()}-${now.getDate()}`;

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        phone: true,
        birthday: true,
      },
    });

    for (const user of users) {
      const date = user.birthday;
      if (date) {
        const birthday = `${date.getMonth()}-${date.getDate()}`;
        if (currentBirthday === birthday) {
          if (!phones.includes(user.phone)) {
            phones.push(user.phone);
          }
        }
      }
    }

    await Promise.all(phones.map(async (phone) => await callService.call(phone, "HAPPY_BIRTHDAY")));
  }

  async callForHoliday() {
    const now = new Date();
    const currentDay = `${now.getMonth()}-${now.getDate()}`;
    const holiday = selectHoliday(currentDay);
    if (holiday) {
      const phones = [];

      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { phone: true },
      });

      for (const { phone } of users) {
        if (!phones.includes(phone)) {
          phones.push(phone);
        }
      }

      const orgs = await prisma.organization.findMany({
        where: { isActive: true },
        select: { ownerPhone: true, sellerPhone: true },
      });

      for (const { ownerPhone, sellerPhone } of orgs) {
        if (!!ownerPhone && !phones.includes(ownerPhone)) {
          phones.push(ownerPhone);
        }

        if (!!sellerPhone && !phones.includes(sellerPhone)) {
          phones.push(sellerPhone);
        }
      }

      await Promise.all(phones.map(async (phone) => await callService.call(phone, holiday)));
    }
  }

  async callForNewTask() {
    const phones = [];

    const callEvents = await prisma.callEvent.findMany({
      where: { isActive: true, type: "NEW_TASK" },
      include: { user: true },
    });

    const events = callEvents.filter((e) => !!e.user?.isActive);

    if (events.length > 0) {
      for (const {
        id,
        user: { phone },
      } of events) {
        if (!phones.includes()) {
          phones.push(phone);
        }

        await prisma.callEvent.update({
          where: { id },
          data: { isActive: false },
        });
      }
    }

    if (phones.length > 0) {
      await Promise.all(phones.map(async (phone) => await callService.call(phone, "NEW_TASK")));
    }
  }

  async callForNewInbox() {
    const phones = [];

    const callEvents = await prisma.callEvent.findMany({
      where: { isActive: true, type: "NEW_INBOX" },
      include: {
        user: true,
      },
    });

    const events = callEvents.filter((e) => !!e.user?.isActive);

    if (events.length > 0) {
      for (const {
        id,
        user: { phone },
      } of events) {
        if (!phones.includes()) {
          phones.push(phone);
        }

        await prisma.callEvent.update({
          where: { id },
          data: { isActive: false },
        });
      }
    }

    if (phones.length > 0) {
      await Promise.all(phones.map(async (phone) => await callService.call(phone, "NEW_INBOX")));
    }
  }
}

module.exports = new cronService();
