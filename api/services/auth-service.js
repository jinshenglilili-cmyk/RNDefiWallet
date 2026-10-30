import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../prisma/prisma.js'
import { validateSignUp, validateSignIn } from '../validations/auth-validation.js'
import createError from 'http-errors'

const { BadRequest, NotFound, Unauthorized } = createError

class AuthService {
  /**
   * 用户注册
   * @param {Object} data - 用户注册数据
   * @returns {Promise<Object>} 注册成功的用户信息
   */
  async signUp(data) {
    // 验证注册数据
    const validatedData = validateSignUp(data)

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username: validatedData.username },
    })
    if (existingUser) throw new BadRequest('用户名已存在。')

    // 检查邮箱是否已存在
    const existingEmail = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })
    if (existingEmail) throw new BadRequest('邮箱已存在，请直接登录。')

    // 加密密码
    const hashedPassword = await bcrypt.hash(validatedData.password, 10)

    // 创建用户
    const user = await prisma.user.create({
      data: {
        ...validatedData,
        password: hashedPassword,
      },
    })

    // 生成 JWT token
    const token = jwt.sign(
      {
        userId: user.id,
      },
      process.env.SECRET,
      {
        expiresIn: '7d',
      },
    )

    return { token }
  }

  /**
   * 用户登录
   * @param {Object} data - 用户登录数据
   * @returns {Promise<Object>} 登录成功后的token
   */
  async signIn(data) {
    // 验证登录数据
    const validatedData = validateSignIn(data)

    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: validatedData.login }, { username: validatedData.login }],
      },
    })

    if (!user) {
      throw new NotFound('用户不存在，请先注册后再登录。')
    }

    if (user.deleted) {
      throw new NotFound('用户已注销，请注册新账号后再登录。')
    }

    // 验证密码
    const isMatch = await bcrypt.compare(validatedData.password, user.password)
    if (!isMatch) {
      throw new Unauthorized('密码错误。')
    }

    // 生成 JWT token
    const token = jwt.sign(
      {
        userId: user.id,
      },
      process.env.SECRET,
      {
        expiresIn: '7d',
      },
    )

    return { token }
  }
}

export default new AuthService()
