import prisma from '../prisma/prisma.js'

class SearchService {
  /**
   * 搜索课程
   * @param {Object} params - 搜索参数
   * @param {string} params.q - 搜索关键词
   * @param {number} params.page - 当前页码
   * @param {number} params.limit - 每页数量
   * @param {number} params.skip - 跳过的记录数
   * @returns {Promise<Object>} 搜索结果和分页信息
   */
  async searchCourses({ q, page, limit, skip }) {
    const condition = {
      omit: { content: true },
      where: {},
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
      take: limit,
      skip: skip,
    }

    if (q) {
      condition.where.name = {
        contains: q,
      }
    }

    const [courses, total] = await prisma.$transaction([
      prisma.course.findMany(condition),
      prisma.course.count({ where: condition.where }),
    ])

    return {
      courses,
      pagination: {
        page,
        limit,
        total,
      },
    }
  }
}

export default new SearchService()
