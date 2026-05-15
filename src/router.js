const { undefinedRouteController } = require("./controllers/undefinedRoute.controller");
const { globalErrorHandler } = require("./middlewares/globalErrorHandler");
const { userRouter } = require("./modules/user/user.routes");
const { answerToWorkVolumeRouter } = require("./routes/answerToWorkVolume.routes");
const { attachmentRouter } = require("./routes/attachment.routes");
const { authRouter } = require("./routes/auth.routes");
const { avatarRouter } = require("./routes/avatar.routes");
const { branchRouter } = require("./routes/branch.routes");
const { catalogRouter } = require("./routes/catalog.routes");
const { debtRouter } = require("./routes/debt.routes");
const { entryRouter } = require("./routes/entry.routes");
const { fileRouter } = require("./routes/file.routes");
const { fundTransferRouter } = require("./routes/fundTransfer.routes");
const { inventoryRouter } = require("./routes/inventory.routes");
const { lotRouter } = require("./routes/lot.routes");
const { objectRouter } = require("./routes/object.routes");
const { organizationRouter } = require("./routes/organization.routes");
const { permissionRouter } = require("./routes/permission.routes");
const { profileRouter } = require("./routes/profile.routes");
const { salaryRouter } = require("./routes/salary.routes");
const { taskRouter } = require("./routes/task.routes");
const { transactionRouter } = require("./routes/transaction.routes");
const { warehouseRouter } = require("./routes/warehouse.routes");
const { workVolumeRouter } = require("./routes/workVolume.routes");

const Router = (app) => {
  app
    .get("/", (_, res) => res.status(200).json({ message: `Hi, I'am server!` }))
    .use("/file", fileRouter)
    .use("/api/answers-to-work-volumes", answerToWorkVolumeRouter)
    .use("/api/attachments", attachmentRouter)
    .use("/api/auth", authRouter)
    .use("/api/avatar", avatarRouter)
    .use("/api/branches", branchRouter)
    .use("/api/catalog", catalogRouter)
    .use("/api/debts", debtRouter)
    .use("/api/fund-transfers", fundTransferRouter)
    .use("/api/ie", entryRouter)
    .use("/api/inventory", inventoryRouter)
    .use("/api/lots", lotRouter)
    .use("/api/objects", objectRouter)
    .use("/api/organizations", organizationRouter)
    .use("/api/permissions", permissionRouter)
    .use("/api/profile", profileRouter)
    .use("/api/salaries", salaryRouter)
    .use("/api/tasks", taskRouter)
    .use("/api/transactions", transactionRouter)
    .use("/api/users", userRouter)
    .use("/api/warehouse", warehouseRouter)
    .use("/api/work-volumes", workVolumeRouter)
    .use(undefinedRouteController)
    .use(globalErrorHandler);
};

module.exports = Router;
