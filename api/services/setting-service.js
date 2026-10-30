import createError from 'http-errors'
import prisma from '../prisma/prisma.js'

const { NotFound } = createError

class SettingService {
  /**
   * 获取系统设置
   * @returns {Promise<Object>} 系统设置信息
   */
  async getSettings() {
    const setting = await prisma.setting.findFirst({})
    if (!setting) {
      throw new NotFound('未找到系统设置，请联系管理员。')
    }

    return { setting }
  }
}

export default new SettingService()
