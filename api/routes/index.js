import express from 'express'
import { success } from '../utils/responses.js'
import indexService from '../services/index-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 查询首页数据
 * GET /
 */
router.get('/', async (req, res, next) => {
  const data = await indexService.getIndexData(req)
  success(res, '查询首页数据成功。', formatAttachments(req, data))
})

export default router
