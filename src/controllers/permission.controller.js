const Permissions = require("../enums/PermissionEnum");

const permissionController = {
  getAll(_req, res, _next) {
    res.status(200).json({
      permissions: Permissions,
    });
  },
};

module.exports = permissionController;
