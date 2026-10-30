/**
 * 获取分页参数
 * @param req
 * @returns {{page: number | number, limit: number | number, skip: number}}
 */
function getPagination(req) {
  let { page, limit } = req.query
  page = Math.abs(Number(page)) || 1
  limit = Math.abs(Number(limit)) || 10
  const skip = (page - 1) * limit

  return { page, limit, skip }
}

export default getPagination
