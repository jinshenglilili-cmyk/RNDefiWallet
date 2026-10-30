import express from 'express'
import { success } from '../utils/responses.js'
import authService from '../services/auth-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 用户注册
 * POST /auth/sign_up
 */
router.post('/sign_up', async function (req, res) {
  const data = await authService.signUp(req.body)
  success(res, '创建用户成功。', formatAttachments(req, data), 201)
})

/**
 * 用户登录
 * POST /auth/sign_in
 */
router.post('/sign_in', async (req, res) => {
  const data = await authService.signIn(req.body)
  success(res, '登录成功。', data)
})

export default router
