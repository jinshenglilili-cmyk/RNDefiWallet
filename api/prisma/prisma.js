import { PrismaClient } from './generated/prisma/client.js'
import { format } from 'sql-formatter'
import dayjs from 'dayjs'

// 初始化 prisma
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
  ],
})

// 打印 SQL
prisma.$on('query', (e) => {
  const sql = format(e.query, {
    params: e.params,
    language: 'sqlite',
  })
  console.log('SQL: ' + sql + '\n')
})

// 格式化数据
const extendedPrisma = prisma.$extends({
  result: {
    $allModels: {
      createdAt: {
        needs: { createdAt: true },
        compute(model) {
          return model.createdAt ? dayjs(model.createdAt).format('YYYY-MM-DD HH:mm:ss') : null
        },
      },
      updatedAt: {
        needs: { updatedAt: true },
        compute(model) {
          return model.updatedAt ? dayjs(model.updatedAt).format('YYYY-MM-DD HH:mm:ss') : null
        },
      },
    },
  },
})

export default extendedPrisma
