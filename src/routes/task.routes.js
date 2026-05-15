const taskController = require("../controllers/task.controller");
const Permissions = require("../constants/permission");
const { Role } = require("../generated/prisma");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { subTaskCreateValidatorMiddleware } = require("../middlewares/validators/task/subTaskCreateValidatorMiddleware");
const { subtaskUpdateValidatorMiddleware } = require("../middlewares/validators/task/subtaskUpdateValidatorMiddleware");
const { taskCreateValidatorMiddlewareV2 } = require("../middlewares/validators/task/taskCreateValidatorMiddlewareV2");
const { taskHistoryCreateValidatorMiddleware } = require("../middlewares/validators/task/taskHistoryCreateValidatorMiddleware");
const { taskHistoryUpdateValidatorMiddleware } = require("../middlewares/validators/task/taskHistoryUpdateValidatorMiddleware");
const { taskStatusUpdateValidatorMiddleware } = require("../middlewares/validators/task/taskStatusUpdateValidatorMiddleware");
const { taskUpdateValidatorMiddlewareV2 } = require("../middlewares/validators/task/taskUpdateValidatorMiddlewareV2");
const { taskCommentCreateValidatorMiddleware } = require("../middlewares/validators/taskComment/taskCommentCreateValidatorMiddleware");
const { taskCommentFromSAToWorkerValidatorMiddleware } = require("../middlewares/validators/taskComment/taskCommentFromSAToWorkerValidatorMiddleware");
const upload = require("../utils/multer");
const taskRouter = require("express").Router();

taskRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.task_crud), taskCreateValidatorMiddlewareV2, taskController.createOne)
  .post("/sub-task", checkPermission(Permissions.task_crud), upload.array("files"), subTaskCreateValidatorMiddleware, taskController.createOneSubTask)
  .put("/sub-task/:id", checkPermission(Permissions.task_crud), subtaskUpdateValidatorMiddleware, taskController.updateOneSubTask)
  .post("/task-history", upload.array("files"), taskHistoryCreateValidatorMiddleware, taskController.createTaskHistory, uploadMultipleFiles, taskController.uploadTaskHistoryAttachment)
  .put("/task-history/:id", taskHistoryUpdateValidatorMiddleware, taskController.updateOneTaskHistory)
  .delete("/task-history/:id", taskController.deleteOneTaskHistory)
  .patch("/sub-task/:id", taskController.changeStatusByWorker)
  .patch("/sub-task/:id/start", taskController.changeSubTaskToInProgress)
  .patch("/sub-task/:id/check", checkRole(Role.SUPERADMIN), taskController.checkTheSubTask)
  .delete("/sub-task/:id", checkPermission(Permissions.task_crud), taskController.deleteOneSubTask)
  .get("/sub-task/:id", checkPermission(Permissions.task_crud), taskController.getOneSubTask)
  .get("/user-office-tasks", taskController.getUserOfficeTasks)
  .get("/user-office-tasks/get-excel-doc", taskController.getUserOfficeTasksExcelDoc)
  .get("/user-parent-tasks", taskController.getUserParentTasks)
  .get("/user-parent-tasks/get-excel-doc", taskController.getUserParentTasksExcelDoc)
  .get("/user-parent-tasks/:id", taskController.getUserParentTaskById)
  .get("/user-parent-tasks/:id/get-excel-doc", taskController.getUserOneTaskExcelDoc)
  .get("/user-tasks", taskController.getUserTasks)
  .get("/user-tasks/:id", taskController.getOneUserTask)
  .get("/", checkPermission(Permissions.task_crud), taskController.getAll)
  .get("/get-excel-doc", checkPermission(Permissions.task_crud), taskController.getExcelDoc)
  .get("/office-tasks", checkPermission(Permissions.office_task_crud), taskController.getAllOfficeTasks)
  .get("/get-office-tasks-excel-doc", checkPermission(Permissions.office_task_crud), taskController.getOfficeTasksExcelDoc)
  .get("/search", checkPermission(Permissions.task_crud), taskController.search)
  .get("/trash", checkRole(Role.SUPERADMIN), taskController.getDeleted)
  .post("/comment", taskCommentCreateValidatorMiddleware, taskController.createTaskComment)
  .post("/sa-comment", checkPermission(Permissions.task_crud), taskCommentFromSAToWorkerValidatorMiddleware, taskController.createCommentFromSA)
  .delete("/comment/:id", taskController.deleteOneComment)
  .patch("/trash/:id", checkRole(Role.SUPERADMIN), taskController.restoreOne)
  .delete("/trash/:id", checkRole(Role.SUPERADMIN), taskController.absoluteDelete)
  .patch("/:id/check", checkRole(Role.SUPERADMIN), taskController.checkTheTask)
  .get("/:id", checkPermission(Permissions.task_crud), taskController.getOne)
  .get("/:id/get-excel-doc", checkPermission(Permissions.task_crud), taskController.getOneTaskExcelDoc)
  .put("/:id", checkPermission(Permissions.task_crud), taskUpdateValidatorMiddlewareV2, taskController.updateOne)
  .patch("/:id", checkPermission(Permissions.task_crud), taskStatusUpdateValidatorMiddleware, taskController.updateTaskStatus)
  .delete("/:id", checkPermission(Permissions.task_crud), taskController.deleteOne);

module.exports = { taskRouter };
