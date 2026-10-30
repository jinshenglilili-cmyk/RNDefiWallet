import createError from 'http-errors'
import jwt from 'jsonwebtoken'
import prisma from '../prisma/prisma.js'

const { Unauthorized } = createError

export default async (req, res, next) => {
  // 测试 token 过期时，使用以下这行
  // throw new Unauthorized('当前接口需要认证才能访问。')

  // 判断 Authorization 头是否存在
  const authHeader = req.headers.authorization
  if (!authHeader) {
    throw new Unauthorized('当前接口需要认证才能访问。')
  }

  // 检查 Authorization 头是否以 Bearer 开头
  const authHeaderParts = authHeader.split(' ')
  if (authHeaderParts[0] !== 'Bearer' || !authHeaderParts[1]) {
    throw new Unauthorized('无效的 token 格式。')
  }

  // 提取 token
  const token = authHeader.split(' ')[1]

  // 验证 token 是否正确
  const decoded = jwt.verify(token, process.env.SECRET)

  // 从 jwt 中，解析出之前存入的 userId
  const { userId } = decoded

  // 查询一下，当前用户
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      deleted: false,
    },
  })

  if (!user) {
    throw new Unauthorized('用户不存在。')
  }

  // 如果通过验证，将 user 对象挂载到 req 上，方便后续中间件或路由使用
  delete user.password
  req.user = user

  // 一定要加 next()，才能继续进入到后续中间件或路由
  next()
}
