const taskController = require("../controllers/task.controller");
const Permissions = require("../constants/PermissionEnum");
const { Role } = require("../generated/prisma");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
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
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.task_crud), taskCreateValidatorMiddlewareV2, taskController.createOne)
  .post("/sub-task", checkPermissionMiddleware(Permissions.task_crud), upload.array("files"), subTaskCreateValidatorMiddleware, taskController.createOneSubTask)
  .put("/sub-task/:id", checkPermissionMiddleware(Permissions.task_crud), subtaskUpdateValidatorMiddleware, taskController.updateOneSubTask)
  .post("/task-history", upload.array("files"), taskHistoryCreateValidatorMiddleware, taskController.createTaskHistory, uploadMultipleFiles, taskController.uploadTaskHistoryAttachment)
  .put("/task-history/:id", taskHistoryUpdateValidatorMiddleware, taskController.updateOneTaskHistory)
  .delete("/task-history/:id", taskController.deleteOneTaskHistory)
  .patch("/sub-task/:id", taskController.changeStatusByWorker)
  .patch("/sub-task/:id/start", taskController.changeSubTaskToInProgress)
  .patch("/sub-task/:id/check", checkRoleMiddleware(Role.SUPERADMIN), taskController.checkTheSubTask)
  .delete("/sub-task/:id", checkPermissionMiddleware(Permissions.task_crud), taskController.deleteOneSubTask)
  .get("/sub-task/:id", checkPermissionMiddleware(Permissions.task_crud), taskController.getOneSubTask)
  .get("/user-office-tasks", taskController.getUserOfficeTasks)
  .get("/user-office-tasks/get-excel-doc", taskController.getUserOfficeTasksExcelDoc)
  .get("/user-parent-tasks", taskController.getUserParentTasks)
  .get("/user-parent-tasks/get-excel-doc", taskController.getUserParentTasksExcelDoc)
  .get("/user-parent-tasks/:id", taskController.getUserParentTaskById)
  .get("/user-parent-tasks/:id/get-excel-doc", taskController.getUserOneTaskExcelDoc)
  .get("/user-tasks", taskController.getUserTasks)
  .get("/user-tasks/:id", taskController.getOneUserTask)
  .get("/", checkPermissionMiddleware(Permissions.task_crud), taskController.getAll)
  .get("/get-excel-doc", checkPermissionMiddleware(Permissions.task_crud), taskController.getExcelDoc)
  .get("/office-tasks", checkPermissionMiddleware(Permissions.office_task_crud), taskController.getAllOfficeTasks)
  .get("/get-office-tasks-excel-doc", checkPermissionMiddleware(Permissions.office_task_crud), taskController.getOfficeTasksExcelDoc)
  .get("/search", checkPermissionMiddleware(Permissions.task_crud), taskController.search)
  .get("/trash", checkRoleMiddleware(Role.SUPERADMIN), taskController.getDeleted)
  .post("/comment", taskCommentCreateValidatorMiddleware, taskController.createTaskComment)
  .post("/sa-comment", checkPermissionMiddleware(Permissions.task_crud), taskCommentFromSAToWorkerValidatorMiddleware, taskController.createCommentFromSA)
  .delete("/comment/:id", taskController.deleteOneComment)
  .patch("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), taskController.restoreOne)
  .delete("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), taskController.absoluteDelete)
  .patch("/:id/check", checkRoleMiddleware(Role.SUPERADMIN), taskController.checkTheTask)
  .get("/:id", checkPermissionMiddleware(Permissions.task_crud), taskController.getOne)
  .get("/:id/get-excel-doc", checkPermissionMiddleware(Permissions.task_crud), taskController.getOneTaskExcelDoc)
  .put("/:id", checkPermissionMiddleware(Permissions.task_crud), taskUpdateValidatorMiddlewareV2, taskController.updateOne)
  .patch("/:id", checkPermissionMiddleware(Permissions.task_crud), taskStatusUpdateValidatorMiddleware, taskController.updateTaskStatus)
  .delete("/:id", checkPermissionMiddleware(Permissions.task_crud), taskController.deleteOne);

module.exports = { taskRouter };
