import bcrypt from 'bcryptjs'
import createError from 'http-errors'
import prisma from '../prisma/prisma.js'
import {
  validateUpdateUserInfo,
  validateUpdateUserAccount,
} from '../validations/user-validation.js'

const { BadRequest, NotFound } = createError

class UserService {
  /**
   * 获取用户信息
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户信息
   */
  async getUser(userId) {
    const condition = {
      where: { id: userId },
      omit: {
        deleted: true,
      },
    }

    const user = await prisma.user.findUnique(condition)
    if (!user) {
      throw new NotFound(`ID 为 ${userId} 的用户未找到。`)
    }

    return { user }
  }

  /**
   * 获取教师信息
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户信息
   */
  async getTeacher(userId) {
    const condition = {
      where: {
        id: userId,
        role: 100,
      },
      omit: {
        deleted: true,
        password: true,
        role: true,
      },
    }

    const user = await prisma.user.findFirst(condition)
    if (!user) {
      throw new NotFound(`ID 为 ${userId} 的用户未找到。`)
    }

    return { user }
  }

  /**
   * 更新用户基本信息
   * @param {number} userId - 用户ID
   * @param {Object} data - 用户信息
   * @returns {Promise<Object>} 更新后的用户信息
   */
  async updateUserInfo(userId, data) {
    const validatedData = validateUpdateUserInfo(data)
    await this.getUser(userId)

    // 更新用户基本信息
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        nickname: validatedData.nickname,
        sex: validatedData.sex && Number(validatedData.sex),
        company: validatedData.company,
        bio: validatedData.bio,
        avatar: validatedData.avatar,
      },
    })

    delete user.password
    return { user }
  }

  /**
   * 更新用户账户信息
   * @param {number} userId - 用户ID
   * @param {Object} data - 账户信息
   * @returns {Promise<Object>} 更新后的用户信息
   */
  async updateUserAccount(userId, data) {
    const validatedData = validateUpdateUserAccount(data)
    const { user } = await this.getUser(userId)

    // 验证当前密码
    const isPasswordValid = bcrypt.compareSync(validatedData.currentPassword, user.password)
    if (!isPasswordValid) {
      throw new BadRequest('当前密码不正确。')
    }

    // 检查用户名是否已存在
    if (validatedData.username) {
      const existingUser = await prisma.user.findFirst({
        where: { username: validatedData.username, id: { not: userId } },
      })
      if (existingUser) throw new BadRequest('用户名已存在。')
    }

    // 检查邮箱是否已存在
    if (validatedData.email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: validatedData.email, id: { not: userId } },
      })
      if (existingEmail) throw new BadRequest('邮箱已存在。')
    }

    // 更新用户账户
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email: validatedData.email,
        username: validatedData.username,
        password: validatedData.password ? bcrypt.hashSync(validatedData.password, 10) : undefined,
      },
    })

    delete updatedUser.password
    return { user: updatedUser }
  }

  /**
   * 注销账户（软删除）
   * @param {number} userId - 用户ID
   * @returns {Promise<void>}
   */
  async deleteUser(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        deleted: true,
      },
    })
  }
}

export default new UserService()
