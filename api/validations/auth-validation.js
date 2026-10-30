import { z } from 'zod'
import createError from 'http-errors'

const { BadRequest } = createError

// 用户注册验证规则
export const signUpSchema = z.object({
  username: z
    .string({
      required_error: '用户名不能为空。',
    })
    .min(4, '用户名至少需要4个字符。')
    .max(20, '用户名不能超过20个字符。')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线。'),
  password: z
    .string({
      required_error: '密码不能为空。',
    })
    .min(6, '密码至少需要6个字符。')
    .max(20, '密码不能超过20个字符。'),
  email: z
    .email('请输入有效的邮箱地址。'),
  nickname: z
    .string({
      required_error: '昵称不能为空。',
    })
    .min(1, '请输入昵称。')
    .max(20, '昵称不能超过20个字符。'),
  avatar: z.string().optional(),
  bio: z.string().max(200, '个人简介不能超过200个字符。').optional(),
})

// 用户登录验证规则
export const signInSchema = z.object({
  login: z
    .string({
      required_error: '邮箱/用户名必须填写。',
    })
    .min(1, '请输入用户名。'),
  password: z
    .string({
      required_error: '密码必须填写。',
    })
    .min(1, '请输入密码。'),
})

// 用户注册验证函数
export const validateSignUp = (data) => {
  if (!data) throw new BadRequest('您没有提交数据。')
  return signUpSchema.parse(data)
}

// 用户登录验证函数
export const validateSignIn = (data) => {
  if (!data) throw new BadRequest('您没有提交数据。')
  return signInSchema.parse(data)
}
