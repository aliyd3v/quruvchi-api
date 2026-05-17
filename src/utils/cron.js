const cron = require("node-cron");
const cronService = require("../services/cron.service");

const timezone = "Asia/Tashkent";

async function cronJobs() {
  cron.schedule(
    "0 */1 * * *",
    async () => {
      try {
        await cronService.checkUserCurrentSalaryMonth();
        await cronService.checkTasksStatus();
        await cronService.clearLastWeekResetAuthAttempts();
        await cronService.changeStatusObjects();
        await cronService.changeStatusDebts();
        await cronService.checkInvoicesStatus();
        await cronService.changeStatusLots();
      } catch (error) {
        console.log("ERROR ON CRON WORKS", error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "0 0 */1 * *",
    async () => {
      try {
        // await cronService.sendBackupDBToTgChannel();
      } catch (error) {
        console.log("ERROR ON BAKCUP DATABSE", error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "0 9 */1 * *",
    async () => {
      try {
        await cronService.sendDebtReminderOneDayBefore();
      } catch (error) {
        console.log(error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "0 9 */1 * *",
    async () => {
      try {
        await cronService.sendOverdueDebtReminderSms();
      } catch (error) {
        console.log(error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "0 10 */1 * *",
    async () => {
      try {
        await cronService.callDebtorOneDayBeforeDueDate();
      } catch (error) {
        console.log(error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "10 10 */1 * *",
    async () => {
      try {
        await cronService.callOverdueDebtors();
      } catch (error) {
        console.log(error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "45 9 */1 * *",
    async () => {
      try {
        await cronService.callLateTaskAssigneds();
      } catch (error) {
        console.log(error);
      }
    },
    { timezone },
  );

  cron.schedule(
    "20 10 */1 * *",
    async () => {
      await cronService.callLateInvoiceCounterparty();
    },
    { timezone },
  );

  cron.schedule(
    "0 13 */1 * *",
    async () => {
      await cronService.callForHappyBirthday();
    },
    { timezone },
  );

  cron.schedule(
    "25 12 */1 * *",
    async () => {
      await cronService.callForHoliday();
    },
    { timezone },
  );

  cron.schedule(
    "30 9 */1 * *",
    async () => {
      await cronService.callForNewTask();
    },
    { timezone },
  );
}

module.exports = { cronJobs };
