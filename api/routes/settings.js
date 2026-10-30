import express from 'express'
import { success } from '../utils/responses.js'
import settingService from '../services/setting-service.js'

const router = express.Router()

/**
 * 查询系统信息
 * GET /admin/settings
 */
router.get('/', async (req, res, next) => {
  const data = await settingService.getSettings()
  success(res, '查询系统信息成功。', data)
})

export default router
