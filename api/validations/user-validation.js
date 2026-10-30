import { z } from 'zod'
import createError from 'http-errors'

const { BadRequest } = createError

// 更新用户基本信息验证规则
export const updateUserInfoSchema = z.object({
  nickname: z
    .string({
      required_error: '昵称必须填写。',
    })
    .min(2, '昵称至少需要2个字符。')
    .max(20, '昵称不能超过20个字符。')
    .optional(),
  sex: z
    .enum(['0', '1', '2'], {
      errorMap: () => ({ message: '性别值无效。' }),
    })
    .optional(),
  company: z.string().max(100, '公司名称不能超过100个字符。').optional(),
  bio: z.string().max(500, '个人简介不能超过500个字符。').optional(),
  avatar: z.string().optional(),
})

// 更新用户账户信息验证规则
export const updateUserAccountSchema = z
  .object({
    currentPassword: z
      .string({
        required_error: '当前密码必须填写。',
      })
      .min(1, '请输入当前密码。'),
    email: z.string().email('请输入有效的邮箱地址。').optional(),
    username: z
      .string()
      .min(3, '用户名至少需要3个字符。')
      .max(20, '用户名不能超过20个字符。')
      .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符。')
      .optional(),
    password: z.string().min(6, '密码至少需要6个字符。').optional(),
    passwordConfirmation: z.string().optional(),
  })
  .refine(
    (data) => {
      return !(data.password && data.password !== data.passwordConfirmation)
    },
    {
      message: '两次输入的密码不一致。',
      path: ['passwordConfirmation'],
    },
  )

// 更新用户基本信息验证函数
export const validateUpdateUserInfo = (data) => {
  if (!data) throw new BadRequest('您没有提交数据。')
  return updateUserInfoSchema.parse(data)
}

// 更新用户账户信息验证函数
export const validateUpdateUserAccount = (data) => {
  if (!data) throw new BadRequest('您没有提交数据。')
  return updateUserAccountSchema.parse(data)
}
