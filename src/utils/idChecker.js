exports.idChecker = (paramsId) => {
  const id = Number(paramsId);
  if (Number.isNaN(id) || id <= 0) return;
  return id;
};
