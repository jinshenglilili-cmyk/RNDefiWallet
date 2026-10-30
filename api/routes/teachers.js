import express from 'express'
import { success } from '../utils/responses.js'
import userService from '../services/user-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 查询当前登录用户详情
 * GET /teachers/1
 */
router.get('/:id', async function (req, res) {
  const { user } = await userService.getTeacher(req.query.id)
  success(res, '查询当前用户信息成功。', { user: formatAttachments(req, user) })
})

export default router
