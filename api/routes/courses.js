import express from 'express'
import { success } from '../utils/responses.js'
import courseService from '../services/course-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 查询课程详情
 * GET /courses/:id
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const authHeader = req.headers.authorization
  const data = await courseService.getCourseDetail(id, authHeader)
  success(res, '查询课程详情成功。', formatAttachments(req, data))
})

export default router
