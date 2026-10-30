import prisma from '../prisma/prisma.js'
import { formatAttachments } from '../utils/attachments.js'

class IndexService {
  /**
   * 获取首页数据
   * @param {Object} req - 请求对象
   * @returns {Promise<Object>} 首页数据
   */
  async getIndexData(req) {
    const [recommendedCourses, likesCourses, introductoryCourses] = await Promise.all([
      // 焦点图（推荐的课程）
      prisma.course.findMany({
        ...this.getCondition(),
        where: { recommended: true },
      }),

      // 人气课程
      prisma.course.findMany({
        ...this.getCondition(),
        orderBy: [{ likesCount: 'desc' }, { id: 'desc' }],
      }),

      // 入门课程
      prisma.course.findMany({
        ...this.getCondition(),
        where: { introductory: true },
      }),
    ])

    return {
      recommendedCourses,
      likesCourses,
      introductoryCourses,
    }
  }

  /**
   * 获取查询条件
   * @returns {Object} 查询条件
   */
  getCondition() {
    return {
      omit: { content: true },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
            company: true,
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 10,
    }
  }
}

export default new IndexService()
