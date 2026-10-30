import express from 'express'
import { success } from '../utils/responses.js'
import userService from '../services/user-service.js'
import { formatAttachments } from '../utils/attachments.js'

const router = express.Router()

/**
 * 查询当前登录用户详情
 * GET /users/me
 */
router.get('/me', async function (req, res) {
  const { user } = await userService.getUser(req.user.id)
  delete user.password
  const userRoles = {
    0: {
      name: '免费会员',
      color: '#d3d7e0'
    },
    1: {
      name: '大会员',
      color: '#f2c802'
    },
    100: {
      name: '管理员',
      color: '#ff7f6f'
    },
  }
  user.roleName = userRoles[user.role].name
  user.roleColor = userRoles[user.role].color

  const sex = {
    0: '男',
    1: '女',
    2: '未选择'
  }
  user.sexName = sex[user.sex]
  success(res, '查询当前用户信息成功。', { user: formatAttachments(req, user) })
})

/**
 * 更新用户信息
 * PUT /users/info
 */
router.put('/info', async function (req, res) {
  const data = await userService.updateUserInfo(req.user.id, req.body)
  success(res, '更新用户信息成功。', formatAttachments(req, data))
})

/**
 * 更新账户信息
 * PUT /users/account
 */
router.put('/account', async function (req, res) {
  const data = await userService.updateUserAccount(req.user.id, req.body)
  success(res, '更新账户信息成功。', formatAttachments(req, data))
})

/**
 * 注销账户
 * DELETE /users/me
 */
router.delete('/me', async function (req, res) {
  await userService.deleteUser(req.user.id)
  success(res, '注销账户成功。')
})

export default router
